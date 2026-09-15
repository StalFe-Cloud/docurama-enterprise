import { createHash } from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "docurama_session";
export const SESSION_TOKEN_STORE = "docurama_token";
export const hashPassword = (pw: string) => createHash("sha256").update(pw).digest("hex");

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
  /** Id of the server-side session row backing this request (null for legacy tokens). */
  sessionId: string | null;
  /** Every organization this account belongs to - powers the workspace switcher. */
  orgs: SessionOrg[];
};

/**
 * Resolve the signed-in user from the session cookie (or the
 * `Authorization: Bearer <token>` fallback used in embedding contexts).
 *
 * Tokens are server-side Session rows - revocable, expiring, carrying device
 * metadata for Settings → Account → Access security. Legacy tokens that hold
 * a raw user id (issued before the session table existed) keep working.
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

  let user: Awaited<ReturnType<typeof loadUser>> = null;
  let sessionId: string | null = null;

  const session = await db.session.findUnique({ where: { id: token } });
  if (session) {
    if (session.revokedAt || session.expiresAt <= new Date()) return null;
    sessionId = session.id;
    user = await loadUser(session.userId);
    // Touch the session at most once a minute to keep the activity list fresh.
    if (session.lastSeenAt.getTime() < Date.now() - 60_000) {
      await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
  } else {
    // Legacy token (raw user id) - still valid, but no session row to revoke.
    user = await loadUser(token);
  }

  if (!user || user.status === "SUSPENDED") return null;
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
    sessionId,
    orgs: user.memberships.map((m) => ({
      id: m.tenantId, name: m.tenant.name, slug: m.tenant.slug, role: m.role, planCode: m.tenant.planCode,
    })),
  };
}

function loadUser(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { tenant: true } } },
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
