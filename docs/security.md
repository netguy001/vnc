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
- WebSocket routes (`/api/servers/:id/vnc` and `/api/servers/:id/terminal`) enforce token verification before opening any remote sockets.
- Arbitrary destination proxying is strictly forbidden: target hosts and ports are queried directly from the verified database record for that server ID.

### Audit Logging
- Critical actions (`SERVER_CREATE`, `SERVER_UPDATE`, `SERVER_DELETE`, `VNC_CONNECT`, `SSH_TERMINAL_CONNECT`, `SFTP_UPLOAD`, `SFTP_DOWNLOAD`, `LOGIN_SUCCESS`, `LOGIN_FAILURE`) are logged with timestamps, operator usernames, target servers, and client IP addresses.

### CSRF & Transport Security
- Production deployments use Nginx with SSL/TLS termination, secure cookies, and strict origin verification.
