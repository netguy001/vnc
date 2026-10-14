import { WebSocket } from 'ws';
import net from 'node:net';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticateWebSocket } from '../services/security-guard.js';
import { serverService } from '../services/server.service.js';
import { auditService } from '../services/audit.service.js';

export function registerVncWebSocket(fastify: FastifyInstance): void {
  fastify.get(
    '/api/servers/:id/vnc',
    { websocket: true },
    async (connection: any, req: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, never> }>) => {
      const socket: WebSocket = connection.socket || connection;
      const { id } = req.params;

      // 1. Authenticate via session cookie + Origin check (no tokens in the URL)
      const authResult = authenticateWebSocket(req, 'operator');
      if (!('user' in authResult)) {
        socket.close(authResult.code, authResult.reason);
        return;
      }
      const user = authResult.user;

      // 2. Fetch server and credentials
      const creds = serverService.getDecryptedCredentials(id);
      if (!creds || !creds.server) {
        socket.close(4004, 'Server not found');
        return;
      }

      if (!creds.server.vncEnabled) {
        socket.close(4003, 'VNC is disabled for this server');
        return;
      }

      const vncHost = creds.server.vncHost || creds.server.host;
      const vncPort = creds.server.vncPort || 5900;

      req.log.info({ user: user.username, serverId: id, vncHost, vncPort }, 'Opening VNC proxy bridge');

      auditService.log({
        userId: user.userId,
        username: user.username,
        action: 'VNC_CONNECT',
        serverId: creds.server.id,
        serverName: creds.server.name,
        details: `Connected to VNC at ${vncHost}:${vncPort}`,
        ipAddress: req.ip,
      });

      // 3. Connect TCP socket to target VNC server
      const tcpSocket = net.createConnection({ host: vncHost, port: vncPort });

      let isClosed = false;
      const pendingToTcp: Buffer[] = [];
      const pendingToWs: Buffer[] = [];

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            tcpSocket.destroy();
          } catch {}
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.close(1000, 'VNC session closed');
            }
          } catch {}
        }
      };

      tcpSocket.on('connect', () => {
        req.log.info({ serverId: id }, 'Connected to backend VNC TCP server');
        serverService.updateStatus(id, 'connected');
        // Flush any buffered messages from WebSocket client
        while (pendingToTcp.length > 0) {
          const chunk = pendingToTcp.shift();
          if (chunk) tcpSocket.write(chunk);
        }
      });

      tcpSocket.on('data', (data: Buffer) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data, { binary: true });
        } else {
          pendingToWs.push(data);
        }
      });

      tcpSocket.on('error', (err) => {
        req.log.error({ err: err.message, serverId: id }, 'VNC TCP socket error');
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1011, `VNC bridge error: ${err.message}`);
        }
        cleanup();
      });

      tcpSocket.on('close', () => {
        cleanup();
      });

      const flushToWs = () => {
        while (pendingToWs.length > 0) {
          const chunk = pendingToWs.shift();
          if (chunk && socket.readyState === WebSocket.OPEN) {
            socket.send(chunk, { binary: true });
          }
        }
      };

      if (socket.readyState === WebSocket.OPEN) {
        flushToWs();
      } else {
        socket.on('open', flushToWs);
      }

      socket.on('message', (message: Buffer | string) => {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message);
        if (tcpSocket.writable) {
          tcpSocket.write(buf);
        } else {
          pendingToTcp.push(buf);
        }
      });

      socket.on('close', () => {
        cleanup();
      });

      socket.on('error', (err) => {
        req.log.error({ err: err.message }, 'VNC WebSocket error');
        cleanup();
      });
    }
  );
}
