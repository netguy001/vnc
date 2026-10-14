import { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { authService, JwtPayload } from './auth.service.js';
import { roleAtLeast } from '../middleware/auth.middleware.js';

/**
 * Sliding-window login throttle (in-memory, resets on restart). Limits are layered so that guessing
 * is slowed hard without letting an attacker lock the real owner out:
 *   - 5 failures per (IP + username) pair   -> the tight limit that stops password guessing
 *   - 30 failures per IP                    -> stops spraying many usernames from one address
 *   - 20 failures per username (any IP)     -> stops distributed guessing, but is high enough that
 *                                              a handful of bad attempts cannot lock the owner out
 */
export class LoginThrottle {
  private failures = new Map<string, number[]>();
  private readonly windowMs: number;

  constructor(windowMs = 15 * 60 * 1000) {
    this.windowMs = windowMs;
  }

  private keys(ip: string, username: string): Array<{ key: string; max: number }> {
    const u = username.toLowerCase();
    return [
      { key: `pair:${ip}|${u}`, max: 5 },
      { key: `ip:${ip}`, max: 30 },
      { key: `user:${u}`, max: 20 },
    ];
  }

  private prune(key: string): number[] {
    const cutoff = Date.now() - this.windowMs;
    const list = (this.failures.get(key) || []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Seconds until another attempt is allowed, or 0 if not blocked. */
  retryAfter(ip: string, username: string): number {
    let wait = 0;
    for (const { key, max } of this.keys(ip, username)) {
      const list = this.prune(key);
      if (list.length >= max) wait = Math.max(wait, Math.ceil((list[list.length - max] + this.windowMs - Date.now()) / 1000));
    }
    return wait;
  }

  recordFailure(ip: string, username: string): void {
    for (const { key } of this.keys(ip, username)) {
      const list = this.prune(key);
      list.push(Date.now());
      this.failures.set(key, list);
    }
  }

  /** A successful login clears the tight pair counter (and nothing else). */
  reset(ip: string, username: string): void {
    this.failures.delete(this.keys(ip, username)[0].key);
  }
}

export const loginThrottle = new LoginThrottle();

function allowedOrigins(): Set<string> {
  return new Set([config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'].map((o) => o.replace(/\/$/, '')));
}

/**
 * Authenticates a WebSocket upgrade: session cookie (or Authorization header) only - never a token
 * in the URL - plus an Origin check so other websites cannot drive the socket with the user's cookie.
 * Returns the user or a close reason.
 */
export function authenticateWebSocket(
  req: FastifyRequest,
  minRole: JwtPayload['role'] = 'operator'
): { user: JwtPayload } | { code: number; reason: string } {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === host;
    } catch {}
    if (!sameHost && !allowedOrigins().has(origin.replace(/\/$/, ''))) {
      return { code: 4003, reason: 'Origin not allowed' };
    }
  }

  const token = (req.cookies as any)?.token || req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (!token) return { code: 4001, reason: 'Unauthorized: missing session' };
  const user = authService.verifyToken(token);
  if (!user) return { code: 4001, reason: 'Unauthorized: invalid session' };
  if (!roleAtLeast(user.role, minRole)) return { code: 4003, reason: 'Forbidden: insufficient role' };
  return { user };
}
