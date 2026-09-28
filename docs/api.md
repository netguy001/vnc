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
    "host": "194.163.150.10",
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
      "sshMessage": "SSH connection successful to 194.163.150.10:22",
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

### `WS /api/servers/:id/vnc?token=<jwt>`
Full-duplex binary proxy between noVNC client and backend VNC TCP server.

### `WS /api/servers/:id/terminal?token=<jwt>&cols=80&rows=24`
Interactive SSH pseudo-terminal stream supporting PTY resizing (`{ type: "resize", cols, rows }`).
