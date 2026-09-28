# VNC Remote Desktop Architecture & Guide

## 1. How VNC Works in ServerConsole

ServerConsole uses the official `@novnc/novnc` library in the browser and a dedicated binary WebSocket-to-TCP bridge in the Fastify backend.

### Architecture:
```
[Browser / React]
      |
   (binary WebSocket frames)
      v
[Node.js Backend Proxy] (/api/servers/:id/vnc)
  1. Authenticates session JWT
  2. Queries target VNC host:port from DB
  3. Establishes raw TCP socket to VNC server
  4. Pipes bidirectional RFB 3.8 frames
      v
   (raw TCP stream)
      v
[Remote VNC Server] (TigerVNC / x11vnc / QEMU)
```

## 2. Features Supported
- **Full Mouse & Keyboard Input**: Supports clicks, drags, mouse wheel, cursor position, and international keyboard input.
- **Special Key Combos**:
  - `Ctrl`, `Alt`, `Esc`, `Tab`, `Windows/Super`
  - Dedicated `Ctrl+Alt+Del` sequence for unlocking screens and opening task managers.
- **Clipboard Integration**:
  - **Paste to Remote Desktop**: Send clipboard text directly into the remote VNC session using RFB `ClientCutText` protocol messages.
  - **Copy from Remote Desktop**: Listens for `clipboard` events emitted by the VNC desktop and provides a one-click copy to the local OS clipboard.
- **Display Controls**:
  - **Fit-to-Screen vs 1:1 Scale**: Dynamic viewport scaling toggle.
  - **Fullscreen**: Expands canvas to native browser fullscreen.
  - **Screenshot**: Captures instant PNG snapshots of the active framebuffer.
  - **Connection State Machine**: Clean state transitions with auto-reconnect.
