import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware.js';
import { auditService } from '../services/audit.service.js';
import { serverService } from '../services/server.service.js';

export function registerAuditRoutes(fastify: FastifyInstance): void {
  // Health check (public)
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // Audit logs (authenticated)
  fastify.get('/api/audit-logs', async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    await requireAuth(req, reply);
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = auditService.getLogs(limit);
    return reply.send({ logs });
  });

  // System stats summary (authenticated)
  fastify.get('/api/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply);
    const servers = serverService.listServers();

    const total = servers.length;
    const connected = servers.filter((s) => s.status === 'connected').length;
    const disconnected = servers.filter((s) => s.status === 'disconnected').length;
    const error = servers.filter((s) => s.status === 'error').length;

    // Groups
    const groups = Array.from(new Set(servers.map((s) => s.serverGroup || 'Default')));

    return reply.send({
      totalServers: total,
      connected,
      disconnected,
      error,
      groups,
    });
  });
}
