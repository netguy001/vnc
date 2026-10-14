const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

export default function activate(ctx) {
  ctx.routes.add(
    'GET',
    'metrics',
    () => {
      const lines = [];
      const family = (name, help) => lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
      const rows = ctx.servers.list().map((s) => ({ s, m: ctx.servers.latestMetrics(s.id) }));

      family('ioc_server_up', '1 if the server answered the last telemetry probe');
      for (const { s, m } of rows) lines.push(`ioc_server_up{server="${esc(s.name)}",host="${esc(s.host)}"} ${m?.isAvailable ? 1 : 0}`);

      const metric = (name, help, pick) => {
        family(name, help);
        for (const { s, m } of rows) {
          if (!m?.isAvailable) continue;
          const v = pick(m);
          if (typeof v === 'number' && Number.isFinite(v)) lines.push(`${name}{server="${esc(s.name)}"} ${v}`);
        }
      };

      metric('ioc_cpu_usage_percent', 'CPU usage percent', (m) => m.cpuUsagePercent);
      metric('ioc_memory_usage_percent', 'Memory usage percent', (m) => m.memory?.usagePercent);
      metric('ioc_memory_used_bytes', 'Memory used in bytes', (m) => m.memory?.usedBytes);
      metric('ioc_load1', '1-minute load average', (m) => m.loadAverage?.[0]);
      metric('ioc_uptime_seconds', 'Server uptime in seconds', (m) => m.uptimeSeconds);

      family('ioc_disk_usage_percent', 'Disk usage percent per mount');
      for (const { s, m } of rows) {
        for (const d of m?.disks ?? []) lines.push(`ioc_disk_usage_percent{server="${esc(s.name)}",mount="${esc(d.mount)}"} ${d.usagePercent}`);
      }

      return ctx.http.text(lines.join('\n') + '\n', 'text/plain; version=0.0.4; charset=utf-8');
    },
    { role: 'viewer' }
  );

  ctx.routes.add('GET', 'info', () => ({
    text:
      'Point Prometheus at /api/plugins/prometheus-exporter/metrics with an IOC API token:\n\n' +
      'scrape_configs:\n  - job_name: ioc\n    metrics_path: /api/plugins/prometheus-exporter/metrics\n' +
      '    authorization:\n      credentials: <api token>\n    static_configs:\n      - targets: ["<ioc-host>:3001"]\n\n' +
      'Metrics reflect the background collector (default: every 60 seconds).',
  }));
}
