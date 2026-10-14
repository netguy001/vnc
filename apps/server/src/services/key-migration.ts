import fs from 'node:fs';
import { config } from '../config.js';
import { getDatabase } from '../db/client.js';
import { CryptoService } from './crypto.service.js';

const CRED_COLUMNS = [
  'encrypted_ssh_password',
  'encrypted_ssh_key',
  'encrypted_ssh_passphrase',
  'encrypted_vnc_password',
] as const;

/**
 * One-time migration: credentials sealed with the public default MASTER_KEY are re-encrypted
 * with the freshly generated key stored in data/secrets.json. Safe to re-run: each value is
 * tried against the legacy key first, then the new key, so already-converted rows are left alone.
 */
export function migrateLegacyCredentialKey(): void {
  if (!config.needsKeyMigration) return;

  const db = getDatabase();
  const legacy = new CryptoService(config.legacyMasterKeyHex);
  const current = new CryptoService(config.masterKeyHex);

  const rows = db.query<any>('SELECT * FROM server_credentials');

  if (rows.length > 0 && config.dbPath !== ':memory:') {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const backup = `${config.dbPath}.pre-key-migration.bak`;
      if (!fs.existsSync(backup)) fs.copyFileSync(config.dbPath, backup);
      console.warn(`[SECURITY] Backed up database to ${backup} before re-encrypting credentials.`);
    } catch (err: any) {
      throw new Error(`Refusing to migrate credentials: backup failed (${err.message})`);
    }
  }

  let converted = 0;
  const unreadable: string[] = [];

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      for (const col of CRED_COLUMNS) {
        const value = row[col];
        if (!value) continue;
        let plain: string | null = null;
        try {
          plain = legacy.decrypt(value);
        } catch {
          try {
            current.decrypt(value); // already on the new key
            continue;
          } catch {
            unreadable.push(`${row.server_id}.${col}`);
            continue;
          }
        }
        db.run(`UPDATE server_credentials SET ${col} = ? WHERE id = ?`, [current.encrypt(plain), row.id]);
        converted++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  if (unreadable.length > 0) {
    console.error(
      `[SECURITY] ${unreadable.length} credential value(s) could not be decrypted with the legacy or new key ` +
        `and were left untouched: ${unreadable.join(', ')}. Re-enter them in the UI.`
    );
  }

  try {
    const stored = JSON.parse(fs.readFileSync(config.secretsFile, 'utf8'));
    stored.migrated = true;
    fs.writeFileSync(config.secretsFile, JSON.stringify(stored, null, 2), { mode: 0o600 });
  } catch (err: any) {
    console.error(`[SECURITY] Could not mark key migration complete: ${err.message}`);
  }
  console.warn(`[SECURITY] Re-encrypted ${converted} credential value(s) with the new master key.`);
}
