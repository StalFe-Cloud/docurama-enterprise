// Compute the current TOTP code for a base32 secret (RFC 6238).
// Usage: bun scripts/totp-code.ts <base32-secret>
import { createHmac } from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/g, "").toUpperCase().replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const secret = process.argv[2];
if (!secret) { console.error("usage: bun scripts/totp-code.ts <secret>"); process.exit(1); }
const key = base32Decode(secret);
const counter = Math.floor(Date.now() / 30_000);
const buf = Buffer.alloc(8);
buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
buf.writeUInt32BE(counter % 2 ** 32, 4);
const digest = createHmac("sha1", key).update(buf).digest();
const offset = digest[digest.length - 1] & 0x0f;
const code =
  ((digest[offset] & 0x7f) << 24) |
  ((digest[offset + 1] & 0xff) << 16) |
  ((digest[offset + 2] & 0xff) << 8) |
  (digest[offset + 3] & 0xff);
console.log(String(code % 1_000_000).padStart(6, "0"));
