import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware.js';
import { alertService } from '../services/alert.service.js';
import { notifierService } from '../services/notifier.service.js';
import { metricsStore } from '../services/metrics-store.service.js';
import { serverService } from '../services/server.service.js';
import { auditService } from '../services/audit.service.js';

const RuleSchema = z.object({
  name: z.string().min(1).max(80),
  serverId: z.string().nullable().optional(),
  metric: z.enum(['cpu', 'mem', 'disk', 'load', 'offline']),
  threshold: z.number(),
  durationMin: z.number().int().min(0).max(1440),
  channelIds: z.array(z.string()).max(20),
});

const ChannelSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.string().min(1).max(40),
  config: z.record(z.string().max(500)),
});

export function registerAlertRoutes(fastify: FastifyInstance): void {
  // Note: /api/servers/* is already guarded by the server routes' auth hook.
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/alerts')) await requireAuth(req);
  });

  const who = (req: FastifyRequest) => ({ userId: req.user?.userId, username: req.user?.username, ipAddress: req.ip });

  fastify.get(
    '/api/servers/:id/metrics/history',
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: { range?: string } }>, reply: FastifyReply) => {
      if (!serverService.getServerById(req.params.id)) return reply.status(404).send({ error: 'Server not found' });
      return reply.send({
        range: req.query.range || '1h',
        intervalSec: metricsStore.intervalMs / 1000,
        samples: metricsStore.history(req.params.id, req.query.range || '1h'),
      });
    }
  );

  // ----- Rules -----
  fastify.get('/api/alerts/rules', async (_req, reply) => reply.send({ rules: alertService.listRules() }));

  fastify.post('/api/alerts/rules', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = RuleSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors[0]?.message || 'Invalid rule' });
    const rule = alertService.createRule(parsed.data);
    auditService.log({ ...who(req), action: 'ALERT_RULE_CREATE', details: `Created alert rule "${rule.name}"` });
    return reply.status(201).send({ rule });
  });

  fastify.put('/api/alerts/rules/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: { isEnabled?: boolean } }>, reply: FastifyReply) => {
    const enabled = (req.body as any)?.isEnabled;
    if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'isEnabled (boolean) required' });
    if (!alertService.setRuleEnabled(req.params.id, enabled)) return reply.status(404).send({ error: 'Rule not found' });
    return reply.send({ success: true });
  });

  fastify.delete('/api/alerts/rules/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ok = alertService.deleteRule(req.params.id);
    if (ok) auditService.log({ ...who(req), action: 'ALERT_RULE_DELETE', details: `Deleted alert rule ${req.params.id}` });
    return reply.send({ success: ok });
  });

  // ----- Events -----
  fastify.get('/api/alerts/events', async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    return reply.send({ events: alertService.listEvents(parseInt(req.query.limit || '50', 10) || 50) });
  });

  // ----- Notification channels (admin-only reads, because they reveal where alerts are routed) -----
  fastify.get('/api/alerts/channels', async (_req, reply) =>
    reply.send({ channels: notifierService.list(), drivers: notifierService.listDrivers() })
  );

  fastify.post('/api/alerts/channels', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ChannelSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors[0]?.message || 'Invalid channel' });
    const channel = notifierService.create(parsed.data);
    auditService.log({ ...who(req), action: 'NOTIFICATION_CHANNEL_CREATE', details: `Added ${channel.type} channel "${channel.name}"` });
    return reply.status(201).send({ channel });
  });

  fastify.put('/api/alerts/channels/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const enabled = (req.body as any)?.isEnabled;
    if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'isEnabled (boolean) required' });
    if (!notifierService.setEnabled(req.params.id, enabled)) return reply.status(404).send({ error: 'Channel not found' });
    return reply.send({ success: true });
  });

  fastify.delete('/api/alerts/channels/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ok = notifierService.delete(req.params.id);
    if (ok) auditService.log({ ...who(req), action: 'NOTIFICATION_CHANNEL_DELETE', details: `Deleted channel ${req.params.id}` });
    return reply.send({ success: ok });
  });

  fastify.post('/api/alerts/channels/:id/test', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await notifierService.sendTo(req.params.id, {
        severity: 'info',
        title: 'IOC test notification',
        body: 'If you can read this, the channel works.',
      });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(502).send({ error: `Delivery failed: ${err.message}` });
    }
  });
}
