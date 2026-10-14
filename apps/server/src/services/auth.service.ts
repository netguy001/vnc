import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { getDatabase } from '../db/client.js';
import { config } from '../config.js';
import { UserDTO } from '@server-console/shared';

export interface JwtPayload {
  userId: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
}

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async syncAdminConfig(): Promise<{ username: string; role: string } | null> {
    if (config.env === 'test') {
      return null;
    }

    try {
      const configPath = config.adminConfigFile;
      let username = 'admin';
      let password = 'admin1234';

      if (fs.existsSync(configPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (content.username) username = String(content.username).trim();
          if (content.password) password = String(content.password).trim();
        } catch (e) {
          console.warn(`[Config] Failed to read ${configPath}:`, e);
        }
      } else {
        // Write default config file if missing
        try {
          fs.writeFileSync(
            configPath,
            JSON.stringify(
              {
                username: 'admin',
                password: 'admin1234',
                _instructions: 'Edit username or password here anytime. ServerConsole will automatically accept the new credentials.'
              },
              null,
              2
            ),
            'utf8'
          );
        } catch {}
      }

      const db = getDatabase();
      const existing = db.get<{ id: string; password_hash: string }>(
        'SELECT id, password_hash FROM users WHERE username = ?',
        [username]
      );

      const now = new Date().toISOString();
      if (existing) {
        const isMatch = await this.verifyPassword(password, existing.password_hash);
        if (!isMatch) {
          const passwordHash = await this.hashPassword(password);
          db.run(
            'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
            [passwordHash, now, existing.id]
          );
          console.log(`[Auth] Updated password for "${username}" from admin.config.json`);
        }
      } else {
        const id = crypto.randomUUID();
        const passwordHash = await this.hashPassword(password);
        db.run(
          'INSERT INTO users (id, username, password_hash, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, username, passwordHash, `${username}@local.host`, 'admin', now, now]
        );
        console.log(`[Auth] Created admin account "${username}" from admin.config.json`);
      }

      return { username, role: 'admin' };
    } catch (err) {
      console.error('[Auth] Error in syncAdminConfig:', err);
      return null;
    }
  }

  hasUsers(): boolean {
    const db = getDatabase();
    const row = db.get<{ count: number }>('SELECT COUNT(*) as count FROM users');
    return (row?.count ?? 0) > 0;
  }

  async createUser(username: string, password: string, email?: string, role: 'admin' | 'operator' | 'viewer' = 'admin'): Promise<UserDTO> {
    const db = getDatabase();
    const existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      throw new Error(`Username "${username}" already exists.`);
    }

    const id = crypto.randomUUID();
    const passwordHash = await this.hashPassword(password);
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO users (id, username, password_hash, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, username, passwordHash, email || null, role, now, now]
    );

    return {
      id,
      username,
      email,
      role,
      createdAt: now,
    };
  }

  async authenticate(username: string, password: string): Promise<{ token: string; user: UserDTO } | null> {
    // Automatically sync credentials from admin.config.json if configured
    await this.syncAdminConfig();

    const db = getDatabase();
    const userRow = db.get<{
      id: string;
      username: string;
      password_hash: string;
      email: string | null;
      role: 'admin' | 'operator' | 'viewer';
      created_at: string;
    }>('SELECT * FROM users WHERE username = ?', [username]);

    if (!userRow) {
      return null;
    }

    const valid = await this.verifyPassword(password, userRow.password_hash);
    if (!valid) {
      return null;
    }

    const payload: JwtPayload = {
      userId: userRow.id,
      username: userRow.username,
      role: userRow.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

    return {
      token,
      user: {
        id: userRow.id,
        username: userRow.username,
        email: userRow.email || undefined,
        role: userRow.role,
        createdAt: userRow.created_at,
      },
    };
  }

  verifyToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const db = getDatabase();
    const userRow = db.get<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [userId]
    );
    if (!userRow) {
      throw new Error('User not found');
    }

    const valid = await this.verifyPassword(currentPassword, userRow.password_hash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    const passwordHash = await this.hashPassword(newPassword);
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      passwordHash,
      new Date().toISOString(),
      userId,
    ]);
  }

  updateAccount(userId: string, updates: { username?: string; email?: string }): UserDTO {
    const db = getDatabase();
    const existing = this.getUserById(userId);
    if (!existing) {
      throw new Error('User not found');
    }

    if (updates.username && updates.username !== existing.username) {
      const taken = db.get('SELECT id FROM users WHERE username = ? AND id != ?', [updates.username, userId]);
      if (taken) {
        throw new Error(`Username "${updates.username}" is already taken`);
      }
    }

    db.run('UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), updated_at = ? WHERE id = ?', [
      updates.username ?? null,
      updates.email ?? null,
      new Date().toISOString(),
      userId,
    ]);

    const updated = this.getUserById(userId);
    if (!updated) throw new Error('Failed to update account');
    return updated;
  }

  getUserById(id: string): UserDTO | null {
    const db = getDatabase();
    const userRow = db.get<{
      id: string;
      username: string;
      email: string | null;
      role: 'admin' | 'operator' | 'viewer';
      created_at: string;
    }>('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [id]);

    if (!userRow) return null;

    return {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email || undefined,
      role: userRow.role,
      createdAt: userRow.created_at,
    };
  }
}

export const authService = new AuthService();
