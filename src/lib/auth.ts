import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "docurama_session";
export const SESSION_TOKEN_STORE = "docurama_token";
const PASSWORD_SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
const PASSWORD_KEY_BYTES = 32;
const PASSWORD_HASH_PREFIX = "scrypt$1$32768$8$3$";
const LEGACY_PASSWORD_HASH = /^[a-f0-9]{64}$/i;
const SCRYPT_PASSWORD_HASH = /^scrypt\$1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/;

/** Versioned, salted scrypt. Keep this synchronous for existing password writers. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, PASSWORD_KEY_BYTES, PASSWORD_SCRYPT);
  return `${PASSWORD_HASH_PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Legacy digests are readable only; successful complete sign-in upgrades them. */
export function passwordNeedsUpgrade(storedHash: string): boolean {
  return typeof storedHash === "string" && LEGACY_PASSWORD_HASH.test(storedHash);
}

/**
 * Compare fixed-length derived keys in constant time. Only this version's cost
 * profile is accepted: corrupted/untrusted records cannot request arbitrary
 * CPU or memory. Passwords retain their exact UTF-8 bytes, without truncation.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (typeof password !== "string" || typeof storedHash !== "string" || storedHash.length > 256) return false;
  try {
    if (passwordNeedsUpgrade(storedHash)) {
      return timingSafeEqual(createHash("sha256").update(password).digest(), Buffer.from(storedHash, "hex"));
    }
    const match = SCRYPT_PASSWORD_HASH.exec(storedHash);
    if (!match) return false;
    const actual = scryptSync(password, Buffer.from(match[1], "hex"), PASSWORD_KEY_BYTES, PASSWORD_SCRYPT);
    return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
  } catch {
    return false;
  }
}

/**
 * Build the Set-Cookie attribute string for the session cookie.
 *
 * When the request arrived over HTTPS (preview URLs, production) the cookie is
 * emitted with `SameSite=None; Secure; Partitioned` (CHIPS) so it survives the
 * third-party iframe context the portal is commonly previewed in. Plain-HTTP
 * local development keeps the classic `SameSite=Lax` attributes.
 */
export function sessionCookieAttributes(request: Request): string {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https:") ? "https" : "http");
  const isHttps = proto.split(",")[0].trim() === "https";
  return isHttps
    ? "Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=604800"
    : "Path=/; HttpOnly; SameSite=Lax; Max-Age=604800";
}

export type SessionOrg = {
  id: string;
  name: string;
  slug: string;
  role: string;
  planCode: string;
};

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  totpEnabled: boolean;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantPlan: string | null;
  workspaceRole: string | null;
  /** Id of the unrevoked server-side session row backing this request. */
  sessionId: string | null;
  /** Every organization this account belongs to - powers the workspace switcher. */
  orgs: SessionOrg[];
};

/**
 * Resolve the signed-in user from the session cookie (or the
 * `Authorization: Bearer <token>` fallback used in embedding contexts).
 *
 * Tokens are server-side Session rows - revocable, expiring, carrying device
 * metadata for Settings → Account → Access security. User IDs are never tokens.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  let token = jar.get(SESSION_COOKIE)?.value;

  if (!token) {
    const hdrs = await headers();
    const auth = hdrs.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const raw = auth.slice("Bearer ".length).trim();
      token = raw.length ? raw : undefined;
    }
  }
  if (!token) return null;

  return resolveSessionUser(token);
}

/** Resolve only persisted, live sessions; also used by non-cookie consumers. */
export async function resolveSessionUser(token: string): Promise<SessionUser | null> {
  const session = await db.session.findUnique({ where: { id: token } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  const user = await loadUser(session.userId);
  // Touch only still-live sessions; a concurrent revocation must stay revoked.
  if (session.lastSeenAt.getTime() < Date.now() - 60_000) {
    await db.session.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { lastSeenAt: new Date() },
    }).catch(() => undefined);
  }

  if (!user || user.status !== "ACTIVE") return null;
  const activeTenantId = user.activeTenantId;
  const active =
    user.memberships.find((m) => m.tenantId === activeTenantId) ?? user.memberships[0];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    totpEnabled: user.totpEnabled,
    tenantId: active?.tenantId ?? null,
    tenantName: active?.tenant.name ?? null,
    tenantSlug: active?.tenant.slug ?? null,
    tenantPlan: active?.tenant.planCode ?? null,
    workspaceRole: active?.role ?? null,
    sessionId: session.id,
    orgs: user.memberships.map((m) => ({
      id: m.tenantId, name: m.tenant.name, slug: m.tenant.slug, role: m.role, planCode: m.tenant.planCode,
    })),
  };
}

function loadUser(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { status: "ACTIVE", tenant: { status: { not: "SUSPENDED" } } }, include: { tenant: true } } },
  });
}

/** Guard for platform-admin API routes. Throws a 403 Response when not authorised. */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "PLATFORM_ADMIN") {
    throw new Response(JSON.stringify({ error: "Platform administrator access required" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}

/** Guard for authenticated workspace users (any role). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}

export async function recordAudit(input: {
  actor: string; actorRole: string; action: string; resource: string;
  severity?: string; tenantName?: string | null; detail?: string; ip?: string;
}) {
  await db.auditEvent.create({
    data: {
      actor: input.actor, actorRole: input.actorRole, action: input.action,
      resource: input.resource, severity: input.severity ?? "INFO",
      tenantName: input.tenantName ?? null, detail: input.detail ?? null,
      ip: input.ip ?? "10.42.0.7",
    },
  });
}
