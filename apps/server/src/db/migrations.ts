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
      tags TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme_mode TEXT DEFAULT 'dark',
      dashboard_refresh_seconds INTEGER DEFAULT 15,
      default_landing_tab TEXT DEFAULT 'dashboard',
      default_ssh_port INTEGER DEFAULT 22,
      default_ssh_username TEXT DEFAULT 'root',
      default_vnc_port INTEGER DEFAULT 5900,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_snippets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      command TEXT NOT NULL,
      server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS host_keys (
      server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      first_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metric_samples (
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL,
      available INTEGER NOT NULL,
      cpu REAL,
      mem REAL,
      disk REAL,
      load1 REAL,
      latency_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      encrypted_config TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      threshold REAL NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 5,
      channel_ids TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      rule_name TEXT NOT NULL,
      server_name TEXT NOT NULL,
      metric TEXT NOT NULL,
      threshold REAL NOT NULL,
      peak_value REAL,
      started_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      granted TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugin_kv (
      plugin_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (plugin_id, key)
    );

    CREATE TABLE IF NOT EXISTS runbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      script TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'all',
      target_value TEXT,
      interval_min INTEGER,
      last_scheduled_at INTEGER,
      timeout_sec INTEGER NOT NULL DEFAULT 60,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runbook_runs (
      id TEXT PRIMARY KEY,
      runbook_id TEXT NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
      runbook_name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      started_by TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      results TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_runbook_runs ON runbook_runs(runbook_id, started_at);
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_metric_samples ON metric_samples(server_id, ts);
    CREATE INDEX IF NOT EXISTS idx_alert_events_open ON alert_events(rule_id, server_id, resolved_at);
    CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(server_group);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_snippets_user ON command_snippets(user_id);
  `);

  // Additive column migrations for databases created before these columns existed.
  const serverColumns = db.query<{ name: string }>(`PRAGMA table_info(servers)`).map((c) => c.name);
  if (!serverColumns.includes('tags')) {
    db.exec(`ALTER TABLE servers ADD COLUMN tags TEXT DEFAULT ''`);
  }
  const userColumns = db.query<{ name: string }>(`PRAGMA table_info(users)`).map((c) => c.name);
  if (!userColumns.includes('totp_secret')) db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
  if (!userColumns.includes('totp_enabled')) db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0`);
  if (!userColumns.includes('totp_recovery')) db.exec(`ALTER TABLE users ADD COLUMN totp_recovery TEXT`);
  if (!serverColumns.includes('is_favorite')) {
    db.exec(`ALTER TABLE servers ADD COLUMN is_favorite INTEGER DEFAULT 0`);
  }
}
