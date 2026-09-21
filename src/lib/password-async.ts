import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
const PREFIX = "scrypt$1$32768$8$3$";
const FORMAT = /^scrypt\$1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const LEGACY = /^[a-f0-9]{64}$/i;
type Gate = { active: number; waiters: Array<() => void> };
const root = globalThis as typeof globalThis & { __docuramaPasswordGate?: Gate };
const gate = root.__docuramaPasswordGate ??= { active: 0, waiters: [] };
async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (gate.active >= 2) {
    if (gate.waiters.length >= 32) throw new Response(JSON.stringify({ error: "Authentication is busy; retry shortly" }),
      { status: 503, headers: { "content-type": "application/json", "retry-after": "2" } });
    await new Promise<void>((resolve) => gate.waiters.push(resolve));
  } else gate.active++;
  try { return await work(); }
  finally { const next = gate.waiters.shift(); if (next) next(); else gate.active--; }
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return withSlot(() => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, COST, (error, key) => error ? reject(error) : resolve(key));
  }));
}
export async function hashPasswordAsync(password: string): Promise<string> {
  if (typeof password !== "string" || Buffer.byteLength(password) > 16 * 1024) {
    throw new Response(JSON.stringify({ error: "Password exceeds the supported byte limit" }), { status: 400 });
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || typeof stored !== "string" || stored.length > 256 || Buffer.byteLength(password) > 16 * 1024) return false;
  if (LEGACY.test(stored)) return timingSafeEqual(createHash("sha256").update(password).digest(), Buffer.from(stored, "hex"));
  const parts = FORMAT.exec(stored);
  if (!parts) return false;
  const key = await derive(password, Buffer.from(parts[1], "hex"));
  return timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}
