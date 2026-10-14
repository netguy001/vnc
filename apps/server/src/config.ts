import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = fs.existsSync(path.resolve(__dirname, '../../../package.json'))
  ? path.resolve(__dirname, '../../..')
  : process.cwd();

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config();

const DEFAULT_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const rawDbPath = process.env.DATABASE_PATH || './data/server_console.sqlite';
const resolvedDbPath = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(projectRoot, rawDbPath);

const DEFAULT_JWT_SECRET = 'server_console_dev_jwt_secret_key_change_in_prod_32_bytes!';
const KNOWN_WEAK_JWT_SECRETS = new Set([
  DEFAULT_JWT_SECRET,
  'server_console_super_secret_jwt_key_min_32_chars!',
  'server_console_super_secret_jwt_key_change_in_production_min_32_chars!',
]);

interface SecretsFile {
  masterKeyHex: string;
  jwtSecret: string;
  /** false until existing credentials were re-encrypted from the legacy public key */
  migrated: boolean;
}

/**
 * Resolves cryptographic secrets. The public default MASTER_KEY / JWT_SECRET that ship in the
 * repo are never used as-is: if the environment does not provide a strong value, a random one is
 * generated once and persisted next to the database (data/secrets.json, gitignored).
 */
function resolveSecrets(dbPath: string): {
  masterKeyHex: string;
  jwtSecret: string;
  needsKeyMigration: boolean;
  secretsFile: string;
} {
  const secretsFile = path.join(path.dirname(dbPath), 'secrets.json');
  const envKey = process.env.MASTER_KEY;
  const envJwt = process.env.JWT_SECRET;
  const envKeyUsable = !!envKey && envKey.length === 64 && envKey !== DEFAULT_MASTER_KEY;
  const envJwtUsable = !!envJwt && envJwt.length >= 32 && !KNOWN_WEAK_JWT_SECRETS.has(envJwt);

  let stored: SecretsFile | null = null;
  try {
    stored = JSON.parse(fs.readFileSync(secretsFile, 'utf8')) as SecretsFile;
  } catch {
    stored = null;
  }

  let changed = false;
  if (!stored) {
    stored = {
      masterKeyHex: crypto.randomBytes(32).toString('hex'),
      jwtSecret: crypto.randomBytes(48).toString('hex'),
      // A fresh key means previously stored credentials (if any) were sealed with a legacy key.
      migrated: false,
    };
    changed = true;
  }

  if (changed) {
    // With an operator-provided key there is nothing to migrate from the public default.
    if (envKeyUsable) stored.migrated = true;
    fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify(stored, null, 2), { mode: 0o600 });
    if (!envKeyUsable) {
      console.warn(`[SECURITY] No strong MASTER_KEY configured - generated one at ${secretsFile}. Back this file up!`);
    }
  }

  if (envKeyUsable) {
    // An operator-provided key wins; no automatic migration is attempted for it.
    return {
      masterKeyHex: envKey!,
      jwtSecret: envJwtUsable ? envJwt! : stored.jwtSecret,
      needsKeyMigration: false,
      secretsFile,
    };
  }

  return {
    masterKeyHex: stored.masterKeyHex,
    jwtSecret: envJwtUsable ? envJwt! : stored.jwtSecret,
    needsKeyMigration: !stored.migrated,
    secretsFile,
  };
}

const secrets = resolveSecrets(resolvedDbPath);

export const config = {
  projectRoot,
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3001', 10),
  // Loopback by default; set HOST=0.0.0.0 explicitly (Docker does) to expose on the network.
  host: process.env.HOST || '127.0.0.1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: secrets.jwtSecret,
  masterKeyHex: secrets.masterKeyHex,
  legacyMasterKeyHex: DEFAULT_MASTER_KEY,
  needsKeyMigration: secrets.needsKeyMigration,
  secretsFile: secrets.secretsFile,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  dbPath: resolvedDbPath,
  adminConfigFile: path.resolve(projectRoot, 'admin.config.json'),
  logLevel: process.env.LOG_LEVEL || 'info',
};
