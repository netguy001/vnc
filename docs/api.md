# ServerConsole API Reference

All requests and responses use JSON unless otherwise noted.
Endpoints requiring authentication accept either an `Authorization: Bearer <token>` header or an HttpOnly `token` cookie.

## Authentication Endpoints

### `GET /api/auth/setup-status`
Returns `{ initialized: boolean }` indicating if an initial administrator account exists.

### `POST /api/auth/setup`
Creates the initial administrator account on first run.
- **Body**: `{ username, password, email? }`
- **Response**: `{ user: UserDTO, token: string }`

### `POST /api/auth/login`
Authenticates a user and sets session cookie.
- **Body**: `{ username, password }`
- **Response**: `{ user: UserDTO, token: string }`

### `POST /api/auth/logout`
Clears session cookie and invalidates session.

### `GET /api/auth/me`
Returns profile of currently authenticated user.

---

## Server Management Endpoints

### `GET /api/servers`
Lists all registered servers (credentials are sanitized).

### `POST /api/servers`
Registers a new server and encrypts credentials with AES-256-GCM.
- **Body**:
  ```json
  {
    "name": "Production Server",
    "host": "192.0.2.10",
    "sshPort": 22,
    "sshUsername": "root",
    "authMethod": "password",
    "sshPassword": "secret-password",
    "vncEnabled": true,
    "vncPort": 5900,
    "vncPassword": "vnc-password",
    "serverGroup": "Production"
  }
  ```

### `GET /api/servers/:id`
Returns server details.

### `PUT /api/servers/:id`
Updates server configuration or credentials.

### `DELETE /api/servers/:id`
Deletes server and cascades deletion of encrypted credentials.

### `POST /api/servers/:id/test-connection`
Performs live SSH authentication and VNC port reachability probes.
- **Response**:
  ```json
  {
    "result": {
      "sshSuccess": true,
      "sshMessage": "SSH connection successful to 192.0.2.10:22",
      "vncSuccess": true,
      "vncMessage": "VNC port 5900 is reachable",
      "latencyMs": 42
    }
  }
  ```

### `GET /api/servers/:id/monitor`
Gathers real-time telemetry (CPU, RAM, Disks, Uptime, Top Processes). If offline, returns `{ isAvailable: false, error: ... }`.

### `GET /api/servers/:id/docker`
Lists running and stopped Docker containers.

---

## SFTP Endpoints

### `GET /api/servers/:id/files?path=/path`
Lists files in remote directory.

### `GET /api/servers/:id/files/download?path=/remote/file`
Streams remote file download.

### `POST /api/servers/:id/files/upload`
Accepts multipart file upload with `targetDir` and `file`.

### `POST /api/servers/:id/files/mkdir`
- **Body**: `{ "path": "/path/to/new_dir" }`

### `POST /api/servers/:id/files/rename`
- **Body**: `{ "oldPath": "/path/a", "newPath": "/path/b" }`

### `DELETE /api/servers/:id/files`
- **Body**: `{ "path": "/path/to/item", "recursive": false }`

---

## WebSocket Endpoints

### `WS /api/servers/:id/vnc`
Authenticated by the session cookie (+ Origin check); requires the `operator` role. Full-duplex binary proxy between noVNC client and backend VNC TCP server.

### `WS /api/servers/:id/terminal?cols=80&rows=24`
Interactive SSH pseudo-terminal stream supporting PTY resizing (`{ type: "resize", cols, rows }`).

---

## Additional endpoints

Authentication: session cookie or `Authorization: Bearer <jwt | ioc_api_token>`. Minimum role in brackets.

| Endpoint | Purpose |
|---|---|
| `GET /api/servers/:id/metrics/history?range=1h\|6h\|24h\|7d` [viewer] | Stored telemetry samples |
| `GET /api/servers/:id/monitor?fresh=1` [viewer] | Latest telemetry (cached unless `fresh=1`) |
| `GET /api/servers/:id/services` [operator], `POST /api/servers/:id/services/:name/:action` [operator for start/stop/restart, admin for reload/enable/disable] | systemd services |
| `GET /api/servers/:id/logs?source=journal\|unit:<name>\|file:/var/log/..\|docker:<name>&lines=&filter=&since=` [operator] | Log explorer |
| `POST /api/servers/:id/docker/containers/:name/(start\|stop\|restart)` [operator] | Container actions |
| `GET /api/servers/:id/host-key`, `POST .../host-key/reset` [admin] | SSH host-key pinning |
| `POST /api/servers/:id/ai/diagnose` [operator] | AI health analysis (needs `ANTHROPIC_API_KEY`) |
| `GET/POST/PUT/DELETE /api/alerts/rules`, `GET /api/alerts/events` | Alert rules and history (writes: admin) |
| `GET/POST/PUT/DELETE /api/alerts/channels`, `POST .../:id/test` [admin] | Notification channels |
| `GET/POST/DELETE /api/runbooks`, `POST /api/runbooks/:id/run` [admin] | Runbooks |
| `GET/POST/PUT/DELETE /api/auth/users` [admin] | User management |
| `GET/POST/DELETE /api/auth/tokens` | Own API tokens |
| `GET /api/auth/totp`, `POST /api/auth/totp/(setup\|enable\|disable)` | Own 2FA |
| `GET /api/plugin-manager`, `POST /api/plugin-manager/:id/(enable\|disable)` [admin] | Plugins |
| `* /api/plugins/:id/*` | Endpoints provided by plugins |

`POST /api/auth/login` accepts an optional `totp` field; when 2FA is on and the code is missing it returns `401 { "totpRequired": true }`.

---

## Real-time channel

### `WS /api/live`
One multiplexed, read-only WebSocket for live data (session cookie + Origin check, any role). Client messages:

```json
{ "type": "subscribe",   "topic": "metrics" | "network" | "docker", "serverId": "<id>" }
{ "type": "unsubscribe", "topic": "metrics", "serverId": "<id>" }
{ "type": "ping", "t": 123 }
```

Server messages: `hello`, `pong`, `error`, and

```json
{ "type": "data", "topic": "metrics", "serverId": "<id>", "payload": { ... }, "ts": 1760000000000 }
{ "type": "status", "serverId": "<id>", "status": "connected" | "error" | ... }   // broadcast to every client
{ "type": "alert", "state": "fired" | "resolved", "ruleName": "...", "serverName": "..." } // broadcast
```

A topic is polled on the server **only while it has subscribers** (metrics and network every 3 s, docker every 5 s), polls never overlap,
and history is still written at most once per `METRICS_INTERVAL_SEC`. Payloads are the same shapes as the matching REST endpoints
(`/monitor`, `/network`, `/docker`).
