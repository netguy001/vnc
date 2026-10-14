import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, JwtPayload } from '../services/auth.service.js';
import { accountSecurity } from '../services/account-security.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

type Role = JwtPayload['role'];

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Role policy, evaluated against the request method + path:
 *  - viewer:   read-only (no terminal/VNC/file contents/credentials)
 *  - operator: viewer + day-to-day operations (SFTP, network probes, connection tests, own settings)
 *  - admin:    everything (server CRUD, firewall, security actions, import/export, audit purge)
 */
const SELF_SERVICE = /^\/api\/(settings\/(preferences|account|change-password|snippets)|auth\/(tokens|totp))/;
const OPERATOR_WRITES = [
  /^\/api\/servers\/[^/]+\/files/,
  /^\/api\/servers\/[^/]+\/test-connection$/,
  /^\/api\/servers\/[^/]+\/network\/(ping|dns|port-probe)$/,
  /^\/api\/servers\/[^/]+\/services\/[^/]+\/(start|stop|restart)$/,
  /^\/api\/servers\/[^/]+\/docker\/containers\/[^/]+\/(start|stop|restart)$/,
  /^\/api\/servers\/[^/]+\/ai\/diagnose$/,
];
const OPERATOR_READS = [
  /^\/api\/servers\/[^/]+\/files/,
  /^\/api\/servers\/[^/]+\/vnc-credentials$/,
  /^\/api\/servers\/[^/]+\/logs/,
  /^\/api\/servers\/[^/]+\/services$/,
  /^\/api\/servers\/[^/]+\/services$/,
  /^\/api\/servers\/[^/]+\/docker\/containers\/[^/]+\/logs/,
];
const ADMIN_READS = [/^\/api\/settings\/export-servers/, /^\/api\/plugin-manager(?!\/ui)/, /^\/api\/auth\/users/, /^\/api\/alerts\/channels/, /^\/api\/runbooks/];

export function minimumRoleFor(method: string, rawUrl: string): Role {
  const url = rawUrl.split('?')[0];
  if (SELF_SERVICE.test(url)) return 'viewer';
  // Plugin endpoints enforce the role each plugin route declares; the caller just needs a valid session.
  if (url.startsWith('/api/plugins/') || url === '/api/plugin-manager/ui') return 'viewer';
  if (method === 'GET' || method === 'HEAD') {
    if (ADMIN_READS.some((r) => r.test(url))) return 'admin';
    if (OPERATOR_READS.some((r) => r.test(url))) return 'operator';
    return 'viewer';
  }
  if (OPERATOR_WRITES.some((r) => r.test(url))) return 'operator';
  return 'admin';
}

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

export function roleAtLeast(role: Role | undefined, min: Role): boolean {
  return role !== undefined && RANK[role] >= RANK[min];
}

/** Authenticates the caller (cookie or Bearer token) and enforces the role policy. Throws on failure. */
export async function requireAuth(req: FastifyRequest, _reply?: FastifyReply): Promise<void> {
  if (req.user) return; // already authorised earlier in this request

  const bearer = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const cookieToken = (req.cookies as any)?.token;
  const presented = cookieToken || bearer;
  if (!presented) throw httpError(401, 'Authentication required');

  // API tokens (ioc_...) are for automation: they can use the API but never manage accounts or settings.
  const viaToken = presented.startsWith('ioc_');
  const payload = viaToken ? accountSecurity.authenticateToken(presented) : authService.verifyToken(presented);
  if (!payload) throw httpError(401, 'Session expired or invalid token');
  if (viaToken && /^\/api\/(auth|settings|plugin-manager)\//.test(req.url.split('?')[0])) {
    throw httpError(403, 'API tokens cannot be used for account, settings or plugin management');
  }

  const min = minimumRoleFor(req.method, req.url);
  if (!roleAtLeast(payload.role, min)) {
    throw httpError(403, `Your role (${payload.role}) is not permitted to perform this action`);
  }
  req.user = payload;
}
