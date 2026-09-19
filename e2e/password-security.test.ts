/// <reference types="bun-types" />

/** Run alone: bun test e2e/password-security.test.ts. Owns a temporary SQLite DB. */
import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { NextRequest } from "next/server";

const previousDatabaseUrl = process.env.DATABASE_URL;
const scratchDir = mkdtempSync(join(tmpdir(), "docurama-password-security-"));
const databasePath = join(scratchDir, "passwords.db");
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
new Database(databasePath, { create: true }).close();
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], {
  env: process.env, stdio: "pipe",
});

const { db } = await import("../src/lib/db");
const { hashPassword, verifyPassword, passwordNeedsUpgrade } = await import("../src/lib/auth");
const { POST: login } = await import("../src/app/api/auth/login/route");
const { base32Decode } = await import("../src/lib/totp");

const password = "Legacy and modern Password123!";
const legacyHash = (value: string) => createHash("sha256").update(value).digest("hex");
let sequence = 0;
const newUser = (extra: Record<string, unknown> = {}) => db.user.create({
  data: { email: `password-${++sequence}@example.test`, firstName: "Password", lastName: "Test", passwordHash: legacyHash(password), ...extra },
});
const request = (payload: unknown) => new NextRequest("http://localhost/api/auth/login", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
});
const loginAs = (email: string, extra: Record<string, unknown> = {}) => login(request({ email, password, ...extra }));

function currentTotp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

afterAll(async () => {
  await db.$disconnect();
  rmSync(scratchDir, { recursive: true, force: true });
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("versioned password hashes", () => {
  test("new hashes use distinct salts and verify only the exact password", () => {
    const first = hashPassword(password);
    const second = hashPassword(password);
    expect(first).toMatch(/^scrypt\$1\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    expect(first.split("$")[5]).not.toBe(second.split("$")[5]);
    expect(verifyPassword(password, first)).toBe(true);
    expect(verifyPassword(password, second)).toBe(true);
    expect(verifyPassword(`${password}wrong`, first)).toBe(false);
    expect(passwordNeedsUpgrade(first)).toBe(false);
  });

  test("legacy SHA-256 digests remain readable until successful login", () => {
    const legacy = legacyHash(password);
    expect(passwordNeedsUpgrade(legacy)).toBe(true);
    expect(verifyPassword(password, legacy)).toBe(true);
    expect(verifyPassword("wrong", legacy)).toBe(false);
    expect(verifyPassword(password, "sso!disabled-password-login")).toBe(false);
  });

  test("malformed, unknown-version and excessive-cost records fail without throwing", () => {
    const valid = hashPassword(password);
    const invalid = [
      "", "not-a-password", "f".repeat(63), "f".repeat(65),
      valid.replace("scrypt$1$", "scrypt$2$"),
      valid.replace("$32768$", "$1073741824$"),
      valid.replace("$8$3$", "$999999$999999$"),
      valid.replace("$32768$", "$-1$"),
      valid.replace("$32768$", "$1e9$"),
      valid.replace("$32768$", "$00032768$"),
      valid.slice(0, -1), `${valid}$extra`, `${valid}\n`, "x".repeat(1_000_000),
    ];
    for (const record of invalid) {
      expect(() => verifyPassword(password, record)).not.toThrow();
      expect(verifyPassword(password, record)).toBe(false);
    }
    expect(verifyPassword(null as unknown as string, valid)).toBe(false);
    expect(verifyPassword(password, null as unknown as string)).toBe(false);
  });

  test("password bytes are preserved without trimming, Unicode normalization or truncation", () => {
    const exact = ` ${"large-password".repeat(1024)}é\u0000 `;
    const stored = hashPassword(exact);
    expect(verifyPassword(exact, stored)).toBe(true);
    expect(verifyPassword(exact.trim(), stored)).toBe(false);
    expect(verifyPassword(exact.normalize("NFD"), stored)).toBe(false);
  });
});

describe("login migration", () => {
  test("successful legacy login upgrades once without changing password age or revoking sessions", async () => {
    const changedAt = new Date("2025-01-01T00:00:00Z");
    const user = await newUser({ passwordChangedAt: changedAt });
    const priorSession = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
    const response = await loginAs(user.email);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(typeof result.token).toBe("string");
    expect(response.headers.get("set-cookie")).toContain("docurama_session=");
    const upgraded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(passwordNeedsUpgrade(upgraded.passwordHash)).toBe(false);
    expect(verifyPassword(password, upgraded.passwordHash)).toBe(true);
    expect(upgraded.passwordChangedAt).toEqual(changedAt);
    expect((await db.session.findUniqueOrThrow({ where: { id: priorSession.id } })).revokedAt).toBeNull();
    expect((await loginAs(user.email)).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(upgraded.passwordHash);
  });

  test("wrong passwords, disabled accounts and SSO-only accounts never migrate or create sessions", async () => {
    for (const scenario of ["wrong-password", "disabled", "sso-only"]) {
      const user = await newUser({
        ...(scenario === "disabled" ? { status: "SUSPENDED" } : {}),
        ...(scenario === "sso-only" ? { passwordHash: "sso!disabled-password-login" } : {}),
      });
      const response = await loginAs(user.email, scenario === "wrong-password" ? { password: "wrong" } : {});
      expect(response.status).toBe(scenario === "disabled" ? 403 : 401);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    }
  });

  test.each(["totp", "recovery"])("two-factor %s upgrades only after a valid second factor", async (factor) => {
    const secret = "JBSWY3DPEHPK3PXP";
    const recovery = "aabb-ccdd";
    const user = await newUser({ totpEnabled: true, totpSecret: secret, totpRecoveryCodes: JSON.stringify([legacyHash(recovery)]) });
    const stepOne = await loginAs(user.email);
    expect(stepOne.status).toBe(200);
    const challenge = await stepOne.json();
    expect(challenge.requiresOtp).toBe(true);
    expect(stepOne.headers.get("set-cookie")).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await loginAs(user.email, { challenge: challenge.challenge, otp: "invalid" })).status).toBe(401);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await loginAs(user.email, { challenge: challenge.challenge, otp: factor === "totp" ? currentTotp(secret) : recovery })).status).toBe(200);
    const upgraded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verifyPassword(password, upgraded.passwordHash)).toBe(true);
    expect(passwordNeedsUpgrade(upgraded.passwordHash)).toBe(false);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.authChallenge.findUnique({ where: { id: challenge.challenge } })).toBeNull();
    if (factor === "recovery") expect(JSON.parse(upgraded.totpRecoveryCodes!)).toEqual([]);
  });

  test("invalid JSON shapes fail safely before password derivation", async () => {
    for (const payload of [null, [], { email: 42, password }, { email: "user@example.test", password: {} },
      { email: "user@example.test", password, otp: [] }, { email: "user@example.test", password, challenge: {} }]) {
      expect((await login(request(payload))).status).toBe(400);
    }
  });
});
