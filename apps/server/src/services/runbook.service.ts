import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import { serverService } from './server.service.js';
import { sshService } from './ssh.service.js';
import { auditService } from './audit.service.js';

export interface RunbookDTO {
  id: string;
  name: string;
  description: string;
  script: string;
  targetType: 'all' | 'group' | 'servers';
  /** group name, or comma-separated server ids */
  targetValue: string;
  intervalMin: number | null;
  timeoutSec: number;
  createdAt: string;
}

export interface RunResultItem {
  serverId: string;
  serverName: string;
  ok: boolean;
  exitCode: number | null;
  output: string;
  error?: string;
  durationMs: number;
}

export interface RunbookRunDTO {
  id: string;
  runbookId: string;
  runbookName: string;
  trigger: 'manual' | 'schedule';
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  results: RunResultItem[];
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Runbooks: saved shell scripts executed over SSH on a set of servers, manually or on an interval.
 * Authoring/running is admin-only (enforced by the route policy) because scripts run with the
 * stored SSH credentials of every targeted server.
 */
export class RunbookService {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();

  startScheduler(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
  }

  stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(): RunbookDTO[] {
    return getDatabase()
      .query<any>('SELECT * FROM runbooks ORDER BY created_at DESC')
      .map((r) => this.toDTO(r));
  }

  get(id: string): RunbookDTO | null {
    const row = getDatabase().get<any>('SELECT * FROM runbooks WHERE id = ?', [id]);
    return row ? this.toDTO(row) : null;
  }

  create(input: Omit<RunbookDTO, 'id' | 'createdAt'>, createdBy?: string): RunbookDTO {
    if (!input.name.trim()) throw badRequest('Name is required');
    if (!input.script.trim()) throw badRequest('Script is required');
    if (input.script.length > 50_000) throw badRequest('Script is too long (50 KB max)');
    if (input.targetType === 'group' && !input.targetValue) throw badRequest('Choose a server group');
    if (input.targetType === 'servers' && !input.targetValue) throw badRequest('Choose at least one server');
    if (input.intervalMin !== null && (input.intervalMin < 1 || input.intervalMin > 10080)) throw badRequest('Interval must be 1 to 10080 minutes');

    const id = crypto.randomUUID();
    getDatabase().run(
      `INSERT INTO runbooks (id, name, description, script, target_type, target_value, interval_min, last_scheduled_at, timeout_sec, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name.trim().slice(0, 80),
        input.description?.slice(0, 300) || '',
        input.script,
        input.targetType,
        input.targetValue || null,
        input.intervalMin,
        input.intervalMin ? Date.now() : null, // first scheduled run happens one interval from now
        Math.min(Math.max(input.timeoutSec || 60, 5), 600),
        createdBy || null,
        new Date().toISOString(),
      ]
    );
    return this.get(id)!;
  }

  delete(id: string): boolean {
    return getDatabase().run('DELETE FROM runbooks WHERE id = ?', [id]).changes > 0;
  }

  listRuns(runbookId?: string, limit = 30): RunbookRunDTO[] {
    const db = getDatabase();
    const rows = runbookId
      ? db.query<any>('SELECT * FROM runbook_runs WHERE runbook_id = ? ORDER BY started_at DESC LIMIT ?', [runbookId, limit])
      : db.query<any>('SELECT * FROM runbook_runs ORDER BY started_at DESC LIMIT ?', [limit]);
    return rows.map((r) => ({
      id: r.id,
      runbookId: r.runbook_id,
      runbookName: r.runbook_name,
      trigger: r.trigger,
      startedBy: r.started_by,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      results: JSON.parse(r.results || '[]'),
    }));
  }

  resolveTargets(rb: RunbookDTO) {
    const servers = serverService.listServers().filter((s) => s.isEnabled);
    if (rb.targetType === 'all') return servers;
    if (rb.targetType === 'group') return servers.filter((s) => (s.serverGroup || 'Default') === rb.targetValue);
    const ids = new Set(rb.targetValue.split(',').filter(Boolean));
    return servers.filter((s) => ids.has(s.id));
  }

  /** Runs a runbook now. Resolves once every target finished; the run record is stored incrementally. */
  async run(id: string, trigger: 'manual' | 'schedule', startedBy?: string): Promise<RunbookRunDTO> {
    const rb = this.get(id);
    if (!rb) throw Object.assign(new Error('Runbook not found'), { statusCode: 404 });
    if (this.running.has(id)) throw Object.assign(new Error('This runbook is already running'), { statusCode: 409 });
    const targets = this.resolveTargets(rb);
    if (targets.length === 0) throw badRequest('No enabled servers match this runbook\'s targets');

    this.running.add(id);
    const runId = crypto.randomUUID();
    const db = getDatabase();
    const startedAt = new Date().toISOString();
    db.run(
      'INSERT INTO runbook_runs (id, runbook_id, runbook_name, trigger, started_by, started_at, results) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [runId, id, rb.name, trigger, startedBy || null, startedAt, '[]']
    );
    auditService.log({
      username: startedBy || 'scheduler',
      action: 'RUNBOOK_RUN',
      details: `Runbook "${rb.name}" (${trigger}) on ${targets.length} server(s)`,
    });

    const results: RunResultItem[] = [];
    try {
      const queue = [...targets];
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          const creds = serverService.getDecryptedCredentials(s.id);
          const t0 = Date.now();
          if (!creds?.server) {
            results.push({ serverId: s.id, serverName: s.name, ok: false, exitCode: null, output: '', error: 'Server not found', durationMs: 0 });
            continue;
          }
          try {
            const out = await sshService.runScript(creds, rb.script, rb.timeoutSec * 1000);
            results.push({
              serverId: s.id,
              serverName: s.name,
              ok: out.code === 0,
              exitCode: out.code,
              output: (out.stdout + (out.stderr ? `\n[stderr]\n${out.stderr}` : '')).slice(0, 60_000),
              durationMs: Date.now() - t0,
            });
          } catch (err: any) {
            results.push({ serverId: s.id, serverName: s.name, ok: false, exitCode: null, output: '', error: err.message, durationMs: Date.now() - t0 });
          }
          db.run('UPDATE runbook_runs SET results = ? WHERE id = ?', [JSON.stringify(results), runId]);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      db.run('UPDATE runbook_runs SET finished_at = ?, results = ? WHERE id = ?', [new Date().toISOString(), JSON.stringify(results), runId]);
      this.running.delete(id);
      db.run(
        'DELETE FROM runbook_runs WHERE runbook_id = ? AND id NOT IN (SELECT id FROM runbook_runs WHERE runbook_id = ? ORDER BY started_at DESC LIMIT 50)',
        [id, id]
      );
    }
    return this.listRuns(id, 1)[0];
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const due = getDatabase().query<any>(
      'SELECT id, interval_min, last_scheduled_at FROM runbooks WHERE interval_min IS NOT NULL AND (last_scheduled_at IS NULL OR last_scheduled_at + interval_min * 60000 <= ?)',
      [now]
    );
    for (const row of due) {
      getDatabase().run('UPDATE runbooks SET last_scheduled_at = ? WHERE id = ?', [now, row.id]);
      this.run(row.id, 'schedule').catch((e) => console.error(`[runbooks] scheduled run failed: ${e.message}`));
    }
  }

  private toDTO(r: any): RunbookDTO {
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      script: r.script,
      targetType: r.target_type,
      targetValue: r.target_value || '',
      intervalMin: r.interval_min ?? null,
      timeoutSec: r.timeout_sec,
      createdAt: r.created_at,
    };
  }
}

export const runbookService = new RunbookService();
