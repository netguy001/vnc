import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware.js';
import { serverService } from '../services/server.service.js';
import { sshService } from '../services/ssh.service.js';
import { monitorService } from '../services/monitor.service.js';
import { dockerService } from '../services/docker.service.js';
import { auditService } from '../services/audit.service.js';
import { securityService } from '../services/security.service.js';
import { metricsStore } from '../services/metrics-store.service.js';
import { networkService } from '../services/network.service.js';
import { ServerCreateSchema, ServerUpdateSchema, AddFirewallRuleInput } from '@server-console/shared';

export function registerServerRoutes(fastify: FastifyInstance): void {
  // All server routes require authentication
  fastify.addHook('preHandler', async (req, reply) => {
    // Only apply to /api/servers routes
    if (req.url.startsWith('/api/servers')) {
      await requireAuth(req, reply);
    }
  });

  // List all servers
  fastify.get('/api/servers', async (_req, reply) => {
    const servers = serverService.listServers();
    return reply.send({ servers });
  });

  // Get single server
  fastify.get('/api/servers/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = req.params;
    const server = serverService.getServerById(id);
    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }
    return reply.send({ server });
  });

  // Create new server
  fastify.post('/api/servers', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ServerCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    try {
      const server = serverService.createServer(parseResult.data);
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SERVER_CREATE',
        serverId: server.id,
        serverName: server.name,
        details: `Created server "${server.name}" (${server.host})`,
        ipAddress: req.ip,
      });

      return reply.status(201).send({ server });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to create server: ${err.message}` });
    }
  });

  // Update server
  fastify.put('/api/servers/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const parseResult = ServerUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    try {
      const updated = serverService.updateServer(id, parseResult.data);
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SERVER_UPDATE',
        serverId: updated.id,
        serverName: updated.name,
        details: `Updated configuration for server "${updated.name}"`,
        ipAddress: req.ip,
      });

      return reply.send({ server: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Delete server
  fastify.delete('/api/servers/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const server = serverService.getServerById(id);
    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const deleted = serverService.deleteServer(id);
    if (deleted) {
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SERVER_DELETE',
        serverId: id,
        serverName: server.name,
        details: `Deleted server "${server.name}"`,
        ipAddress: req.ip,
      });
    }

    if (deleted) sshService.evictServer(id);
    return reply.send({ success: deleted });
  });

  // SSH host key pinning (trust-on-first-use)
  fastify.get('/api/servers/:id/host-key', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    return reply.send({ hostKey: sshService.getHostKey(req.params.id) });
  });

  fastify.post('/api/servers/:id/host-key/reset', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const server = serverService.getServerById(req.params.id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    sshService.resetHostKey(req.params.id);
    auditService.log({
      userId: req.user?.userId,
      username: req.user?.username,
      action: 'HOST_KEY_RESET',
      serverId: server.id,
      serverName: server.name,
      details: 'Trusted SSH host key cleared; the next connection will pin the key it presents',
      ipAddress: req.ip,
    });
    return reply.send({ success: true });
  });

  // Get decrypted VNC credentials for authorized session
  fastify.get('/api/servers/:id/vnc-credentials', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    return reply.send({
      hasPassword: Boolean(creds.vncPassword),
      password: creds.vncPassword || null,
      vncHost: creds.server.vncHost || creds.server.host,
      vncPort: creds.server.vncPort || 5900,
    });
  });

  // Test server connection (SSH & VNC)
  fastify.post('/api/servers/:id/test-connection', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const result = await sshService.testConnection(creds);

    // Update server status based on SSH test
    const newStatus = result.sshSuccess ? 'connected' : 'error';
    serverService.updateStatus(id, newStatus);

    auditService.log({
      userId: req.user?.userId,
      username: req.user?.username,
      action: 'SERVER_TEST_CONNECTION',
      serverId: id,
      serverName: creds.server.name,
      details: `SSH: ${result.sshSuccess ? 'OK' : 'FAIL'}, VNC: ${result.vncSuccess ? 'OK' : 'FAIL'}`,
      success: result.sshSuccess,
      ipAddress: req.ip,
    });

    return reply.send({ result });
  });

  // Server status
  fastify.get('/api/servers/:id/status', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const server = serverService.getServerById(id);
    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }
    return reply.send({ status: server.status, lastConnectedAt: server.lastConnectedAt });
  });

  // Server Monitoring metrics
  fastify.get('/api/servers/:id/monitor', async (req: FastifyRequest<{ Params: { id: string }; Querystring: { fresh?: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    // Dashboard views reuse the background collector's snapshot; detail views ask for ?fresh=1.
    if (req.query.fresh !== '1') {
      const cached = metricsStore.getCached(id);
      if (cached) return reply.send({ metrics: cached });
    }

    const started = Date.now();
    const metrics = await monitorService.getMetrics(creds);
    metricsStore.record(id, creds.server.name, creds.server.status, metrics, Date.now() - started);
    return reply.send({ metrics });
  });

  // Server Docker containers
  fastify.get('/api/servers/:id/docker', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const dockerResult = await dockerService.getContainers(creds);
    return reply.send(dockerResult);
  });

  // Server Security Overview & Audit
  fastify.get('/api/servers/:id/security', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const security = await securityService.getSecurityOverview(creds);
    return reply.send({ security });
  });

  // Add UFW Firewall Rule
  fastify.post('/api/servers/:id/firewall/rule', async (req: FastifyRequest<{ Params: { id: string }; Body: AddFirewallRuleInput }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      const result = await securityService.addFirewallRule(creds, req.body);
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'FIREWALL_ADD_RULE',
        serverId: id,
        serverName: creds.server.name,
        details: `Added firewall rule: ${req.body.action.toUpperCase()} port ${req.body.port} (${req.body.protocol || 'any'})`,
        success: true,
        ipAddress: req.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete UFW Firewall Rule
  fastify.delete('/api/servers/:id/firewall/rule/:ruleNumber', async (req: FastifyRequest<{ Params: { id: string; ruleNumber: string } }>, reply: FastifyReply) => {
    const { id, ruleNumber } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const num = parseInt(ruleNumber, 10);
    if (isNaN(num)) {
      return reply.status(400).send({ error: 'Invalid rule number' });
    }

    try {
      const result = await securityService.deleteFirewallRule(creds, num);
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'FIREWALL_DELETE_RULE',
        serverId: id,
        serverName: creds.server.name,
        details: `Deleted firewall rule #${num}`,
        success: true,
        ipAddress: req.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Toggle UFW Firewall state (enable/disable)
  fastify.post('/api/servers/:id/firewall/toggle', async (req: FastifyRequest<{ Params: { id: string }; Body: { enable: boolean } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const { enable } = req.body;
    try {
      const result = await securityService.toggleFirewall(creds, Boolean(enable));
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: enable ? 'FIREWALL_ENABLE' : 'FIREWALL_DISABLE',
        serverId: id,
        serverName: creds.server.name,
        details: `${enable ? 'Enabled' : 'Disabled'} firewall`,
        success: true,
        ipAddress: req.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Unban IP via Fail2ban
  fastify.post('/api/servers/:id/security/unban', async (req: FastifyRequest<{ Params: { id: string }; Body: { jail: string; ip: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const { jail, ip } = req.body;
    try {
      const result = await securityService.unbanIp(creds, jail, ip);
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SECURITY_UNBAN_IP',
        serverId: id,
        serverName: creds.server.name,
        details: `Unbanned IP ${ip} from jail ${jail}`,
        success: true,
        ipAddress: req.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Server Network Overview
  fastify.get('/api/servers/:id/network', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const network = await networkService.getNetworkOverview(creds);
    return reply.send({ network });
  });

  // Diagnostic: Ping target from server
  fastify.post('/api/servers/:id/network/ping', async (req: FastifyRequest<{ Params: { id: string }; Body: { host: string; count?: number } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const { host, count = 3 } = req.body;
    try {
      const result = await networkService.pingTarget(creds, host, count);
      return reply.send({ result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Diagnostic: DNS lookup from server
  fastify.post('/api/servers/:id/network/dns', async (req: FastifyRequest<{ Params: { id: string }; Body: { host: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const { host } = req.body;
    try {
      const result = await networkService.lookupDns(creds, host);
      return reply.send({ result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Diagnostic: Outbound port probe from server
  fastify.post('/api/servers/:id/network/port-probe', async (req: FastifyRequest<{ Params: { id: string }; Body: { host: string; port: number } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    const { host, port } = req.body;
    try {
      const result = await networkService.probePort(creds, host, port);
      return reply.send({ result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
