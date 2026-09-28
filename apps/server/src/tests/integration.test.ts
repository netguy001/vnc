import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createServer } from '../index.js';
import { SQLiteDatabaseClient, setDatabase } from '../db/client.js';
import { MockVncServer } from '../mock/mock-vnc.js';
import { MockSshServer } from '../mock/mock-ssh.js';

describe('ServerConsole End-to-End Integration Pipeline', () => {
  let server: FastifyInstance;
  let mockVnc: MockVncServer;
  let mockSsh: MockSshServer;
  let authToken = '';
  let serverId = '';
  const TEST_PORT = 3099;
  const MOCK_VNC_PORT = 5991;
  const MOCK_SSH_PORT = 2292;

  beforeAll(async () => {
    // Isolated in-memory database
    const db = new SQLiteDatabaseClient(':memory:');
    setDatabase(db);

    // Start mock servers
    mockVnc = new MockVncServer(MOCK_VNC_PORT);
    mockSsh = new MockSshServer(MOCK_SSH_PORT);
    await mockVnc.start();
    await mockSsh.start();

    // Start Fastify
    server = await createServer();
    await server.listen({ port: TEST_PORT, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await server.close();
    await mockVnc.stop();
    await mockSsh.stop();
  });

  it('1. GET /api/auth/setup-status reports uninitialized initially', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/setup-status',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().initialized).toBe(false);
  });

  it('2. POST /api/auth/setup creates initial administrator', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'sysadmin',
        password: 'SuperAdminPassword123!',
        email: 'sysadmin@local.test',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('sysadmin');
    expect(body.token).toBeTruthy();
    authToken = body.token;
  });

  it('3. GET /api/auth/me returns authenticated user', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe('sysadmin');
  });

  it('4. POST /api/servers creates a server with encrypted credentials', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/servers',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        name: 'Local Test Integration Node',
        host: '127.0.0.1',
        sshPort: MOCK_SSH_PORT,
        sshUsername: 'admin',
        authMethod: 'password',
        sshPassword: 'admin',
        vncEnabled: true,
        vncHost: '127.0.0.1',
        vncPort: MOCK_VNC_PORT,
        serverGroup: 'Development',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.server.id).toBeTruthy();
    expect(body.server.hasSshPassword).toBe(true);
    expect(body.server.sshPassword).toBeUndefined(); // Zero secret leakage
    serverId = body.server.id;
  });

  it('5. POST /api/servers/:id/test-connection probes SSH and VNC reachability', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/servers/${serverId}/test-connection`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().result;
    expect(result.sshSuccess).toBe(true);
    expect(result.vncSuccess).toBe(true);
  });

  it('6. GET /api/servers/:id/monitor collects real telemetry over SSH', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/servers/${serverId}/monitor`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const metrics = res.json().metrics;
    expect(metrics.isAvailable).toBe(true);
    expect(metrics.uptimeFormatted).toBeTruthy();
    expect(metrics.memory).toBeDefined();
    expect(metrics.disks).toBeDefined();
  });

  it('7. GET /api/servers/:id/docker parses Docker containers over SSH', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/servers/${serverId}/docker`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isAvailable).toBe(true);
    expect(body.containers.length).toBeGreaterThan(0);
    expect(body.containers[0].name).toBe('server-console-web');
  });

  it('8. GET /api/servers/:id/security parses UFW firewall, ports, and audit checklist', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/servers/${serverId}/security`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.security).toBeDefined();
    expect(body.security.isAvailable).toBe(true);
    expect(body.security.firewall.status).toBe('active');
    expect(body.security.firewall.rules.length).toBeGreaterThan(0);
    expect(body.security.listeningPorts.length).toBeGreaterThan(0);
    expect(body.security.securityScore).toBeGreaterThanOrEqual(50);
    expect(body.security.auditItems.length).toBeGreaterThan(0);
  });

  it('9. GET /api/servers/:id/network parses interfaces, throughput, sockets, and routing', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/servers/${serverId}/network`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.network).toBeDefined();
    expect(body.network.isAvailable).toBe(true);
    expect(body.network.interfaces.length).toBeGreaterThan(0);
    expect(body.network.interfaces[1].name).toBe('eth0');
    expect(body.network.interfaces[1].ipAddress).toBe('192.168.1.100/24');
    expect(body.network.connectionStats.total).toBeGreaterThan(0);
    expect(body.network.routing.defaultGateway).toBe('192.168.1.1');
    expect(body.network.routing.dnsServers).toContain('1.1.1.1');
  });

  it('10. POST /api/servers/:id/network/ping runs ping latency diagnostic', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/servers/${serverId}/network/ping`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        host: '1.1.1.1',
        count: 3,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.success).toBe(true);
    expect(body.result.avgMs).toBeGreaterThan(0);
  });

  it('11. WebSocket VNC Proxy delivers RFB protocol banner from mock VNC', async () => {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${TEST_PORT}/api/servers/${serverId}/vnc?token=${encodeURIComponent(authToken)}`;
      const ws = new WebSocket(wsUrl, {
        headers: {
          Cookie: `token=${authToken}`,
          Authorization: `Bearer ${authToken}`,
        },
      });

      ws.on('open', () => {
        // Connected to proxy
      });

      ws.on('message', (data: Buffer) => {
        const text = data.toString('utf-8');
        if (text.startsWith('RFB 003.008')) {
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        ws.close();
        reject(new Error('VNC handshake timed out'));
      }, 5000);
    });
  });

  it('9. WebSocket SSH Terminal delivers interactive shell banner', async () => {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${TEST_PORT}/api/servers/${serverId}/terminal?token=${encodeURIComponent(authToken)}`;
      const ws = new WebSocket(wsUrl, {
        headers: {
          Cookie: `token=${authToken}`,
          Authorization: `Bearer ${authToken}`,
        },
      });

      ws.on('open', () => {
        // Send resize message
        ws.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));
      });

      ws.on('message', (data: Buffer | string) => {
        const text = data.toString();
        if (text.includes('Welcome to ServerConsole Local Test Environment') || text.includes('admin@local-test')) {
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        ws.close();
        reject(new Error('Terminal banner timed out'));
      }, 5000);
    });
  });
});
