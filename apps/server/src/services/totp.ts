import crypto from 'node:crypto';

/** RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s step) - compatible with Google Authenticator, Authy, 1Password, etc. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function hotp(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function totp(secretB32: string, atMs = Date.now()): string {
  return hotp(secretB32, Math.floor(atMs / 1000 / STEP));
}

/** Accepts the current code and one step either side (clock drift). Returns the matched counter or null. */
export function verifyTotp(secretB32: string, code: string, atMs = Date.now()): number | null {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const counter = Math.floor(atMs / 1000 / STEP);
  for (const delta of [0, -1, 1]) {
    const expected = hotp(secretB32, counter + delta);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return counter + delta;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'IOC'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}
