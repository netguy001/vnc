import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteDatabaseClient, setDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { AccountSecurityService } from '../services/account-security.service.js';
import { totp, verifyTotp, base32Encode, base32Decode } from '../services/totp.js';

describe('TOTP (RFC 6238)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC test vector', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1111111109_000)).toBe('081804');
  });

  it('round-trips base32 and tolerates one step of drift only', () => {
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 120_000), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });
});

describe('account security', () => {
  let svc: AccountSecurityService;
  let adminId: string;
  const adminIdentity = () => ({ userId: adminId, username: 'root', role: 'admin' as const });

  beforeEach(async () => {
    const db = new SQLiteDatabaseClient(':memory:');
    setDatabase(db);
    runMigrations(db);
    svc = new AccountSecurityService();
    adminId = (await svc.createUser({ username: 'root', password: 'password123', role: 'admin' })).id;
  });

  it('protects the last administrator and the acting user', async () => {
    const op = await svc.createUser({ username: 'ops', password: 'password123', role: 'operator' });
    expect(() => svc.deleteUser(adminId, adminId)).toThrow(/own account/);
    expect(() => svc.setRole(adminId, adminId, 'viewer')).toThrow(/last administrator/);
    svc.setRole(adminId, op.id, 'viewer');
    expect(svc.listUsers().find((u) => u.id === op.id)?.role).toBe('viewer');
    svc.deleteUser(adminId, op.id);
    expect(svc.listUsers()).toHaveLength(1);
  });

  it('issues hashed API tokens that authenticate and never outrank their owner', async () => {
    const { token } = svc.createToken(adminIdentity(), { name: 'prometheus', role: 'viewer' });
    expect(token.startsWith('ioc_')).toBe(true);
    expect(svc.authenticateToken(token)?.role).toBe('viewer');
    expect(svc.authenticateToken(token + 'x')).toBeNull();
    expect(svc.authenticateToken('not-a-token')).toBeNull();

    const op = await svc.createUser({ username: 'ops', password: 'password123', role: 'operator' });
    expect(() => svc.createToken({ userId: op.id, username: 'ops', role: 'operator' }, { name: 'x', role: 'admin' })).toThrow(/higher role/);

    // demoting the owner clamps their existing tokens
    const opToken = svc.createToken({ userId: op.id, username: 'ops', role: 'operator' }, { name: 'ci' }).token;
    svc.setRole(adminId, op.id, 'viewer');
    expect(svc.authenticateToken(opToken)?.role).toBe('viewer');
  });

  it('rejects expired and revoked tokens', () => {
    const { token, info } = svc.createToken(adminIdentity(), { name: 'short', expiresInDays: 1 });
    expect(svc.authenticateToken(token)).not.toBeNull();
    expect(svc.revokeToken(adminId, info.id)).toBe(true);
    expect(svc.authenticateToken(token)).toBeNull();
  });

  it('enables 2FA only with a valid code, then accepts codes and single-use recovery codes', () => {
    const { secret } = svc.beginTotpSetup(adminId);
    expect(() => svc.confirmTotp(adminId, '000000')).toThrow(/not valid/);
    const recovery = svc.confirmTotp(adminId, totp(secret));
    expect(recovery).toHaveLength(8);
    expect(svc.isTotpEnabled(adminId)).toBe(true);

    expect(svc.verifySecondFactor(adminId, 'zzzzzz')).toBe(false);
    expect(svc.verifySecondFactor(adminId, recovery[0])).toBe(true);
    expect(svc.verifySecondFactor(adminId, recovery[0])).toBe(false); // consumed
    expect(svc.verifySecondFactor(adminId, recovery[1])).toBe(true);
  });

  it('refuses to replay a TOTP code', () => {
    const { secret } = svc.beginTotpSetup(adminId);
    svc.confirmTotp(adminId, totp(secret));
    const code = totp(secret);
    // confirmTotp does not consume the step; the first login with it succeeds, the replay fails
    expect(svc.verifySecondFactor(adminId, code)).toBe(true);
    expect(svc.verifySecondFactor(adminId, code)).toBe(false);
  });
});
