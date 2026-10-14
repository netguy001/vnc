import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';
import { accountSecurity } from '../services/account-security.service.js';
import { loginThrottle } from '../services/security-guard.js';
import { config } from '../config.js';
import { LoginSchema, SetupSchema } from '@server-console/shared';

export function registerAuthRoutes(fastify: FastifyInstance): void {
  // Check if system has any admin account
  fastify.get('/api/auth/setup-status', async (_req, reply) => {
    const initialized = authService.hasUsers();
    return reply.send({ initialized });
  });

  // First time initial admin setup
  fastify.post('/api/auth/setup', async (req: FastifyRequest, reply: FastifyReply) => {
    if (authService.hasUsers()) {
      return reply.status(400).send({ error: 'Setup has already been completed. Please log in.' });
    }

    const parseResult = SetupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0]?.message || 'Invalid input' });
    }

    const { username, password, email } = parseResult.data;
    const user = await authService.createUser(username, password, email, 'admin');

    const authResult = await authService.authenticate(username, password);
    if (!authResult) {
      return reply.status(500).send({ error: 'Setup succeeded but automatic login failed' });
    }

    reply.setCookie('token', authResult.token, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    auditService.log({
      userId: user.id,
      username: user.username,
      action: 'SETUP_INITIAL_ADMIN',
      details: 'Administrator account configured',
      ipAddress: req.ip,
    });

    return reply.send({ user: authResult.user, token: authResult.token });
  });

  // User Login
  fastify.post('/api/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Username and password required' });
    }

    const { username, password } = parseResult.data;

    const retryAfter = loginThrottle.retryAfter(req.ip, username);
    if (retryAfter > 0) {
      auditService.log({
        action: 'LOGIN_BLOCKED',
        details: `Login throttled for "${username}" (too many failed attempts)`,
        success: false,
        ipAddress: req.ip,
      });
      return reply
        .status(429)
        .header('Retry-After', String(retryAfter))
        .send({ error: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` });
    }

    const authResult = await authService.authenticate(username, password);

    if (!authResult) {
      loginThrottle.recordFailure(req.ip, username);
      auditService.log({
        action: 'LOGIN_FAILURE',
        details: `Failed login attempt for username "${username}"`,
        success: false,
        ipAddress: req.ip,
      });
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    if (accountSecurity.isTotpEnabled(authResult.user.id)) {
      const code = parseResult.data.totp?.trim();
      if (!code) {
        // Password was right; ask for the second factor without counting it as a failed attempt.
        return reply.status(401).send({ error: 'Two-factor code required', totpRequired: true });
      }
      if (!accountSecurity.verifySecondFactor(authResult.user.id, code)) {
        loginThrottle.recordFailure(req.ip, username);
        auditService.log({
          userId: authResult.user.id,
          username,
          action: 'LOGIN_FAILURE',
          details: 'Invalid two-factor code',
          success: false,
          ipAddress: req.ip,
        });
        return reply.status(401).send({ error: 'Invalid two-factor code', totpRequired: true });
      }
    }

    loginThrottle.reset(req.ip, username);
    reply.setCookie('token', authResult.token, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    auditService.log({
      userId: authResult.user.id,
      username: authResult.user.username,
      action: 'LOGIN_SUCCESS',
      details: 'User logged in',
      ipAddress: req.ip,
    });

    return reply.send({ user: authResult.user, token: authResult.token });
  });

  // User Logout
  fastify.post('/api/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ success: true });
  });

  // Current User
  fastify.get('/api/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.cookies as any)?.token || (req.headers.authorization?.replace(/^Bearer\s+/, ''));
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const payload = authService.verifyToken(token);
    if (!payload) {
      return reply.status(401).send({ error: 'Session expired or invalid' });
    }

    const user = authService.getUserById(payload.userId);
    if (!user) {
      return reply.status(401).send({ error: 'User no longer exists' });
    }

    return reply.send({ user });
  });
}
