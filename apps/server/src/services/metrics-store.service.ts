import { getDatabase } from '../db/client.js';
import { serverService } from './server.service.js';
import { monitorService } from './monitor.service.js';
import { events } from './events.js';
import { alertService } from './alert.service.js';
import type { MetricSample, ServerMonitoringData } from '@server-console/shared';

const RANGES: Record<string, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
};
const RETENTION_MS = RANGES['7d'];
const MAX_POINTS = 240;

/**
 * Background collector: polls every enabled server on a fixed interval, stores a compact sample
 * for history/sparklines and feeds the alert engine. The latest full snapshot is cached so the
 * dashboard can render instantly without opening a fresh SSH connection per page view.
 */
export class MetricsStoreService {
  private timer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private running = false;
  private latest = new Map<string, { data: ServerMonitoringData; at: number }>();
  private lastPersist = new Map<string, number>();
  intervalMs = Math.max(15, parseInt(process.env.METRICS_INTERVAL_SEC || '60', 10)) * 1000;

  start(): void {
    if (this.timer) return;
    setTimeout(() => void this.collectAll(), 5000);
    this.timer = setInterval(() => void this.collectAll(), this.intervalMs);
    this.pruneTimer = setInterval(() => this.prune(), 3600_000);
    this.timer.unref();
    this.pruneTimer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.timer = this.pruneTimer = null;
  }

  /** Cached snapshot if fresh enough, else null. */
  getCached(serverId: string, maxAgeMs = 45_000): ServerMonitoringData | null {
    const hit = this.latest.get(serverId);
    return hit && Date.now() - hit.at <= maxAgeMs ? hit.data : null;
  }

  async collectAll(): Promise<void> {
    if (this.running) return; // never overlap runs
    this.running = true;
    try {
      const servers = serverService.listServers().filter((s) => s.isEnabled);
      const queue = [...servers];
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          await this.collectOne(s.id).catch((e) => console.error(`[metrics] ${s.name}: ${e.message}`));
        }
      };
      await Promise.all([worker(), worker(), worker()]); // bounded concurrency
    } finally {
      this.running = false;
    }
  }

  async collectOne(serverId: string, _opts: { persist?: 'throttled' } = {}): Promise<MetricSample | null> {
    const creds = serverService.getDecryptedCredentials(serverId);
    if (!creds?.server) return null;

    const started = Date.now();
    const data = await monitorService.getMetrics(creds);
    const latencyMs = Date.now() - started;
    return this.record(creds.server.id, creds.server.name, creds.server.status, data, latencyMs);
  }

  /** Stores a sample for data obtained elsewhere (collector or an interactive monitor request). */
  record(serverId: string, serverName: string, previousStatus: string, data: ServerMonitoringData, latencyMs: number | null = null): MetricSample {
    this.latest.set(serverId, { data, at: Date.now() });

    const sample: MetricSample = {
      ts: Date.now(),
      available: data.isAvailable,
      cpu: data.isAvailable ? data.cpuUsagePercent ?? null : null,
      mem: data.isAvailable ? data.memory?.usagePercent ?? null : null,
      disk: data.isAvailable && data.disks?.length ? Math.max(...data.disks.map((d) => d.usagePercent)) : null,
      load1: data.isAvailable ? data.loadAverage?.[0] ?? null : null,
      latencyMs,
    };

    // History is written at most once per collection interval, however often live viewers or manual
    // refreshes trigger a probe (live mode polls every few seconds).
    const persistGapMs = this.intervalMs * 0.8;
    const shouldPersist = Date.now() - (this.lastPersist.get(serverId) ?? 0) >= persistGapMs;
    if (shouldPersist) {
      this.lastPersist.set(serverId, Date.now());
      getDatabase().run(
        'INSERT INTO metric_samples (server_id, ts, available, cpu, mem, disk, load1, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [serverId, sample.ts, sample.available ? 1 : 0, sample.cpu, sample.mem, sample.disk, sample.load1, sample.latencyMs]
      );
    }

    const newStatus = data.isAvailable ? 'connected' : 'error';
    if (newStatus !== previousStatus) {
      serverService.updateStatus(serverId, newStatus);
      events.emit('server.status', { serverId, serverName, from: previousStatus, to: newStatus });
    }

    if (shouldPersist) {
      events.emit('metrics.collected', { serverId, serverName, sample, data });
      void alertService.evaluate(serverId, serverName, this.intervalMs).catch((e) => console.error('[alerts] evaluate failed:', e.message));
    }
    return sample;
  }

  history(serverId: string, range: string): MetricSample[] {
    const span = RANGES[range] ?? RANGES['1h'];
    const rows = getDatabase().query<any>(
      'SELECT ts, available, cpu, mem, disk, load1, latency_ms FROM metric_samples WHERE server_id = ? AND ts >= ? ORDER BY ts',
      [serverId, Date.now() - span]
    );
    const samples: MetricSample[] = rows.map((r) => ({
      ts: r.ts,
      available: !!r.available,
      cpu: r.cpu,
      mem: r.mem,
      disk: r.disk,
      load1: r.load1,
      latencyMs: r.latency_ms,
    }));
    return downsample(samples, MAX_POINTS);
  }

  prune(): void {
    getDatabase().run('DELETE FROM metric_samples WHERE ts < ?', [Date.now() - RETENTION_MS]);
  }
}

/** Averages samples into at most `max` buckets so long ranges stay cheap to draw. */
function downsample(samples: MetricSample[], max: number): MetricSample[] {
  if (samples.length <= max) return samples;
  const size = Math.ceil(samples.length / max);
  const out: MetricSample[] = [];
  for (let i = 0; i < samples.length; i += size) {
    const bucket = samples.slice(i, i + size);
    const avg = (key: 'cpu' | 'mem' | 'disk' | 'load1' | 'latencyMs') => {
      const vals = bucket.map((b) => b[key]).filter((v): v is number => v !== null);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };
    out.push({
      ts: bucket[Math.floor(bucket.length / 2)].ts,
      available: bucket.every((b) => b.available),
      cpu: avg('cpu'),
      mem: avg('mem'),
      disk: avg('disk'),
      load1: avg('load1'),
      latencyMs: avg('latencyMs'),
    });
  }
  return out;
}

export const metricsStore = new MetricsStoreService();
