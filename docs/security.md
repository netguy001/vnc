# ServerConsole Security Architecture

## 1. Threat Model & Design Goals
ServerConsole is treated as infrastructure-level software designed to hold sensitive server credentials and execute remote operations.

## 2. Key Safeguards

### Authenticated Encryption at Rest (AES-256-GCM)
- All SSH passwords, SSH private keys, passphrases, and VNC passwords stored in the database are encrypted using authenticated `AES-256-GCM`.
- Each encryption generates a fresh, cryptographically secure 12-byte (96-bit) Initialization Vector (IV).
- A 16-byte authentication tag guarantees integrity; any tampered ciphertext will immediately throw an authentication error and reject decryption.
- The master cryptographic key is supplied via the `MASTER_KEY` environment variable (32 bytes / 64 hex characters) and never stored in the database.

### Strict Credential Sanitization
- Public REST API responses (`ServerDTO`) sanitize credentials before sending them to the client.
- The frontend only knows whether a credential exists (`hasSshPassword`, `hasSshPrivateKey`, `hasVncPassword`) to provide appropriate UI prompts.
- Stack traces and internal error payloads are intercepted by the centralized error handler in production.

### Session Authentication & WebSocket Protection
- Authentication uses bcrypt-hashed passwords (cost factor 10) and signed JWT tokens with 7-day expiration.
- WebSocket routes (`/api/servers/:id/vnc` and `/api/servers/:id/terminal`) authenticate with the httpOnly session cookie (never a token in the URL, which would leak into logs/history), verify the `Origin` header against the allowed frontends to block cross-site WebSocket hijacking, and require at least the `operator` role - all before opening any remote socket.
- Arbitrary destination proxying is strictly forbidden: target hosts and ports are queried directly from the verified database record for that server ID.

### Audit Logging
- Critical actions (`SERVER_CREATE`, `SERVER_UPDATE`, `SERVER_DELETE`, `VNC_CONNECT`, `SSH_TERMINAL_CONNECT`, `SFTP_UPLOAD`, `SFTP_DOWNLOAD`, `LOGIN_SUCCESS`, `LOGIN_FAILURE`) are logged with timestamps, operator usernames, target servers, and client IP addresses.

### CSRF & Transport Security
- Production deployments use Nginx with SSL/TLS termination, secure cookies, and strict origin verification.

### Roles (RBAC)
Every authenticated request is checked against a role policy in `middleware/auth.middleware.ts`:

| Role | Can |
|---|---|
| `viewer` | Dashboards, telemetry, alerts, read-only views. **Not** terminal/VNC, file contents, VNC credentials, logs, exports. |
| `operator` | Viewer + terminal, VNC, SFTP, logs, systemd/Docker start-stop-restart, network probes, AI diagnosis. |
| `admin` | Everything: server CRUD, firewall, fail2ban, runbooks, plugins, users, alert channels, audit purge. |

Admins manage users in **Settings > Access & 2FA**. The last administrator cannot be demoted or deleted.

### Two-factor authentication & API tokens
- Optional TOTP (RFC 6238) per user, with single-use recovery codes (stored bcrypt-hashed) and replay protection. Secrets are encrypted at rest.
- API tokens (`ioc_...`) for automation are stored only as SHA-256 hashes, shown once, optionally expiring, capped at their owner's role, and **cannot** manage accounts, settings or plugins.

### Brute-force protection
Layered in-memory limits: 5 failures per (IP + username), 30 per IP, 20 per username within 15 minutes. The tight limit is per-pair so an attacker cannot easily lock the real owner out.

### SSH host key pinning (trust on first use)
The first host-key fingerprint seen for a server is stored; any later change blocks the connection (possible man-in-the-middle). After a legitimate rebuild, an admin can reset the pinned key from the server header.

### Secrets management
`MASTER_KEY` and `JWT_SECRET` must be strong, unique values. The public defaults that ship in the repository are never used: if the environment does not supply strong values, random ones are generated once into `data/secrets.json` (mode 0600, gitignored) and any credentials sealed with the old default key are re-encrypted automatically (with a database backup). **Back up `data/secrets.json` / your `MASTER_KEY`** - without it stored credentials cannot be decrypted.

### Command-injection hardening
Anything interpolated into a remote shell command is either validated against a strict pattern (service/container names, ports, IPs, jails, log paths under `/var/log`) or single-quoted with POSIX escaping (`shQuote`); log filters use literal `grep -F`. Regression tests live in `apps/server/src/tests/ops.test.ts`.

### Plugins
See [plugins.md](plugins.md) - plugins are trusted in-process code; permissions are a declared-capability contract, not a sandbox.

### AI assistant (optional)
Disabled unless `ANTHROPIC_API_KEY` is set. It sends a read-only snapshot (resource usage, top processes, failed units, recent error-level log lines) to the Anthropic API after in-browser consent, with obvious secrets redacted first. It only gives advice and never executes commands.

### Other defaults
The backend binds to `127.0.0.1` unless `HOST` is set (Docker sets `0.0.0.0`); responses carry `nosniff`, `X-Frame-Options: DENY`, `no-referrer` and `no-store`; set `COOKIE_SECURE=true` behind HTTPS.
