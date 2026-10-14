import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteDatabaseClient, setDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { minimumRoleFor, roleAtLeast } from '../middleware/auth.middleware.js';
import { AlertService } from '../services/alert.service.js';
import { notifierService } from '../services/notifier.service.js';

describe('role policy', () => {
  it('lets viewers read dashboards but not sensitive reads or writes', () => {
    expect(minimumRoleFor('GET', '/api/servers')).toBe('viewer');
    expect(minimumRoleFor('GET', '/api/servers/x/monitor?fresh=1')).toBe('viewer');
    expect(minimumRoleFor('GET', '/api/servers/x/files?path=/')).toBe('operator');
    expect(minimumRoleFor('GET', '/api/servers/x/vnc-credentials')).toBe('operator');
    expect(minimumRoleFor('GET', '/api/settings/export-servers')).toBe('admin');
    expect(minimumRoleFor('GET', '/api/alerts/channels')).toBe('admin');
  });

  it('reserves destructive and configuration writes for admins', () => {
    expect(minimumRoleFor('POST', '/api/servers')).toBe('admin');
    expect(minimumRoleFor('DELETE', '/api/servers/x')).toBe('admin');
    expect(minimumRoleFor('POST', '/api/servers/x/firewall/rule')).toBe('admin');
    expect(minimumRoleFor('DELETE', '/api/settings/audit-logs')).toBe('admin');
    expect(minimumRoleFor('POST', '/api/alerts/rules')).toBe('admin');
  });

  it('allows operators day-to-day operations and everyone their own settings', () => {
    expect(minimumRoleFor('POST', '/api/servers/x/files/upload')).toBe('operator');
    expect(minimumRoleFor('POST', '/api/servers/x/network/ping')).toBe('operator');
    expect(minimumRoleFor('PUT', '/api/settings/preferences')).toBe('viewer');
    expect(roleAtLeast('operator', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'operator')).toBe(false);
    expect(roleAtLeast(undefined, 'viewer')).toBe(false);
  });
});

describe('alert engine', () => {
  const INTERVAL = 60_000;
  let alerts: AlertService;
  const sent: string[] = [];

  function insertSample(ts: number, cpu: number, available = 1) {
    getDatabase().run(
      'INSERT INTO metric_samples (server_id, ts, available, cpu, mem, disk, load1, latency_ms) VALUES (?, ?, ?, ?, 10, 10, 1, 50)',
      ['srv1', ts, available, available ? cpu : null]
    );
  }

  beforeEach(() => {
    const db = new SQLiteDatabaseClient(':memory:');
    setDatabase(db);
    runMigrations(db);
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO servers (id, name, host, ssh_port, ssh_username, auth_method, created_at, updated_at)
       VALUES ('srv1', 'web-1', '10.0.0.1', 22, 'root', 'password', ?, ?)`,
      [now, now]
    );
    alerts = new AlertService();
    sent.length = 0;
    notifierService.registerDriver({
      type: 'test',
      label: 'Test',
      fields: [],
      summarize: () => 'test',
      send: async (_c, m) => {
        sent.push(`${m.severity}:${m.title}`);
      },
    });
  });

  function makeRule(duration: number, channelIds: string[] = []) {
    return alerts.createRule({ name: 'High CPU', serverId: 'srv1', metric: 'cpu', threshold: 90, durationMin: duration, channelIds });
  }

  it('fires only after the breach is sustained for the whole window', async () => {
    makeRule(3);
    const now = Date.now();
    insertSample(now - 2 * INTERVAL, 95);
    insertSample(now - INTERVAL, 95);
    insertSample(now, 95);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(alerts.listEvents()).toHaveLength(0); // only 2 min of data for a 3 min rule

    insertSample(now - 3 * INTERVAL, 95);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(alerts.listEvents()).toHaveLength(1);
    expect(alerts.listEvents()[0].resolvedAt).toBeNull();
  });

  it('does not fire when a single sample in the window is healthy', async () => {
    makeRule(2);
    const now = Date.now();
    insertSample(now - 2 * INTERVAL, 95);
    insertSample(now - INTERVAL, 20);
    insertSample(now, 95);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(alerts.listEvents()).toHaveLength(0);
  });

  it('does not duplicate an open alert, and resolves it once healthy', async () => {
    makeRule(0);
    insertSample(Date.now(), 99);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(alerts.listEvents()).toHaveLength(1);

    insertSample(Date.now() + 1000, 10);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(alerts.listEvents()[0].resolvedAt).not.toBeNull();
  });

  it('notifies channels on fire and on resolve', async () => {
    const channel = notifierService.create({ name: 'T', type: 'test', config: {} });
    makeRule(0, [channel.id]);
    insertSample(Date.now(), 99);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    insertSample(Date.now() + 1000, 5);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(sent).toEqual(['critical:ALERT: High CPU - web-1', 'resolved:RESOLVED: High CPU - web-1']);
  });

  it('fires an offline rule when the server is unreachable', async () => {
    alerts.createRule({ name: 'Down', serverId: null, metric: 'offline', threshold: 0, durationMin: 0, channelIds: [] });
    insertSample(Date.now(), 0, 0);
    await alerts.evaluate('srv1', 'web-1', INTERVAL);
    expect(alerts.listEvents()).toHaveLength(1);
  });

  it('rejects webhook channels that are not https', () => {
    expect(() => notifierService.create({ name: 'x', type: 'webhook', config: { url: 'http://insecure.example' } })).toThrow(/https/);
  });
});

import { LoginThrottle } from '../services/security-guard.js';

describe('login throttle', () => {
  it('blocks guessing for one user from one address after 5 failures', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 4; i++) t.recordFailure('1.1.1.1', 'admin');
    expect(t.retryAfter('1.1.1.1', 'admin')).toBe(0);
    t.recordFailure('1.1.1.1', 'admin');
    expect(t.retryAfter('1.1.1.1', 'admin')).toBeGreaterThan(0);
  });

  it('does not lock other users on the same address, or the same user from another address', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('1.1.1.1', 'attacker-guess');
    expect(t.retryAfter('1.1.1.1', 'admin')).toBe(0);

    for (let i = 0; i < 6; i++) t.recordFailure('9.9.9.9', 'admin');
    expect(t.retryAfter('9.9.9.9', 'admin')).toBeGreaterThan(0);
    expect(t.retryAfter('2.2.2.2', 'admin')).toBe(0); // the real owner on a different address still gets in
  });

  it('still stops spraying and distributed guessing at the looser limits', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 30; i++) t.recordFailure('3.3.3.3', `user${i}`);
    expect(t.retryAfter('3.3.3.3', 'anyone')).toBeGreaterThan(0);

    const d = new LoginThrottle();
    for (let i = 0; i < 20; i++) d.recordFailure(`10.0.0.${i}`, 'admin');
    expect(d.retryAfter('10.9.9.9', 'admin')).toBeGreaterThan(0);
  });

  it('a successful login clears the pair counter and the window expires', () => {
    const t = new LoginThrottle(50);
    for (let i = 0; i < 5; i++) t.recordFailure('1.1.1.1', 'admin');
    expect(t.retryAfter('1.1.1.1', 'admin')).toBeGreaterThan(0);
    t.reset('1.1.1.1', 'admin');
    expect(t.retryAfter('1.1.1.1', 'admin')).toBe(0);
  });
});

describe('AI assistant policy and redaction', () => {
  it('requires operator for diagnose requests', () => {
    expect(minimumRoleFor('POST', '/api/servers/abc/ai/diagnose')).toBe('operator');
    expect(minimumRoleFor('GET', '/api/ai/status')).toBe('viewer');
  });
});
