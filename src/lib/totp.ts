import { createHmac, randomBytes, createHash } from "crypto";

/**
 * RFC 6238 TOTP (Time-based One-Time Password) + RFC 4648 base32.
 * Zero external dependencies - everything runs on Node's crypto.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
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

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/g, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a fresh 160-bit (20 byte / 32 char) TOTP secret. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/**
 * Verify a 6-digit TOTP code with a ±1 step (±30 s) drift window,
 * as recommended for authenticator-app clock skew.
 */
export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const secret = base32Decode(secretBase32);
  const step = Math.floor(Date.now() / 30_000);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, step + i) === clean) return true;
  }
  return false;
}

/** otpauth:// provisioning URI scanned by authenticator apps. */
export function otpauthUri(secret: string, email: string, issuer = "Docurama"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Ten one-time recovery codes: returned once, stored as SHA-256 hashes. */
export function generateRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex"); // 8 hex chars
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    codes.push(code);
    hashes.push(sha256(code));
  }
  return { codes, hashes };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Match a recovery code against stored hashes; returns the index or -1. */
export function matchRecoveryCode(hashes: string[], code: string): number {
  const norm = code.trim().toLowerCase();
  return hashes.findIndex((h) => h === sha256(norm));
}
