import { requestClientIp } from "@/lib/request-metadata";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, hashPasswordAsync, recordAudit, sessionCookieAttributes } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { issueEmailVerification, requestOrigin } from "@/lib/onboarding";
import { checkBotGuard } from "@/lib/bot-guard";
import { publicRegistrationAllowed } from "@/lib/deployment-policy";
import { seatCapacity } from "@/lib/billing";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Self-serve signup - POST /api/auth/signup
 *
 * Creates the account + organization (or joins via invitation token), opens a
 * session immediately (the wizard continues at /welcome), queues the email
 * verification message from notifications@docurama.eu and records GDPR consent.
 * Bot protection (go-live cycle): honeypot + time trap + optional Turnstile —
 * see src/lib/bot-guard.ts.
 */
async function handlePost(req: NextRequest) {
  let body: {
    firstName?: string; lastName?: string; email?: string; password?: string;
    organization?: string; inviteToken?: string; consent?: boolean;
    planCode?: string; // ?plan= prefill from the pricing page (SOLO | STARTER)
    website?: string; formStartedAt?: number; turnstileToken?: string; // bot guard
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }

  // Bot guard runs before any validation or DB work.
  const guard = await checkBotGuard({
    website: body.website,
    formStartedAt: Number(body.formStartedAt ?? 0),
    turnstileToken: body.turnstileToken,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim(),
  });
  if (!guard.ok) return jsonError(guard.error, guard.status);

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
    if (!found || found.status !== "PENDING" || found.expiresAt <= new Date()) {
      return jsonError("This invitation is no longer valid - ask your colleague to send a new one", 410);
    }
    if (found.email !== email) {
      return jsonError(`This invitation was sent to ${found.email} - sign up with that email address`);
    }
    invitation = found;
  }
  if (!invitation && !publicRegistrationAllowed()) {
    return jsonError("Public registration is disabled. Ask your workspace administrator for an invitation.", 403);
  }

  const origin = requestOrigin(req);
  const ip = requestClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 250) ?? null;

  // ── Tenant: invited workspace, company domain match, or fresh organization ──
  let isAutoJoin = false;

  const passwordHash = await hashPasswordAsync(password);
  const created = await db.$transaction(async (tx) => {
    let tenantId: string;
    let membershipRole: string;
    let tenantNameForLog: string;
    if (invitation) {
      tenantId = invitation.tenantId;
      membershipRole = invitation.role;
      const t = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!t || t.status === "SUSPENDED") return jsonError("This workspace is unavailable", 403);
      const accepted = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (accepted.count !== 1) return jsonError("This invitation is no longer valid", 410);
      tenantNameForLog = t?.name ?? "workspace";
    } else {
      // Check if user's corporate email domain matches an approved company workspace
      const emailDomain = email.split("@")[1]?.trim().toLowerCase();
      const matchedDomain = emailDomain
        ? await tx.domain.findFirst({
            where: {
              domain: emailDomain,
              status: "VERIFIED",
              purpose: { in: ["AUTO_JOIN", "JOIN"] },
              tenant: { status: { not: "SUSPENDED" } },
            },
            include: { tenant: true },
          })
        : null;

    if (matchedDomain) {
      if ((await seatCapacity(matchedDomain.tenantId, tx)).remaining <= 0) {
        return jsonError("This workspace has no available seats. Ask its administrator to upgrade or invite you.", 403);
      }
        tenantId = matchedDomain.tenantId;
        membershipRole = "MEMBER";
        tenantNameForLog = matchedDomain.tenant.name;
        isAutoJoin = true;
      } else {
        if (!organization) return jsonError("Organization name is required");
        if (organization.length > 80) return jsonError("Organization name must be 80 characters or fewer");
        const slug = `${organization.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org"}-${Math.random().toString(36).slice(2, 8)}`;
        const trialDays = (await tx.platformSetting.findUnique({ where: { id: "singleton" } }))?.trialLengthDays ?? 14;
        // ?plan= prefill (pricing page CTA): SOLO is the Starter feature set
        // capped at one seat. Only self-serve plans are accepted here —
        // ENTERPRISE goes through /enterprise (sales-assisted onboarding).
        const requestedPlan = String(body.planCode ?? "").trim().toUpperCase();
        const planCode = requestedPlan === "SOLO" ? "SOLO" : "STARTER";
        const tenant = await tx.tenant.create({
          data: {
            name: organization,
            slug,
            planCode,
            status: "TRIAL",
            trialEndsAt: new Date(Date.now() + trialDays * 24 * 3600_000),
          },
        });
        tenantId = tenant.id;
        membershipRole = "OWNER";
        tenantNameForLog = organization;
      }
    }

    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: "MEMBER",
        status: "ACTIVE",
        activeTenantId: isAutoJoin ? null : tenantId,
        // Possession of the invitation delivered to this exact mailbox proves it.
        emailVerifiedAt: invitation ? new Date() : null,
      },
    });
    await tx.member.create({ data: { userId: user.id, tenantId, role: membershipRole, status: isAutoJoin ? "PENDING_VERIFICATION" : "ACTIVE" } });
    return { user, tenantNameForLog, membershipRole };
  });
  if (created instanceof Response) return created;
  const { user, tenantNameForLog, membershipRole } = created;

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

  if (!invitation) await issueEmailVerification(user.id, email, origin);

  await recordAudit({ actorUserId: user.id, subjectUserId: user.id, tenantId: user.activeTenantId,
    actor: `${firstName} ${lastName}`,
    actorRole: "MEMBER",
    action: invitation
      ? "user.signup.invited"
      : isAutoJoin
      ? "user.company_domain.auto_join"
      : "user.signup.selfserve",
    resource: `user:${email}`,
    ip,
    tenantName: tenantNameForLog,
    detail: invitation
      ? `Joined ${tenantNameForLog} via invitation as ${membershipRole}`
      : isAutoJoin
      ? `Pending mailbox verification for shared workspace ${tenantNameForLog} via approved company domain @${email.split("@")[1]}`
      : `Created organization ${tenantNameForLog} (STARTER trial)`,
  });
  await db.securityEvent.create({
    data: {
      type: "SIGNUP", actorUserId: user.id, subjectUserId: user.id, tenantId: user.activeTenantId, severity: "INFO", actor: email, ip, blocked: false,
      detail: invitation
        ? `Signup via invitation to ${tenantNameForLog}`
        : isAutoJoin
        ? `Signup pending mailbox verification for corporate workspace ${tenantNameForLog}`
        : "Self-serve signup with new organization",
    },
  });

  const res = jsonOk({
    ok: true,
    token: session.id,
    needsVerification: !invitation,
    user: { id: user.id, email: user.email, name: `${firstName} ${lastName}` },
  });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=${session.id}; ${sessionCookieAttributes(req)}`);
  return res;
}

export async function POST(req: NextRequest) {
  try { return await handlePost(req); }
  catch (error) {
    if (error instanceof Response) return error;
    console.error("[auth] request failed", error);
    return jsonError("Authentication request failed", 500);
  }
}
