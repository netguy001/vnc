import { WebSocket } from 'ws';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticateWebSocket } from '../services/security-guard.js';
import { liveService } from '../services/live.service.js';

/** Single multiplexed real-time channel: /api/live (any authenticated role; data is read-only). */
export function registerLiveWebSocket(fastify: FastifyInstance): void {
  liveService.wire();

  fastify.get('/api/live', { websocket: true }, async (connection: any, req: FastifyRequest) => {
    const socket: WebSocket = connection.socket || connection;
    const auth = authenticateWebSocket(req, 'viewer');
    if (!('user' in auth)) {
      socket.close(auth.code, auth.reason);
      return;
    }
    liveService.addClient(socket);
  });
}
