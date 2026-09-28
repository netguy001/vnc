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

export const config = {
  projectRoot,
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'server_console_dev_jwt_secret_key_change_in_prod_32_bytes!',
  masterKeyHex: process.env.MASTER_KEY || DEFAULT_MASTER_KEY,
  dbPath: resolvedDbPath,
  adminConfigFile: path.resolve(projectRoot, 'admin.config.json'),
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Validate master key is 32 bytes (64 hex characters)
if (config.masterKeyHex.length !== 64) {
  console.warn('[SECURITY WARNING] MASTER_KEY must be a 64-character hex string (32 bytes). Generating a runtime key.');
  config.masterKeyHex = crypto.randomBytes(32).toString('hex');
}
