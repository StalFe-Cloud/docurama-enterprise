import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, hashPassword, recordAudit, sessionCookieAttributes } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { issueEmailVerification, requestOrigin } from "@/lib/onboarding";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Self-serve signup - POST /api/auth/signup
 *
 * Creates the account + organization (or joins via invitation token), opens a
 * session immediately (the wizard continues at /welcome), queues the email
 * verification message from notifications@docurama.eu and records GDPR consent.
 */
export async function POST(req: NextRequest) {
  let body: {
    firstName?: string; lastName?: string; email?: string; password?: string;
    organization?: string; inviteToken?: string; consent?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const organization = (body.organization ?? "").trim();
  const inviteToken = (body.inviteToken ?? "").trim();

  if (!firstName || !lastName) return jsonError("First and last name are required");
  if (firstName.length > 40 || lastName.length > 40) return jsonError("Names must be 40 characters or fewer");
  if (!EMAIL_RE.test(email)) return jsonError("Enter a valid email address");
  if (password.length < 10) return jsonError("Password must be at least 10 characters");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return jsonError("Password must include at least one letter and one number");
  }
  if (body.consent !== true) return jsonError("Please accept the Terms of Service and Privacy Policy to continue");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return jsonError("An account with this email already exists - sign in instead", 409);
  }

  // ── Invitation join (optional) ──
  let invitation: { id: string; tenantId: string; email: string; role: string; token: string; status: string; expiresAt: Date } | null = null;
  if (inviteToken) {
    const found = await db.invitation.findUnique({ where: { token: inviteToken } });
    if (!found || found.status !== "PENDING" || found.expiresAt < new Date()) {
      return jsonError("This invitation is no longer valid - ask your colleague to send a new one", 410);
    }
    if (found.email !== email) {
      return jsonError(`This invitation was sent to ${found.email} - sign up with that email address`);
    }
    invitation = found;
  }

  const origin = requestOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent")?.slice(0, 250) ?? null;

  // ── Tenant: fresh organization, or the invited one ──
  let tenantId: string;
  let membershipRole: string;
  let tenantNameForLog: string;
  if (invitation) {
    tenantId = invitation.tenantId;
    membershipRole = invitation.role;
    const t = await db.tenant.findUnique({ where: { id: tenantId } });
    tenantNameForLog = t?.name ?? "workspace";
  } else {
    if (!organization) return jsonError("Organization name is required");
    if (organization.length > 80) return jsonError("Organization name must be 80 characters or fewer");
    const slug = `${organization.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org"}-${Math.random().toString(36).slice(2, 8)}`;
    const trialDays = (await db.platformSetting.findUnique({ where: { id: "singleton" } }))?.trialLengthDays ?? 14;
    const tenant = await db.tenant.create({
      data: {
        name: organization,
        slug,
        planCode: "STARTER",
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 3600_000),
      },
    });
    tenantId = tenant.id;
    membershipRole = "OWNER";
    tenantNameForLog = organization;
  }

  const user = await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      firstName,
      lastName,
      role: "MEMBER",
      status: "ACTIVE",
      activeTenantId: tenantId,
    },
  });
  await db.member.create({ data: { userId: user.id, tenantId, role: membershipRole, status: "ACTIVE" } });

  if (invitation) {
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  }

  // GDPR Art. 7 - proof of consent captured at signup.
  await db.consent.create({
    data: {
      subjectEmail: email,
      purpose: "tos_privacy_signup",
      source: "signup",
      grantedAt: new Date(),
      status: "GRANTED",
    },
  });

  // Session opens immediately - the wizard continues at /welcome.
  const session = await db.session.create({
    data: { userId: user.id, ip, userAgent, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) },
  });
  await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

  await issueEmailVerification(user.id, email, origin);

  await recordAudit({
    actor: `${firstName} ${lastName}`,
    actorRole: "MEMBER",
    action: invitation ? "user.signup.invited" : "user.signup.selfserve",
    resource: `user:${email}`,
    ip,
    tenantName: tenantNameForLog,
    detail: invitation
      ? `Joined ${tenantNameForLog} via invitation as ${membershipRole}`
      : `Created organization ${tenantNameForLog} (STARTER trial)`,
  });
  await db.securityEvent.create({
    data: {
      type: "SIGNUP", severity: "INFO", actor: email, ip, blocked: false,
      detail: invitation ? `Signup via invitation to ${tenantNameForLog}` : "Self-serve signup with new organization",
    },
  });

  const res = jsonOk({
    ok: true,
    token: session.id,
    needsVerification: true,
    user: { id: user.id, email: user.email, name: `${firstName} ${lastName}` },
  });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=${session.id}; ${sessionCookieAttributes(req)}`);
  return res;
}
