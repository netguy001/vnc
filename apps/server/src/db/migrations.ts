import { IDatabaseClient } from './client.js';

export function runMigrations(db: IDatabaseClient): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      ssh_port INTEGER NOT NULL DEFAULT 22,
      ssh_username TEXT NOT NULL,
      auth_method TEXT NOT NULL,
      vnc_host TEXT,
      vnc_port INTEGER DEFAULT 5900,
      vnc_enabled INTEGER DEFAULT 1,
      server_group TEXT DEFAULT 'Default',
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'disconnected',
      last_connected_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_credentials (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL UNIQUE REFERENCES servers(id) ON DELETE CASCADE,
      encrypted_ssh_password TEXT,
      encrypted_ssh_key TEXT,
      encrypted_ssh_passphrase TEXT,
      encrypted_vnc_password TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      server_id TEXT,
      server_name TEXT,
      details TEXT,
      success INTEGER DEFAULT 1,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(server_group);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(created_at);
  `);
}
