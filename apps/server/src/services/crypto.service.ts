import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

export class CryptoService {
  private key: Buffer;

  constructor(hexKey?: string) {
    const rawKey = hexKey || config.masterKeyHex;
    this.key = Buffer.from(rawKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error(`Master key must be 32 bytes (64 hex characters). Received ${this.key.length} bytes.`);
    }
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === '') {
      return null;
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: iv_hex:tag_hex:ciphertext_hex
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) {
      return null;
    }
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }
      const [ivHex, tagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (err: any) {
      throw new Error(`Failed to decrypt credential: ${err.message}`);
    }
  }
}

export const cryptoService = new CryptoService();
