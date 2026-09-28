# ServerConsole Architecture Guide

## 1. Overview
ServerConsole is a production-grade, local-first web application engineered to manage remote Linux servers and desktops through a unified interface. It combines:
- Real-time VNC remote desktop access
- Interactive low-latency SSH terminals
- Robust SFTP file management
- Live system telemetry (CPU, RAM, Disk, Load, Processes)
- Docker container state inspection

## 2. Architectural Blueprint

```
+-------------------------------------------------------------+
|                     React 18 SPA (Vite)                     |
|  - noVNC RFB Canvas Client                                  |
|  - xterm.js Terminal Emulator                               |
|  - SFTP File Explorer                                       |
|  - Real-time Telemetry Dashboards                           |
+------------------------------+------------------------------+
                               |
            HTTPS / WSS        | (Never exposes server secrets)
                               v
+-------------------------------------------------------------+
|                   Node.js / Fastify Backend                 |
|  - AES-256-GCM Credential Vault                             |
|  - JWT Session & Cookie Authenticator                       |
|  - WebSocket Binary VNC Bridge                              |
|  - WebSocket Interactive PTY Terminal Bridge                |
|  - SFTP Stream Pipeline                                     |
|  - Linux Sysstat & Docker Telemetry Collector               |
|  - SQLite (WAL) / PostgreSQL Data Layer                     |
+------------------+-----------------------+------------------+
                   |                       |
          Raw RFB  |                       |  SSH / SFTP
          TCP 5900 |                       |  TCP 22
                   v                       v
+------------------+-------+       +-------+------------------+
|      VNC Remote Server   |       |    Target Linux Server   |
|   (TigerVNC / x11vnc)    |       |   (Contabo / VPS / VM)   |
+--------------------------+       +--------------------------+
```

## 3. Core Principles

### Credential Isolation
No server credentials (passwords, private keys, passphrases) are ever transmitted to or held in browser memory. The frontend receives only metadata (`hasSshPassword: true`, `hasSshPrivateKey: true`). Decryption occurs exclusively in backend memory when establishing connections.

### Bridge Proxying
The browser never connects directly to VNC or SSH ports.
- **VNC**: The backend terminates the browser's WebSocket connection and opens a raw TCP socket to the server's VNC port, translating binary RFB frames bidirectionally.
- **SSH**: The backend initiates an authenticated SSH2 session, allocates an interactive pseudo-terminal (PTY `xterm-256color`), and streams terminal output to the client while translating resize control events.

### Local-First Persistence
Uses native Node.js SQLite with Write-Ahead Logging (`WAL`) enabled for high-speed local concurrency, architected via an abstract database client interface so PostgreSQL can replace it without rewriting business logic.
