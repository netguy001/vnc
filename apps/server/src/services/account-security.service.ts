import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/client.js';
import { cryptoService } from './crypto.service.js';
import { authService, JwtPayload } from './auth.service.js';
import { generateSecret, otpauthUri, verifyTotp } from './totp.js';
import type { UserDTO } from '@server-console/shared';

type Role = JwtPayload['role'];
const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface ApiTokenDTO {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export class AccountSecurityService {
  /** Last accepted TOTP time-step per user, so a captured code cannot be replayed within its validity window. */
  private lastTotpStep = new Map<string, number>();

  // ---------------- user management (admin) ----------------

  listUsers(): Array<UserDTO & { totpEnabled: boolean }> {
    return getDatabase()
      .query<any>('SELECT id, username, email, role, created_at, totp_enabled FROM users ORDER BY created_at')
      .map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email || undefined,
        role: u.role,
        createdAt: u.created_at,
        totpEnabled: !!u.totp_enabled,
      }));
  }

  private adminCount(): number {
    return getDatabase().get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")?.c ?? 0;
  }

  async createUser(input: { username: string; password: string; role: Role; email?: string }): Promise<UserDTO> {
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(input.username)) throw httpError(400, 'Username must be 3-50 characters: letters, numbers, . _ -');
    if (input.password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (getDatabase().get('SELECT id FROM users WHERE username = ?', [input.username])) throw httpError(409, 'Username already exists');
    return authService.createUser(input.username, input.password, input.email, input.role);
  }

  setRole(actorId: string, userId: string, role: Role): void {
    const user = authService.getUserById(userId);
    if (!user) throw httpError(404, 'User not found');
    if (user.role === 'admin' && role !== 'admin' && this.adminCount() <= 1) throw httpError(400, 'Cannot demote the last administrator');
    if (actorId === userId && role !== 'admin') throw httpError(400, 'You cannot demote yourself');
    getDatabase().run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, new Date().toISOString(), userId]);
    // Existing API tokens must never outrank their owner.
    getDatabase().run(
      "UPDATE api_tokens SET role = ? WHERE user_id = ? AND (role = 'admin' OR (role = 'operator' AND ? = 'viewer'))",
      [role, userId, role]
    );
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (!authService.getUserById(userId)) throw httpError(404, 'User not found');
    getDatabase().run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      await authService.hashPassword(newPassword),
      new Date().toISOString(),
      userId,
    ]);
  }

  deleteUser(actorId: string, userId: string): void {
    const user = authService.getUserById(userId);
    if (!user) throw httpError(404, 'User not found');
    if (actorId === userId) throw httpError(400, 'You cannot delete your own account');
    if (user.role === 'admin' && this.adminCount() <= 1) throw httpError(400, 'Cannot delete the last administrator');
    getDatabase().run('DELETE FROM users WHERE id = ?', [userId]);
  }

  // ---------------- API tokens ----------------

  listTokens(userId: string): ApiTokenDTO[] {
    return getDatabase()
      .query<any>('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', [userId])
      .map((t) => ({ id: t.id, name: t.name, role: t.role, createdAt: t.created_at, lastUsedAt: t.last_used_at, expiresAt: t.expires_at }));
  }

  createToken(user: JwtPayload, input: { name: string; role?: Role; expiresInDays?: number | null }): { token: string; info: ApiTokenDTO } {
    const role = input.role ?? user.role;
    if (RANK[role] > RANK[user.role]) throw httpError(403, 'A token cannot have a higher role than its owner');
    if (!input.name.trim()) throw httpError(400, 'Token name is required');
    const id = crypto.randomUUID();
    const token = `ioc_${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString() : null;
    const createdAt = new Date().toISOString();
    getDatabase().run(
      'INSERT INTO api_tokens (id, user_id, name, token_hash, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, user.userId, input.name.trim().slice(0, 60), sha256(token), role, createdAt, expiresAt]
    );
    return { token, info: { id, name: input.name.trim().slice(0, 60), role, createdAt, lastUsedAt: null, expiresAt } };
  }

  revokeToken(userId: string, tokenId: string): boolean {
    return getDatabase().run('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', [tokenId, userId]).changes > 0;
  }

  /** Resolves a presented API token to an identity, or null. Stored hashed; usage is stamped. */
  authenticateToken(token: string): JwtPayload | null {
    if (!token.startsWith('ioc_')) return null;
    const db = getDatabase();
    const row = db.get<any>(
      `SELECT t.id, t.role, t.expires_at, u.id AS uid, u.username, u.role AS user_role
       FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
      [sha256(token)]
    );
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    db.run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
    const role: Role = RANK[row.role as Role] <= RANK[row.user_role as Role] ? row.role : row.user_role;
    return { userId: row.uid, username: `${row.username} (token)`, role };
  }

  // ---------------- TOTP 2FA ----------------

  isTotpEnabled(userId: string): boolean {
    return !!getDatabase().get<any>('SELECT totp_enabled FROM users WHERE id = ?', [userId])?.totp_enabled;
  }

  beginTotpSetup(userId: string): { secret: string; uri: string } {
    const user = authService.getUserById(userId);
    if (!user) throw httpError(404, 'User not found');
    if (this.isTotpEnabled(userId)) throw httpError(400, '2FA is already enabled');
    const secret = generateSecret();
    getDatabase().run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [cryptoService.encrypt(secret), userId]);
    return { secret, uri: otpauthUri(secret, user.username) };
  }

  /** Confirms the pending secret with a valid code, switches 2FA on and returns one-time recovery codes. */
  confirmTotp(userId: string, code: string): string[] {
    const row = getDatabase().get<any>('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', [userId]);
    if (!row?.totp_secret) throw httpError(400, 'Start 2FA setup first');
    if (row.totp_enabled) throw httpError(400, '2FA is already enabled');
    const secret = cryptoService.decrypt(row.totp_secret)!;
    if (verifyTotp(secret, code) === null) throw httpError(400, 'That code is not valid. Check your authenticator app and try again.');
    const recovery = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').match(/.{5}/g)!.join('-'));
    getDatabase().run('UPDATE users SET totp_enabled = 1, totp_recovery = ? WHERE id = ?', [
      JSON.stringify(recovery.map((c) => bcrypt.hashSync(c, 8))),
      userId,
    ]);
    return recovery;
  }

  async disableTotp(userId: string, password: string): Promise<void> {
    const row = getDatabase().get<any>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!row || !(await authService.verifyPassword(password, row.password_hash))) throw httpError(400, 'Password is incorrect');
    getDatabase().run('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_recovery = NULL WHERE id = ?', [userId]);
  }

  /** Admin recovery path for a locked-out user. */
  adminDisableTotp(userId: string): void {
    getDatabase().run('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_recovery = NULL WHERE id = ?', [userId]);
  }

  /** Verifies a login second factor: a current TOTP code, or an unused recovery code (consumed on use). */
  verifySecondFactor(userId: string, code: string): boolean {
    const db = getDatabase();
    const row = db.get<any>('SELECT totp_secret, totp_recovery FROM users WHERE id = ? AND totp_enabled = 1', [userId]);
    if (!row) return true; // 2FA not enabled
    const secret = cryptoService.decrypt(row.totp_secret);
    const step = secret ? verifyTotp(secret, code) : null;
    if (step !== null && step > (this.lastTotpStep.get(userId) ?? -1)) {
      this.lastTotpStep.set(userId, step);
      return true;
    }

    const normalized = code.trim().toLowerCase();
    if (/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(normalized) && row.totp_recovery) {
      const hashes: string[] = JSON.parse(row.totp_recovery);
      const idx = hashes.findIndex((h) => bcrypt.compareSync(normalized, h));
      if (idx >= 0) {
        hashes.splice(idx, 1);
        db.run('UPDATE users SET totp_recovery = ? WHERE id = ?', [JSON.stringify(hashes), userId]);
        return true;
      }
    }
    return false;
  }
}

export const accountSecurity = new AccountSecurityService();
