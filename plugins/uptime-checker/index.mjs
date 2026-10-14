import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

const CHECK_TIMEOUT_MS = 8000;
const SSL_WARN_DAYS = 14;

function httpCheck(target) {
  const started = Date.now();
  return fetch(target, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    .then((res) => ({
      status: res.status < 400 ? 'up' : 'down',
      detail: `HTTP ${res.status}`,
      latencyMs: Date.now() - started,
    }))
    .catch((err) => ({ status: 'down', detail: err.cause?.code || err.name || 'request failed', latencyMs: null }));
}

function tcpCheck(target) {
  const [host, portStr] = target.split(':');
  const port = Number(portStr);
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port, timeout: CHECK_TIMEOUT_MS });
    socket.once('connect', () => {
      socket.destroy();
      resolve({ status: 'up', detail: 'port open', latencyMs: Date.now() - started });
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ status: 'down', detail: 'timed out', latencyMs: null });
    });
    socket.once('error', (err) => resolve({ status: 'down', detail: err.code || 'connection failed', latencyMs: null }));
  });
}

function sslCheck(target) {
  const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = tls.connect({ host, port: 443, servername: host, timeout: CHECK_TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return resolve({ status: 'down', detail: 'no certificate', latencyMs: null });
      const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
      resolve({
        status: days < 0 ? 'down' : days < SSL_WARN_DAYS ? 'warn' : 'up',
        detail: days < 0 ? `expired ${-days}d ago` : `expires in ${days}d`,
        latencyMs: Date.now() - started,
      });
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ status: 'down', detail: 'timed out', latencyMs: null });
    });
    socket.once('error', (err) => resolve({ status: 'down', detail: err.code || 'TLS error', latencyMs: null }));
  });
}

const RUNNERS = { http: httpCheck, tcp: tcpCheck, ssl: sslCheck };

function validate(body) {
  const name = String(body?.name || '').trim().slice(0, 60);
  const type = String(body?.type || 'http');
  const target = String(body?.target || '').trim().slice(0, 300);
  if (!name || !target) throw Object.assign(new Error('name and target are required'), { statusCode: 400 });
  if (!RUNNERS[type]) throw Object.assign(new Error('type must be http, tcp or ssl'), { statusCode: 400 });
  if (type === 'http' && !/^https?:\/\//i.test(target)) throw Object.assign(new Error('http target must start with http:// or https://'), { statusCode: 400 });
  if (type === 'tcp' && !/^[^\s:]+:\d{1,5}$/.test(target)) throw Object.assign(new Error('tcp target must look like host:port'), { statusCode: 400 });
  return { name, type, target };
}

export default function activate(ctx) {
  const load = () => ctx.storage.get('checks') ?? [];
  const save = (checks) => ctx.storage.set('checks', checks);

  async function runAll() {
    const checks = load();
    if (!checks.length) return;
    const results = await Promise.all(checks.map((c) => RUNNERS[c.type](c.target)));
    const now = new Date().toISOString();
    const latest = load(); // re-read: the user may have edited the list while checks ran

    for (const [i, result] of results.entries()) {
      const prev = checks[i];
      const current = latest.find((c) => c.id === prev.id);
      if (!current) continue;
      const changed = current.status && current.status !== result.status;
      Object.assign(current, result, { lastChecked: now });
      if (changed || !current.since) current.since = now;

      if (changed) {
        const isBad = result.status === 'down' || result.status === 'warn';
        await ctx.notify
          .send({
            severity: isBad ? 'critical' : 'resolved',
            title: `${isBad ? (result.status === 'warn' ? 'WARNING' : 'DOWN') : 'RECOVERED'}: ${current.name}`,
            body: `${current.type.toUpperCase()} ${current.target} - ${result.detail}`,
          })
          .catch((e) => ctx.log.error('notify failed:', e.message));
      }
    }
    save(latest);
  }

  ctx.scheduler.every(60, runAll);
  setTimeout(() => runAll().catch((e) => ctx.log.error(e.message)), 3000).unref();

  ctx.routes.add('GET', 'checks', () => ({ rows: load() }), { role: 'viewer' });

  ctx.routes.add('GET', 'stats', () => {
    const checks = load();
    const count = (s) => checks.filter((c) => c.status === s).length;
    return [
      { label: 'Checks', value: checks.length },
      { label: 'Up', value: count('up'), tone: 'good' },
      { label: 'Warning', value: count('warn'), tone: count('warn') ? 'warn' : undefined },
      { label: 'Down', value: count('down'), tone: count('down') ? 'bad' : undefined },
    ];
  });

  ctx.routes.add(
    'POST',
    'checks',
    async (req) => {
      const check = { id: crypto.randomUUID(), ...validate(req.body), status: 'pending', detail: 'not checked yet' };
      save([...load(), check]);
      setTimeout(() => runAll().catch(() => {}), 200).unref();
      return { check };
    },
    { role: 'admin' }
  );

  ctx.routes.add(
    'DELETE',
    'checks/:id',
    (req) => {
      save(load().filter((c) => c.id !== req.params.id));
      return { success: true };
    },
    { role: 'admin' }
  );

  ctx.log.info('ready');
}
