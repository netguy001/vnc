import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authService } from '../services/auth.service.js';
import { preferencesService } from '../services/preferences.service.js';
import { snippetsService } from '../services/snippets.service.js';
import { serverService } from '../services/server.service.js';
import { auditService } from '../services/audit.service.js';
import {
  UpdatePreferencesSchema,
  CommandSnippetCreateSchema,
  ChangePasswordSchema,
  UpdateAccountSchema,
  ServerCreateSchema,
} from '@server-console/shared';

export function registerSettingsRoutes(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/settings')) {
      await requireAuth(req, reply);
    }
  });

  // Preferences
  fastify.get('/api/settings/preferences', async (req: FastifyRequest, reply: FastifyReply) => {
    const prefs = preferencesService.getPreferences(req.user!.userId);
    return reply.send({ preferences: prefs });
  });

  fastify.put('/api/settings/preferences', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = UpdatePreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0]?.message || 'Invalid input' });
    }
    const prefs = preferencesService.updatePreferences(req.user!.userId, parseResult.data);
    return reply.send({ preferences: prefs });
  });

  // Account
  fastify.put('/api/settings/account', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = UpdateAccountSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0]?.message || 'Invalid input' });
    }
    try {
      const updates: { username?: string; email?: string } = {};
      if (parseResult.data.username) updates.username = parseResult.data.username;
      if (parseResult.data.email !== undefined) updates.email = parseResult.data.email || undefined;

      const user = authService.updateAccount(req.user!.userId, updates);
      auditService.log({
        userId: req.user!.userId,
        username: user.username,
        action: 'ACCOUNT_UPDATE',
        details: 'Updated account details',
        ipAddress: req.ip,
      });
      return reply.send({ user });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/api/settings/change-password', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ChangePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0]?.message || 'Invalid input' });
    }
    try {
      await authService.changePassword(req.user!.userId, parseResult.data.currentPassword, parseResult.data.newPassword);
      auditService.log({
        userId: req.user!.userId,
        username: req.user!.username,
        action: 'PASSWORD_CHANGE',
        details: 'Password changed',
        ipAddress: req.ip,
      });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Command snippets
  fastify.get('/api/settings/snippets', async (req: FastifyRequest<{ Querystring: { serverId?: string } }>, reply: FastifyReply) => {
    const snippets = snippetsService.listSnippets(req.user!.userId, req.query.serverId);
    return reply.send({ snippets });
  });

  fastify.post('/api/settings/snippets', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CommandSnippetCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0]?.message || 'Invalid input' });
    }
    const snippet = snippetsService.createSnippet(req.user!.userId, parseResult.data);
    return reply.status(201).send({ snippet });
  });

  fastify.delete('/api/settings/snippets/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const deleted = snippetsService.deleteSnippet(req.user!.userId, req.params.id);
    return reply.send({ success: deleted });
  });

  // Export / Import server list (credentials are NOT included — re-entry required on import)
  fastify.get('/api/settings/export-servers', async (req: FastifyRequest, reply: FastifyReply) => {
    const servers = serverService.listServers();
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      servers: servers.map((s) => ({
        name: s.name,
        host: s.host,
        sshPort: s.sshPort,
        sshUsername: s.sshUsername,
        authMethod: s.authMethod,
        vncHost: s.vncHost,
        vncPort: s.vncPort,
        vncEnabled: s.vncEnabled,
        serverGroup: s.serverGroup,
        description: s.description,
        isEnabled: s.isEnabled,
        tags: s.tags,
        isFavorite: s.isFavorite,
      })),
    };

    auditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'SERVERS_EXPORT',
      details: `Exported ${servers.length} server(s)`,
      ipAddress: req.ip,
    });

    return reply.send(exportData);
  });

  fastify.post('/api/settings/import-servers', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { servers?: unknown[] };
    if (!body || !Array.isArray(body.servers)) {
      return reply.status(400).send({ error: 'Expected { servers: [...] }' });
    }

    let imported = 0;
    const errors: string[] = [];

    for (const raw of body.servers) {
      const parseResult = ServerCreateSchema.safeParse(raw);
      if (!parseResult.success) {
        errors.push(parseResult.error.errors.map((e) => e.message).join(', '));
        continue;
      }
      try {
        serverService.createServer(parseResult.data);
        imported++;
      } catch (err: any) {
        errors.push(err.message);
      }
    }

    auditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'SERVERS_IMPORT',
      details: `Imported ${imported} server(s)${errors.length ? `, ${errors.length} failed` : ''}`,
      ipAddress: req.ip,
    });

    return reply.send({ imported, errors });
  });

  // Danger zone: clear audit logs
  fastify.delete('/api/settings/audit-logs', async (req: FastifyRequest, reply: FastifyReply) => {
    const cleared = auditService.clearLogs();
    auditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'AUDIT_LOGS_CLEARED',
      details: `Cleared ${cleared} audit log entr${cleared === 1 ? 'y' : 'ies'}`,
      ipAddress: req.ip,
    });
    return reply.send({ success: true, cleared });
  });
}
