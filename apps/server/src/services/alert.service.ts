import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import { events } from './events.js';
import { notifierService } from './notifier.service.js';
import type { AlertEventDTO, AlertMetric, AlertRuleDTO } from '@server-console/shared';

const METRIC_COLUMN: Record<AlertMetric, string> = {
  cpu: 'cpu',
  mem: 'mem',
  disk: 'disk',
  load: 'load1',
  offline: 'available',
};

const METRIC_LABEL: Record<AlertMetric, string> = {
  cpu: 'CPU usage',
  mem: 'Memory usage',
  disk: 'Disk usage',
  load: 'Load average (1m)',
  offline: 'Server unreachable',
};

const METRIC_UNIT: Record<AlertMetric, string> = { cpu: '%', mem: '%', disk: '%', load: '', offline: '' };

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export class AlertService {
  listRules(): AlertRuleDTO[] {
    return getDatabase()
      .query<any>('SELECT * FROM alert_rules ORDER BY created_at')
      .map((r) => this.ruleToDTO(r));
  }

  createRule(input: {
    name: string;
    serverId?: string | null;
    metric: AlertMetric;
    threshold: number;
    durationMin: number;
    channelIds: string[];
  }): AlertRuleDTO {
    if (!(input.metric in METRIC_COLUMN)) throw badRequest('Unknown metric');
    if (!Number.isFinite(input.threshold)) throw badRequest('Threshold must be a number');
    const durationMin = Math.min(Math.max(Math.floor(input.durationMin), 0), 1440);
    const id = crypto.randomUUID();
    getDatabase().run(
      `INSERT INTO alert_rules (id, name, server_id, metric, threshold, duration_min, channel_ids, is_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id,
        input.name.slice(0, 80),
        input.serverId || null,
        input.metric,
        input.metric === 'offline' ? 0.5 : input.threshold,
        durationMin,
        input.channelIds.join(','),
        new Date().toISOString(),
      ]
    );
    return this.ruleToDTO(getDatabase().get<any>('SELECT * FROM alert_rules WHERE id = ?', [id]));
  }

  setRuleEnabled(id: string, enabled: boolean): boolean {
    return getDatabase().run('UPDATE alert_rules SET is_enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]).changes > 0;
  }

  deleteRule(id: string): boolean {
    return getDatabase().run('DELETE FROM alert_rules WHERE id = ?', [id]).changes > 0;
  }

  listEvents(limit = 50): AlertEventDTO[] {
    return getDatabase()
      .query<any>('SELECT * FROM alert_events ORDER BY started_at DESC LIMIT ?', [Math.min(limit, 500)])
      .map((r) => ({
        id: r.id,
        ruleId: r.rule_id,
        serverId: r.server_id,
        ruleName: r.rule_name,
        serverName: r.server_name,
        metric: r.metric,
        threshold: r.threshold,
        peakValue: r.peak_value,
        startedAt: r.started_at,
        resolvedAt: r.resolved_at,
      }));
  }

  /**
   * Evaluates every rule that applies to the server against stored samples. A rule is breaching when
   * every sample in its duration window violates the threshold AND the window is actually covered by
   * data (so a freshly started collector cannot fire a "5 minutes" alert after one sample).
   */
  async evaluate(serverId: string, serverName: string, intervalMs: number): Promise<void> {
    const db = getDatabase();
    const rules = db
      .query<any>('SELECT * FROM alert_rules WHERE is_enabled = 1 AND (server_id IS NULL OR server_id = ?)', [serverId])
      .map((r) => this.ruleToDTO(r));

    for (const rule of rules) {
      const col = METRIC_COLUMN[rule.metric];
      const windowMs = rule.durationMin * 60_000;
      const now = Date.now();
      const samples = db.query<any>(
        `SELECT ts, available, ${col} AS v FROM metric_samples WHERE server_id = ? AND ts >= ? ORDER BY ts`,
        [serverId, now - windowMs - intervalMs]
      );
      if (samples.length === 0) continue;

      // "offline" is evaluated on availability; other metrics ignore unreachable samples.
      const value = (s: any): number | null => (rule.metric === 'offline' ? (s.available ? 0 : 1) : s.available ? s.v : null);
      const relevant = samples.map((s) => ({ ts: s.ts, v: value(s) }));
      const covered = windowMs === 0 || relevant[0].ts <= now - windowMs + intervalMs * 0.25;
      const breaching =
        covered &&
        relevant.every((s) => s.v !== null && s.v > rule.threshold) &&
        relevant.some((s) => s.ts >= now - windowMs - 1);

      const open = db.get<any>(
        'SELECT * FROM alert_events WHERE rule_id = ? AND server_id = ? AND resolved_at IS NULL',
        [rule.id, serverId]
      );
      const latest = relevant[relevant.length - 1].v;

      if (breaching && !open) {
        const peak = Math.max(...relevant.map((s) => s.v ?? 0));
        const eventId = crypto.randomUUID();
        db.run(
          `INSERT INTO alert_events (id, rule_id, server_id, rule_name, server_name, metric, threshold, peak_value, started_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [eventId, rule.id, serverId, rule.name, serverName, rule.metric, rule.threshold, peak, new Date().toISOString()]
        );
        events.emit('alert.fired', { eventId, ruleName: rule.name, serverId, serverName, metric: rule.metric, value: latest ?? peak, threshold: rule.threshold });
        await notifierService.broadcast(rule.channelIds, {
          severity: 'critical',
          title: `ALERT: ${rule.name} - ${serverName}`,
          body:
            rule.metric === 'offline'
              ? `${serverName} has been unreachable${rule.durationMin ? ` for ${rule.durationMin} min` : ''}.`
              : `${METRIC_LABEL[rule.metric]} is ${latest}${METRIC_UNIT[rule.metric]} (threshold ${rule.threshold}${METRIC_UNIT[rule.metric]}` +
                `${rule.durationMin ? `, sustained ${rule.durationMin} min` : ''}).`,
        });
      } else if (open && !breaching && latest !== null && !(latest > rule.threshold)) {
        db.run('UPDATE alert_events SET resolved_at = ? WHERE id = ?', [new Date().toISOString(), open.id]);
        events.emit('alert.resolved', { eventId: open.id, ruleName: rule.name, serverId, serverName, metric: rule.metric });
        await notifierService.broadcast(rule.channelIds, {
          severity: 'resolved',
          title: `RESOLVED: ${rule.name} - ${serverName}`,
          body: `${METRIC_LABEL[rule.metric]} is back to normal${rule.metric === 'offline' ? ' (server reachable)' : ` (${latest}${METRIC_UNIT[rule.metric]})`}.`,
        });
      }
    }
  }

  private ruleToDTO(r: any): AlertRuleDTO {
    return {
      id: r.id,
      name: r.name,
      serverId: r.server_id || null,
      metric: r.metric,
      threshold: r.threshold,
      durationMin: r.duration_min,
      channelIds: r.channel_ids ? String(r.channel_ids).split(',').filter(Boolean) : [],
      isEnabled: !!r.is_enabled,
      createdAt: r.created_at,
    };
  }
}

export const alertService = new AlertService();
