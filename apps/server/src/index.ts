import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { getDatabase } from './db/client.js';
import { runMigrations } from './db/migrations.js';
import { authService } from './services/auth.service.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerServerRoutes } from './routes/server.routes.js';
import { registerSftpRoutes } from './routes/sftp.routes.js';
import { registerAuditRoutes } from './routes/audit.routes.js';
import { registerVncWebSocket } from './routes/vnc.ws.js';
import { registerTerminalWebSocket } from './routes/terminal.ws.js';

export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.env === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // 1. Initialize Database & Synchronize Admin Config
  const db = getDatabase();
  runMigrations(db);
  await authService.syncAdminConfig();

  // 2. Register plugins
  await fastify.register(cors, {
    origin: [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(cookie, {
    secret: config.jwtSecret,
  });

  await fastify.register(websocket, {
    options: {
      maxPayload: 10 * 1024 * 1024, // 10MB
    },
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB
    },
  });

  // Centralized Error Handling
  fastify.setErrorHandler((error, req, reply) => {
    req.log.error(error);
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? (config.isProd ? 'Internal Server Error' : error.message) : error.message;
    reply.status(statusCode).send({
      error: message,
      statusCode,
    });
  });

  // 3. Register routes
  registerAuthRoutes(fastify);
  registerServerRoutes(fastify);
  registerSftpRoutes(fastify);
  registerAuditRoutes(fastify);

  // 4. Register WebSockets
  registerVncWebSocket(fastify);
  registerTerminalWebSocket(fastify);

  return fastify;
}

async function start() {
  try {
    const server = await createServer();
    await server.listen({ port: config.port, host: config.host });
    console.log(`\n====================================================`);
    console.log(` ServerConsole Backend listening on http://${config.host}:${config.port}`);
    console.log(` Frontend URL: ${config.frontendUrl}`);
    console.log(` Environment: ${config.env}`);
    console.log(`====================================================\n`);
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

// Auto-start if run directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  start();
}
