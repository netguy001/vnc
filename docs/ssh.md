# SSH Terminal Architecture & Guide

## 1. How SSH Works in ServerConsole

ServerConsole uses `xterm.js` in the frontend and `ssh2` in the backend.

### Architecture:
```
[Browser / xterm.js]
      |
   (UTF-8 stream & JSON control messages)
      v
[Node.js Backend WebSocket] (/api/servers/:id/terminal)
  1. Authenticates session JWT
  2. Decrypts stored SSH credentials using AES-256-GCM
  3. Establishes SSH connection using ssh2 Client
  4. Spawns interactive PTY shell (`xterm-256color`)
  5. Bi-directional I/O pipe with dynamic terminal resize handler
      v
   (Encrypted SSH2 protocol stream)
      v
[Target Linux Server] (sshd)
```

## 2. Terminal Features
- True interactive terminal emulator with ANSI color support, cursor styles, scrollback buffer, and font rendering.
- Real-time PTY window resizing: adjusts remote columns and rows dynamically as the browser window resizes (`setWindow(rows, cols, 0, 0)`).
- Copy & paste with native clipboard integration.
- Clear screen buffer and session reconnect tools.
