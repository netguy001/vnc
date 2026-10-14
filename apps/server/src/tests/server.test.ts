import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from '../services/crypto.service.js';
import { SQLiteDatabaseClient, setDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { AuthService } from '../services/auth.service.js';
import { ServerService } from '../services/server.service.js';

describe('ServerConsole Backend Core Services', () => {
  let crypto: CryptoService;
  let auth: AuthService;
  let serverService: ServerService;

  beforeEach(() => {
    // In-memory SQLite for test isolation
    const testDb = new SQLiteDatabaseClient(':memory:');
    setDatabase(testDb);
    runMigrations(testDb);

    crypto = new CryptoService('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    auth = new AuthService();
    serverService = new ServerService();
  });

  describe('CryptoService (AES-256-GCM)', () => {
    it('encrypts and decrypts credentials accurately', () => {
      const secret = 'my-super-secret-ssh-password-123!';
      const encrypted = crypto.encrypt(secret);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(secret);
      expect(encrypted).toContain(':'); // IV : TAG : CIPHERTEXT

      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('returns null for empty strings or undefined', () => {
      expect(crypto.encrypt(null)).toBeNull();
      expect(crypto.encrypt('')).toBeNull();
      expect(crypto.decrypt(null)).toBeNull();
      expect(crypto.decrypt('')).toBeNull();
    });

    it('rejects tampered ciphertexts', () => {
      const encrypted = crypto.encrypt('test');
      const tampered = encrypted?.slice(0, -2) + 'aa';
      expect(() => crypto.decrypt(tampered)).toThrow();
    });
  });

  describe('AuthService', () => {
    it('reports hasUsers = false initially and creates first admin', async () => {
      expect(auth.hasUsers()).toBe(false);

      const user = await auth.createUser('admin', 'password1234', 'admin@example.com', 'admin');
      expect(user.username).toBe('admin');
      expect(user.role).toBe('admin');
      expect(auth.hasUsers()).toBe(true);

      const authRes = await auth.authenticate('admin', 'password1234');
      expect(authRes).not.toBeNull();
      expect(authRes?.user.username).toBe('admin');
      expect(authRes?.token).toBeTruthy();

      const decoded = auth.verifyToken(authRes!.token);
      expect(decoded?.username).toBe('admin');
    });

    it('rejects invalid password', async () => {
      await auth.createUser('operator', 'correct-password');
      const authRes = await auth.authenticate('operator', 'wrong-password');
      expect(authRes).toBeNull();
    });
  });

  describe('ServerService & Credential Security', () => {
    it('creates server and protects credentials from leak', () => {
      const created = serverService.createServer({
        name: 'Primary Linux Node',
        host: '192.0.2.10',
        sshPort: 22,
        sshUsername: 'root',
        authMethod: 'password',
        sshPassword: 'UltraSecretSshPassword!',
        vncEnabled: true,
        vncPort: 5901,
        vncPassword: 'VncPassword999',
      });

      expect(created.id).toBeTruthy();
      expect(created.name).toBe('Primary Linux Node');
      expect(created.hasSshPassword).toBe(true);
      expect(created.hasVncPassword).toBe(true);

      // Verify that passwords are NOT included in the public/safe DTO
      expect((created as any).sshPassword).toBeUndefined();
      expect((created as any).vncPassword).toBeUndefined();

      // Verify internal decrypted credentials function works strictly for backend
      const creds = serverService.getDecryptedCredentials(created.id);
      expect(creds?.sshPassword).toBe('UltraSecretSshPassword!');
      expect(creds?.vncPassword).toBe('VncPassword999');
    });

    it('updates and deletes server cleanly', () => {
      const created = serverService.createServer({
        name: 'Staging Server',
        host: '10.0.0.5',
        sshPort: 2222,
        sshUsername: 'ubuntu',
        authMethod: 'password',
      });

      const updated = serverService.updateServer(created.id, {
        name: 'Staging Server Renamed',
      });
      expect(updated.name).toBe('Staging Server Renamed');

      const deleted = serverService.deleteServer(created.id);
      expect(deleted).toBe(true);
      expect(serverService.getServerById(created.id)).toBeNull();
    });
  });
});
