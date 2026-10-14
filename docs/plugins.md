# Plugins

IOC can be extended with plugins: small Node modules that add pages, API endpoints, background tasks, notification
channels or reactions to events. Two examples ship in `plugins/`:

| Plugin | What it does |
|---|---|
| `uptime-checker` | HTTP / TCP / TLS-certificate checks every minute; alerts your notification channels on state changes. Adds an **Uptime** page. |
| `prometheus-exporter` | Serves the latest telemetry in Prometheus text format at `/api/plugins/prometheus-exporter/metrics`. |

Enable or disable plugins in the UI (puzzle icon, admin only). Enabling shows the permissions the plugin requests and
requires you to approve them. If a plugin update asks for *new* permissions it is held back until you approve again.

> **Trust model.** Plugins run inside the server process; Node has no in-process sandbox. The permission system is a
> declared-capability contract (a plugin only receives the parts of the API it was granted, and privileged actions such
> as SSH commands are audit-logged) - it is **not** a security boundary against malicious code. Only install plugins whose
> source you have read. Plugins never receive decrypted credentials.

## Layout

```
plugins/
  my-plugin/
    plugin.json     # manifest (the folder name must equal "id")
    index.mjs       # default-exports activate(ctx)
```

### `plugin.json`

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What it does",
  "main": "index.mjs",
  "permissions": ["routes", "scheduler"],
  "ui": { "pages": [ /* see "Declarative UI" */ ] }
}
```

### Permissions

| Permission | Grants |
|---|---|
| `servers.read` | `ctx.servers.list()/get()/latestMetrics()` - server list and cached telemetry (never credentials) |
| `ssh.exec` | `ctx.ssh.exec(serverId, command)` - run a command over SSH (every call is written to the audit log as `PLUGIN_SSH_EXEC`) |
| `events` | `ctx.events.on(...)` |
| `notify` | `ctx.notify.send(...)`, `ctx.notify.registerChannelType(...)` |
| `routes` | `ctx.routes.add(...)` - endpoints under `/api/plugins/<id>/` |
| `scheduler` | `ctx.scheduler.every(seconds, fn)` |

`ctx.storage` (a small per-plugin JSON key/value store), `ctx.log` and `ctx.http` need no permission.

## API

```js
export default function activate(ctx) {
  // Endpoint: GET /api/plugins/my-plugin/hello   (role = minimum role of the caller)
  ctx.routes.add('GET', 'hello', (req) => ({ message: `hi ${req.user.username}` }), { role: 'viewer' });

  // Path params and bodies
  ctx.routes.add('DELETE', 'items/:id', (req) => { /* req.params.id */ return { success: true }; }, { role: 'admin' });

  // Plain-text responses
  ctx.routes.add('GET', 'metrics', () => ctx.http.text('up 1\n', 'text/plain'));

  // Timers are cleaned up automatically when the plugin is disabled
  ctx.scheduler.every(60, async () => { /* ... */ });

  // React to core events: metrics.collected, server.status, alert.fired, alert.resolved, audit.logged
  ctx.events.on('alert.fired', (e) => ctx.log.info(`${e.serverName}: ${e.ruleName}`));

  // Send a message to the configured notification channels
  ctx.notify.send({ severity: 'critical', title: 'Something happened', body: 'details' });

  // Persist data
  ctx.storage.set('counter', (ctx.storage.get('counter') ?? 0) + 1);
}

// Optional: runs when the plugin is disabled
export function deactivate() {}
```

Default route roles are `viewer` for `GET` and `operator` for other methods; set `{ role }` explicitly for anything
sensitive. Throw `Object.assign(new Error('message'), { statusCode: 400 })` to return an HTTP error.

Custom notification channels:

```js
ctx.notify.registerChannelType({
  type: 'pushover',
  label: 'Pushover',
  fields: ['userKey', 'appToken'],
  summarize: (c) => c.userKey.slice(0, 4) + '…',
  send: async (config, msg) => { /* POST to the service; throw on failure */ },
});
```

## Declarative UI

Plugins do not ship frontend code. They describe pages with widgets that the console renders (and refreshes every 15 s);
data comes from the plugin's own endpoints (`source` is relative to `/api/plugins/<id>/`).

| Widget | Source returns | Notes |
|---|---|---|
| `stats` | `[{ "label", "value", "tone?": "good"\|"warn"\|"bad" }]` | tiles |
| `table` | `{ "rows": [...] }` or an array | `columns: [{ key, label, format?: "text"\|"badge"\|"datetime" }]`, optional `rowActions: [{ label, method, path, confirm? }]`; `:param` in `path` is filled from the row |
| `form` | - | `submit: { method, path }`, `fields: [{ name, label, type?, required?, placeholder?, options?, default? }]` |
| `text` | `{ "text": "..." }` | preformatted block |

`badge` values `up`/`ok` render green, `warn` amber, `down`/`error` red.

## Operations

- Plugins load at startup from `plugins/` (override with `PLUGINS_DIR`).
- A plugin that throws during activation is marked with its error and left disabled; other plugins are unaffected.
- Event-handler and scheduled-task failures are logged and never break the core.
- Management endpoints (`/api/plugin-manager/*`) are admin-only.
