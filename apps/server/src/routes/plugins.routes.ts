import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth, roleAtLeast } from '../middleware/auth.middleware.js';
import { pluginService, RawResponse } from '../plugins/plugin.service.js';
import { auditService } from '../services/audit.service.js';

export function registerPluginRoutes(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/plugin-manager') || req.url.startsWith('/api/plugins/')) await requireAuth(req);
  });

  // UI descriptors for the sidebar (any authenticated user)
  fastify.get('/api/plugin-manager/ui', async (_req, reply) => reply.send({ plugins: pluginService.uiPages() }));

  // Management (admin only - enforced by the role policy)
  fastify.get('/api/plugin-manager', async (_req, reply) => reply.send({ plugins: pluginService.list() }));

  fastify.post('/api/plugin-manager/:id/enable', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = z.object({ approvedPermissions: z.array(z.string()) }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'approvedPermissions (array) required' });
    await pluginService.enable(req.params.id, body.data.approvedPermissions);
    auditService.log({
      userId: req.user?.userId,
      username: req.user?.username,
      action: 'PLUGIN_ENABLE',
      details: `Enabled plugin ${req.params.id} with permissions: ${body.data.approvedPermissions.join(', ') || 'none'}`,
      ipAddress: req.ip,
    });
    return reply.send({ success: true });
  });

  fastify.post('/api/plugin-manager/:id/disable', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await pluginService.disable(req.params.id);
    auditService.log({
      userId: req.user?.userId,
      username: req.user?.username,
      action: 'PLUGIN_DISABLE',
      details: `Disabled plugin ${req.params.id}`,
      ipAddress: req.ip,
    });
    return reply.send({ success: true });
  });

  // Plugin-provided endpoints: /api/plugins/<pluginId>/<path...>; each route declares its own minimum role.
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/api/plugins/:pluginId/*',
    handler: async (req: FastifyRequest<{ Params: { pluginId: string; '*': string } }>, reply: FastifyReply) => {
      const result = await pluginService.handleRequest(
        req.params.pluginId,
        req.method,
        req.params['*'] || '',
        { query: req.query, body: req.body, user: { username: req.user!.username, role: req.user!.role } },
        roleAtLeast
      );
      if (result instanceof RawResponse) {
        return reply.status(result.status).header('content-type', result.contentType).send(result.body);
      }
      return reply.send(result ?? { success: true });
    },
  });
}
