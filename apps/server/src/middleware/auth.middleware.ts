import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, JwtPayload } from '../services/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token =
    (req.cookies as any)?.token ||
    (req.headers.authorization?.replace(/^Bearer\s+/, '')) ||
    (req.query as any)?.token;

  if (!token) {
    reply.status(401).send({ error: 'Authentication required' });
    return;
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    reply.status(401).send({ error: 'Session expired or invalid token' });
    return;
  }

  req.user = payload;
}
