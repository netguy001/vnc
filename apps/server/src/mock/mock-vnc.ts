import net from 'node:net';

export class MockVncServer {
  private server: net.Server | null = null;
  public port: number;
  public width = 800;
  public height = 600;

  constructor(port = 5901) {
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`[MockVNC] RFB 3.8 test server listening on 0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleClient(socket: net.Socket) {
    let state: 'HANDSHAKE_VERSION' | 'HANDSHAKE_SECURITY' | 'CLIENT_INIT' | 'NORMAL' = 'HANDSHAKE_VERSION';
    let buffer = Buffer.alloc(0);

    // 1. Send RFB 003.008 protocol version
    socket.write(Buffer.from('RFB 003.008\n'));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (state === 'HANDSHAKE_VERSION') {
        if (buffer.length >= 12) {
          const clientVersion = buffer.subarray(0, 12).toString();
          buffer = buffer.subarray(12);
          // 2. Send Security Types: 1 type available (Type 1 = None / No Auth)
          const secTypes = Buffer.from([1, 1]);
          socket.write(secTypes);
          state = 'HANDSHAKE_SECURITY';
        }
      }

      if (state === 'HANDSHAKE_SECURITY') {
        if (buffer.length >= 1) {
          const selectedType = buffer[0];
          buffer = buffer.subarray(1);
          // 3. Send SecurityResult: 0 = OK (4 bytes uint32 BE)
          const result = Buffer.alloc(4);
          result.writeUInt32BE(0, 0);
          socket.write(result);
          state = 'CLIENT_INIT';
        }
      }

      if (state === 'CLIENT_INIT') {
        if (buffer.length >= 1) {
          const sharedFlag = buffer[0];
          buffer = buffer.subarray(1);

          // 4. Send ServerInit
          const serverName = Buffer.from('ServerConsole Local Test Desktop (Ubuntu 24.04)');
          const initBuf = Buffer.alloc(24 + serverName.length);

          // Framebuffer width & height (uint16 BE)
          initBuf.writeUInt16BE(this.width, 0);
          initBuf.writeUInt16BE(this.height, 2);

          // Pixel format:
          initBuf.writeUInt8(32, 4); // bits-per-pixel: 32
          initBuf.writeUInt8(24, 5); // depth: 24
          initBuf.writeUInt8(0, 6);  // big-endian-flag: 0 (little endian)
          initBuf.writeUInt8(1, 7);  // true-colour-flag: 1
          initBuf.writeUInt16BE(255, 8);  // red-max: 255
          initBuf.writeUInt16BE(255, 10); // green-max: 255
          initBuf.writeUInt16BE(255, 12); // blue-max: 255
          initBuf.writeUInt8(16, 14); // red-shift: 16
          initBuf.writeUInt8(8, 15);  // green-shift: 8
          initBuf.writeUInt8(0, 16);  // blue-shift: 0
          // 3 bytes padding (17, 18, 19)

          // Name length & string
          initBuf.writeUInt32BE(serverName.length, 20);
          serverName.copy(initBuf, 24);

          socket.write(initBuf);
          state = 'NORMAL';
        }
      }

      if (state === 'NORMAL') {
        this.processNormalMessages(socket, buffer, (newBuf) => {
          buffer = newBuf;
        });
      }
    });

    socket.on('error', (err) => {
      // Client disconnected or socket error
    });
  }

  private processNormalMessages(
    socket: net.Socket,
    buffer: Buffer,
    setBuffer: (b: any) => void
  ) {
    while (buffer.length > 0) {
      const msgType = buffer[0];

      if (msgType === 0) {
        // SetPixelFormat (20 bytes)
        if (buffer.length < 20) break;
        buffer = buffer.subarray(20);
      } else if (msgType === 2) {
        // SetEncodings (4 bytes header + 4 * n encodings)
        if (buffer.length < 4) break;
        const count = buffer.readUInt16BE(2);
        if (buffer.length < 4 + count * 4) break;
        buffer = buffer.subarray(4 + count * 4);
      } else if (msgType === 3) {
        // FramebufferUpdateRequest (10 bytes)
        if (buffer.length < 10) break;
        const incremental = buffer[1];
        const x = buffer.readUInt16BE(2);
        const y = buffer.readUInt16BE(4);
        const w = buffer.readUInt16BE(6);
        const h = buffer.readUInt16BE(8);
        buffer = buffer.subarray(10);

        this.sendFramebufferUpdate(socket, x, y, w, h);
      } else if (msgType === 4) {
        // KeyEvent (8 bytes: type, downFlag, 2 pad, key uint32)
        if (buffer.length < 8) break;
        const downFlag = buffer[1];
        const key = buffer.readUInt32BE(4);
        buffer = buffer.subarray(8);
      } else if (msgType === 5) {
        // PointerEvent (6 bytes: type, buttonMask, x uint16, y uint16)
        if (buffer.length < 6) break;
        const mask = buffer[1];
        const px = buffer.readUInt16BE(2);
        const py = buffer.readUInt16BE(4);
        buffer = buffer.subarray(6);
      } else if (msgType === 6) {
        // ClientCutText (8 bytes + length)
        if (buffer.length < 8) break;
        const textLen = buffer.readUInt32BE(4);
        if (buffer.length < 8 + textLen) break;
        const text = buffer.subarray(8, 8 + textLen).toString('utf8');
        buffer = buffer.subarray(8 + textLen);
        console.log(`[MockVNC] Received ClientCutText clipboard: "${text}"`);
      } else {
        // Unknown or unhandled message; discard 1 byte
        buffer = buffer.subarray(1);
      }
    }

    setBuffer(buffer);
  }

  private sendFramebufferUpdate(
    socket: net.Socket,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    if (!socket.writable) return;

    // Send 1 rectangle with raw encoding (encoding type 0)
    // Header: msgType=0 (1 byte), padding (1 byte), numberOfRectangles=1 (uint16 BE) -> 4 bytes
    // Rect Header: x (uint16), y (uint16), w (uint16), h (uint16), encoding=0 (int32) -> 12 bytes
    const header = Buffer.alloc(16);
    header.writeUInt8(0, 0); // message-type = 0 (FramebufferUpdate)
    header.writeUInt8(0, 1); // padding
    header.writeUInt16BE(1, 2); // numberOfRectangles = 1

    header.writeUInt16BE(x, 4);
    header.writeUInt16BE(y, 6);
    header.writeUInt16BE(w, 8);
    header.writeUInt16BE(h, 10);
    header.writeInt32BE(0, 12); // encoding-type = 0 (RAW)

    // Render a high-tech dark desktop gradient background with a simulated top status bar
    const pixelBytes = w * h * 4;
    const pixels = Buffer.alloc(pixelBytes);

    for (let row = 0; row < h; row++) {
      const globalY = y + row;
      for (let col = 0; col < w; col++) {
        const globalX = x + col;
        const offset = (row * w + col) * 4;

        let r = 15;
        let g = 23;
        let b = 42; // Dark slate background

        // Top desktop panel (first 32px)
        if (globalY < 32) {
          r = 30;
          g = 41;
          b = 59;
          // Accent dot
          if (globalX >= 16 && globalX <= 24 && globalY >= 12 && globalY <= 20) {
            r = 34;
            g = 197;
            b = 94; // emerald green
          }
        } else if (globalY > 100 && globalY < 450 && globalX > 80 && globalX < 720) {
          // Simulated terminal window in center of desktop
          if (globalY < 130) {
            r = 51;
            g = 65;
            b = 85; // Window titlebar
          } else {
            r = 10;
            g = 15;
            b = 26; // Terminal black background
            // Draw a subtle prompt line
            if (globalY >= 150 && globalY <= 152 && globalX >= 100 && globalX <= 350) {
              r = 56;
              g = 189;
              b = 248; // cyan prompt
            }
          }
        }

        // 32-bit truecolor format: B, G, R, A (little-endian)
        pixels[offset + 0] = b;
        pixels[offset + 1] = g;
        pixels[offset + 2] = r;
        pixels[offset + 3] = 255;
      }
    }

    socket.write(Buffer.concat([header, pixels]));
  }
}
