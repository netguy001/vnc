import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware.js';
import { serverService } from '../services/server.service.js';
import { opsService, SERVICE_ACTIONS, CONTAINER_ACTIONS, ServiceAction, ContainerAction } from '../services/ops.service.js';
import { runbookService } from '../services/runbook.service.js';
import { aiService } from '../services/ai.service.js';
import { auditService } from '../services/audit.service.js';

const RunbookSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().default(''),
  script: z.string().min(1).max(50_000),
  targetType: z.enum(['all', 'group', 'servers']),
  targetValue: z.string().max(2000).optional().default(''),
  intervalMin: z.number().int().min(1).max(10080).nullable().optional().default(null),
  timeoutSec: z.number().int().min(5).max(600).optional().default(60),
});

export function registerOpsRoutes(fastify: FastifyInstance): void {
  // /api/servers/* is guarded by the server routes' hook; runbooks need their own.
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/runbooks') || req.url.startsWith('/api/ai/')) await requireAuth(req);
  });

  const credsOr404 = (id: string, reply: FastifyReply) => {
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds?.server) {
      reply.status(404).send({ error: 'Server not found' });
      return null;
    }
    return creds;
  };
  const who = (req: FastifyRequest) => ({ userId: req.user?.userId, username: req.user?.username, ipAddress: req.ip });

  // ---------- systemd services ----------
  fastify.get('/api/servers/:id/services', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const creds = credsOr404(req.params.id, reply);
    if (!creds) return;
    return reply.send(await opsService.listServices(creds));
  });

  fastify.post(
    '/api/servers/:id/services/:name/:action',
    async (req: FastifyRequest<{ Params: { id: string; name: string; action: string } }>, reply: FastifyReply) => {
      const creds = credsOr404(req.params.id, reply);
      if (!creds) return;
      const { name, action } = req.params;
      if (!SERVICE_ACTIONS.includes(action as ServiceAction)) return reply.status(400).send({ error: 'Unsupported action' });
      const result = await opsService.serviceAction(creds, name, action as ServiceAction);
      auditService.log({
        ...who(req),
        action: 'SERVICE_ACTION',
        serverId: creds.server.id,
        serverName: creds.server.name,
        details: `systemctl ${action} ${name}`,
      });
      return reply.send({ success: true, state: result });
    }
  );

  // ---------- logs ----------
  fastify.get('/api/servers/:id/logs/sources', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const creds = credsOr404(req.params.id, reply);
    if (!creds) return;
    return reply.send({ files: await opsService.listLogSources(creds) });
  });

  fastify.get(
    '/api/servers/:id/logs',
    async (
      req: FastifyRequest<{ Params: { id: string }; Querystring: { source?: string; lines?: string; filter?: string; since?: string } }>,
      reply: FastifyReply
    ) => {
      const creds = credsOr404(req.params.id, reply);
      if (!creds) return;
      const { source, lines, filter, since } = req.query;
      if (!source) return reply.status(400).send({ error: 'source is required' });
      return reply.send(await opsService.readLogs(creds, { source, lines: lines ? parseInt(lines, 10) : undefined, filter, since }));
    }
  );

  // ---------- docker container actions & logs ----------
  fastify.post(
    '/api/servers/:id/docker/containers/:cid/:action',
    async (req: FastifyRequest<{ Params: { id: string; cid: string; action: string } }>, reply: FastifyReply) => {
      const creds = credsOr404(req.params.id, reply);
      if (!creds) return;
      const { cid, action } = req.params;
      if (!CONTAINER_ACTIONS.includes(action as ContainerAction)) return reply.status(400).send({ error: 'Unsupported action' });
      await opsService.containerAction(creds, cid, action as ContainerAction);
      auditService.log({
        ...who(req),
        action: 'DOCKER_ACTION',
        serverId: creds.server.id,
        serverName: creds.server.name,
        details: `docker ${action} ${cid}`,
      });
      return reply.send({ success: true });
    }
  );

  fastify.get(
    '/api/servers/:id/docker/containers/:cid/logs',
    async (req: FastifyRequest<{ Params: { id: string; cid: string }; Querystring: { lines?: string; filter?: string } }>, reply: FastifyReply) => {
      const creds = credsOr404(req.params.id, reply);
      if (!creds) return;
      return reply.send(
        await opsService.readLogs(creds, {
          source: `docker:${req.params.cid}`,
          lines: req.query.lines ? parseInt(req.query.lines, 10) : undefined,
          filter: req.query.filter,
        })
      );
    }
  );

  // ---------- AI assistant (opt-in; advice only, never executes anything) ----------
  fastify.get('/api/ai/status', async (_req, reply) => reply.send({ enabled: aiService.enabled, model: aiService.model }));

  fastify.post(
    '/api/servers/:id/ai/diagnose',
    async (req: FastifyRequest<{ Params: { id: string }; Body: { question?: string } }>, reply: FastifyReply) => {
      const creds = credsOr404(req.params.id, reply);
      if (!creds) return;
      const result = await aiService.diagnose(creds, req.user!.userId, (req.body as any)?.question);
      auditService.log({
        ...who(req),
        action: 'AI_DIAGNOSE',
        serverId: creds.server.id,
        serverName: creds.server.name,
        details: `AI assistant analysed a server snapshot (${result.contextChars} chars sent to the model provider)`,
      });
      return reply.send(result);
    }
  );

  // ---------- runbooks (admin only) ----------
  fastify.get('/api/runbooks', async (_req, reply) => reply.send({ runbooks: runbookService.list(), runs: runbookService.listRuns(undefined, 20) }));

  fastify.post('/api/runbooks', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = RunbookSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors[0]?.message || 'Invalid runbook' });
    const runbook = runbookService.create(parsed.data, req.user?.username);
    auditService.log({ ...who(req), action: 'RUNBOOK_CREATE', details: `Created runbook "${runbook.name}"` });
    return reply.status(201).send({ runbook });
  });

  fastify.delete('/api/runbooks/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ok = runbookService.delete(req.params.id);
    if (ok) auditService.log({ ...who(req), action: 'RUNBOOK_DELETE', details: `Deleted runbook ${req.params.id}` });
    return reply.send({ success: ok });
  });

  fastify.post('/api/runbooks/:id/run', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const run = await runbookService.run(req.params.id, 'manual', req.user?.username);
    return reply.send({ run });
  });

  fastify.get('/api/runbooks/:id/runs', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) =>
    reply.send({ runs: runbookService.listRuns(req.params.id, 30) })
  );
}
