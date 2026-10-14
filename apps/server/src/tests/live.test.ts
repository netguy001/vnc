import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteDatabaseClient, setDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { MetricsStoreService } from '../services/metrics-store.service.js';
import { events } from '../services/events.js';
import type { ServerMonitoringData } from '@server-console/shared';

const data = (cpu: number): ServerMonitoringData => ({
  serverId: 's1',
  timestamp: new Date().toISOString(),
  isAvailable: true,
  cpuUsagePercent: cpu,
  loadAverage: [1, 1, 1],
  memory: { totalBytes: 1, usedBytes: 1, freeBytes: 0, usagePercent: 10, totalFormatted: '1', usedFormatted: '1' },
  disks: [],
});

describe('metrics store (live polling)', () => {
  let store: MetricsStoreService;
  const rows = () => getDatabase().get<{ c: number }>('SELECT COUNT(*) AS c FROM metric_samples')!.c;

  beforeEach(() => {
    const db = new SQLiteDatabaseClient(':memory:');
    setDatabase(db);
    runMigrations(db);
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO servers (id, name, host, ssh_port, ssh_username, auth_method, created_at, updated_at)
       VALUES ('s1', 'web', '10.0.0.1', 22, 'root', 'password', ?, ?)`,
      [now, now]
    );
    store = new MetricsStoreService();
  });

  it('keeps the latest snapshot fresh on every probe but writes history only once per interval', () => {
    for (let i = 0; i < 20; i++) store.record('s1', 'web', 'connected', data(10 + i)); // 20 live pushes in a burst
    expect(rows()).toBe(1);
    expect(store.getCached('s1')?.cpuUsagePercent).toBe(29); // newest value, not the persisted one
  });

  it('writes again once the interval has elapsed', () => {
    store.record('s1', 'web', 'connected', data(10));
    (store as any).lastPersist.set('s1', Date.now() - store.intervalMs);
    store.record('s1', 'web', 'connected', data(20));
    expect(rows()).toBe(2);
  });

  it('emits status changes immediately, even when history is throttled', () => {
    const seen: string[] = [];
    const off = events.on('server.status', (e) => seen.push(`${e.from}->${e.to}`));
    store.record('s1', 'web', 'connected', data(10));
    store.record('s1', 'web', 'connected', { ...data(0), isAvailable: false });
    off();
    expect(seen).toEqual(['connected->error']);
    expect(rows()).toBe(1);
  });
});
