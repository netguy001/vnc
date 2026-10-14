import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware.js';
import { accountSecurity } from '../services/account-security.service.js';
import { auditService } from '../services/audit.service.js';

const RoleSchema = z.enum(['admin', 'operator', 'viewer']);

export function registerAccountRoutes(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (req) => {
    if (/^\/api\/auth\/(users|tokens|totp)/.test(req.url)) await requireAuth(req);
  });

  const who = (req: FastifyRequest) => ({ userId: req.user?.userId, username: req.user?.username, ipAddress: req.ip });
  const bad = (reply: FastifyReply, msg: string) => reply.status(400).send({ error: msg });

  // ---------- Users (admin) ----------
  fastify.get('/api/auth/users', async (_req, reply) => reply.send({ users: accountSecurity.listUsers() }));

  fastify.post('/api/auth/users', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = z
      .object({ username: z.string(), password: z.string(), role: RoleSchema, email: z.string().email().optional() })
      .safeParse(req.body);
    if (!p.success) return bad(reply, 'username, password and role are required');
    const user = await accountSecurity.createUser(p.data);
    auditService.log({ ...who(req), action: 'USER_CREATE', details: `Created user "${user.username}" (${user.role})` });
    return reply.status(201).send({ user });
  });

  fastify.put('/api/auth/users/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const p = z.object({ role: RoleSchema.optional(), newPassword: z.string().optional(), disableTotp: z.boolean().optional() }).safeParse(req.body);
    if (!p.success) return bad(reply, 'Invalid request');
    if (p.data.role) {
      accountSecurity.setRole(req.user!.userId, req.params.id, p.data.role);
      auditService.log({ ...who(req), action: 'USER_ROLE_CHANGE', details: `Set role of ${req.params.id} to ${p.data.role}` });
    }
    if (p.data.newPassword) {
      await accountSecurity.resetPassword(req.params.id, p.data.newPassword);
      auditService.log({ ...who(req), action: 'USER_PASSWORD_RESET', details: `Reset password of ${req.params.id}` });
    }
    if (p.data.disableTotp) {
      accountSecurity.adminDisableTotp(req.params.id);
      auditService.log({ ...who(req), action: 'USER_2FA_RESET', details: `Disabled 2FA for ${req.params.id}` });
    }
    return reply.send({ success: true });
  });

  fastify.delete('/api/auth/users/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    accountSecurity.deleteUser(req.user!.userId, req.params.id);
    auditService.log({ ...who(req), action: 'USER_DELETE', details: `Deleted user ${req.params.id}` });
    return reply.send({ success: true });
  });

  // ---------- API tokens (own) ----------
  fastify.get('/api/auth/tokens', async (req, reply) => reply.send({ tokens: accountSecurity.listTokens(req.user!.userId) }));

  fastify.post('/api/auth/tokens', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = z
      .object({ name: z.string().min(1).max(60), role: RoleSchema.optional(), expiresInDays: z.number().int().min(1).max(3650).nullable().optional() })
      .safeParse(req.body);
    if (!p.success) return bad(reply, 'A token name is required');
    const { token, info } = accountSecurity.createToken(req.user!, p.data);
    auditService.log({ ...who(req), action: 'API_TOKEN_CREATE', details: `Created ${info.role} token "${info.name}"` });
    return reply.status(201).send({ token, info }); // the secret is shown exactly once
  });

  fastify.delete('/api/auth/tokens/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ok = accountSecurity.revokeToken(req.user!.userId, req.params.id);
    if (ok) auditService.log({ ...who(req), action: 'API_TOKEN_REVOKE', details: `Revoked token ${req.params.id}` });
    return reply.send({ success: ok });
  });

  // ---------- Two-factor authentication (own) ----------
  fastify.get('/api/auth/totp', async (req, reply) => reply.send({ enabled: accountSecurity.isTotpEnabled(req.user!.userId) }));

  fastify.post('/api/auth/totp/setup', async (req, reply) => reply.send(accountSecurity.beginTotpSetup(req.user!.userId)));

  fastify.post('/api/auth/totp/enable', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = z.object({ code: z.string().min(6).max(10) }).safeParse(req.body);
    if (!p.success) return bad(reply, 'A 6-digit code is required');
    const recoveryCodes = accountSecurity.confirmTotp(req.user!.userId, p.data.code);
    auditService.log({ ...who(req), action: '2FA_ENABLED', details: 'Two-factor authentication enabled' });
    return reply.send({ success: true, recoveryCodes });
  });

  fastify.post('/api/auth/totp/disable', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = z.object({ password: z.string().min(1) }).safeParse(req.body);
    if (!p.success) return bad(reply, 'Your password is required');
    await accountSecurity.disableTotp(req.user!.userId, p.data.password);
    auditService.log({ ...who(req), action: '2FA_DISABLED', details: 'Two-factor authentication disabled' });
    return reply.send({ success: true });
  });
}
