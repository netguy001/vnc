import { WebSocket } from 'ws';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticateWebSocket } from '../services/security-guard.js';
import { serverService } from '../services/server.service.js';
import { sshService } from '../services/ssh.service.js';
import { auditService } from '../services/audit.service.js';

export function registerTerminalWebSocket(fastify: FastifyInstance): void {
  fastify.get(
    '/api/servers/:id/terminal',
    { websocket: true },
    async (connection: any, req: FastifyRequest<{ Params: { id: string }; Querystring: { cols?: string; rows?: string } }>) => {
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

      const cols = parseInt(req.query.cols || '80', 10);
      const rows = parseInt(req.query.rows || '24', 10);

      req.log.info({ user: user.username, serverId: id }, 'Opening SSH terminal session');

      auditService.log({
        userId: user.userId,
        username: user.username,
        action: 'SSH_TERMINAL_CONNECT',
        serverId: creds.server.id,
        serverName: creds.server.name,
        details: `Connected to SSH shell on ${creds.server.host}:${creds.server.sshPort}`,
        ipAddress: req.ip,
      });

      try {
        const { client, stream } = await sshService.startInteractiveShell(creds, cols, rows);
        serverService.updateStatus(id, 'connected');

        let isClosed = false;
        const cleanup = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              stream.close();
            } catch {}
            try {
              client.end();
            } catch {}
            try {
              if (socket.readyState === WebSocket.OPEN) {
                socket.close(1000, 'Terminal session ended');
              }
            } catch {}
          }
        };

        // Forward SSH stream data to WebSocket
        stream.on('data', (data: Buffer) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(data.toString('utf-8'));
          }
        });

        stream.stderr.on('data', (data: Buffer) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(data.toString('utf-8'));
          }
        });

        stream.on('close', () => {
          cleanup();
        });

        // Forward WebSocket input to SSH shell or handle resize
        socket.on('message', (rawMsg: Buffer | string) => {
          try {
            const str = rawMsg.toString();
            // Check if it's a JSON control message (e.g. resize)
            if (str.startsWith('{') && str.endsWith('}')) {
              try {
                const parsed = JSON.parse(str);
                if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                  stream.setWindow(parsed.rows, parsed.cols, 0, 0);
                  return;
                }
              } catch {
                // Not JSON, fall through to write standard text
              }
            }

            stream.write(rawMsg);
          } catch (err: any) {
            req.log.error({ err: err.message }, 'Failed to write to SSH stream');
          }
        });

        socket.on('close', () => {
          cleanup();
        });

        socket.on('error', (err) => {
          req.log.error({ err: err.message }, 'Terminal WebSocket error');
          cleanup();
        });
      } catch (err: any) {
        req.log.error({ err: err.message, serverId: id }, 'SSH connection error');
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(`\r\n\x1b[31mSSH connection failed: ${err.message}\x1b[0m\r\n`);
          socket.close(1011, err.message);
        }
      }
    }
  );
}
