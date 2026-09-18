import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import {
  computeOnboardingState, getOnboardingFlags, setOnboardingFlags,
  createInvitation, requestOrigin, SMTP_TRANSPORT_CONFIGURED,
} from "@/lib/onboarding";
import { seatCapacity } from "@/lib/billing";
import { planDef } from "@/lib/plans";

/**
 * GET  /api/onboarding - full wizard state for the signed-in user.
 * POST /api/onboarding - wizard operations:
 *   org.update      {name, industry?, companySize?}
 *   invite.send     {email, role}
 *   invite.revoke   {id}
 *   invite.skip
 *   signature.save  {kind, method, value, font}
 *   security.skip
 *   verify.demo     - in-session verification shortcut while no SMTP
 *                     transport is wired (clearly audit-flagged)
 *   complete        - marks onboarding finished
 */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return jsonOk({ authenticated: false });
  const state = await computeOnboardingState(me.id);
  return jsonOk(state);
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return jsonError("Not authenticated", 401);

  let body: { op?: string; id?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }
  const op = body.op ?? "";
  const data = body.data ?? {};
  const id = body.id ?? "";
  if (!me.tenantId) return jsonError("No workspace membership for this account", 403);

  const flags = await getOnboardingFlags(me.id);

  // ── Organization ──
  if (op === "org.update") {
    const name = String(data.name ?? "").trim();
    if (!name) return jsonError("Organization name is required");
    if (name.length > 80) return jsonError("Organization name must be 80 characters or fewer");
    const industry = data.industry !== undefined ? String(data.industry ?? "").slice(0, 60) || null : undefined;
    const companySize = data.companySize !== undefined ? String(data.companySize ?? "").slice(0, 20) || null : undefined;
    await db.tenant.update({
      where: { id: me.tenantId },
      data: { name, ...(industry !== undefined ? { industry } : {}), ...(companySize !== undefined ? { companySize } : {}) },
    });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "org.profile.updated", resource: `tenant:${me.tenantSlug}`, tenantName: name,
      detail: "Organization profile set during onboarding",
    });
    return jsonOk({ ok: true, message: `Organization saved - ${name}` });
  }

  // ── Team invites ──
  if (op === "invite.send") {
    const email = String(data.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return jsonError("Enter a valid email address");
    const role = ["ADMIN", "MEMBER"].includes(String(data.role)) ? String(data.role) : "MEMBER";

    const member = await db.user.findUnique({ where: { email } });
    if (member) {
      const already = await db.member.findFirst({ where: { userId: member.id, tenantId: me.tenantId } });
      if (already) return jsonError("This person is already a member of the workspace");
    }
    // Seat capacity: pending invitations hold a seat until accepted/revoked.
    const cap = await seatCapacity(me.tenantId);
    if (cap.remaining <= 0) {
      return jsonError(
        `All ${cap.seatLimit} seats on the ${planDef(cap.planCode).name} plan are in use ` +
          `(${cap.members} member${cap.members === 1 ? "" : "s"} + ${cap.pendingInvites} pending invitation${cap.pendingInvites === 1 ? "" : "s"}). ` +
          "Revoke an unused invitation or upgrade the plan to invite more.",
        403,
      );
    }
    await createInvitation({
      tenantId: me.tenantId, email, role,
      invitedBy: `${me.firstName} ${me.lastName}`, invitedById: me.id,
      origin: requestOrigin(req),
    });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "invite.sent", resource: `invite:${email}`, tenantName: me.tenantName,
      detail: `Invitation queued for ${email} (${role})`,
    });
    return jsonOk({ ok: true, message: `Invitation sent to ${email}` });
  }

  if (op === "invite.revoke") {
    const inv = await db.invitation.findFirst({ where: { id, tenantId: me.tenantId } });
    if (!inv) return jsonError("Invitation not found", 404);
    await db.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
    return jsonOk({ ok: true, message: `Invitation for ${inv.email} revoked` });
  }

  if (op === "invite.skip") {
    await setOnboardingFlags(me.id, { ...flags, skippedInvite: true });
    return jsonOk({ ok: true, message: "You can invite teammates anytime from Settings → Users" });
  }

  // ── Signature stamp ──
  if (op === "signature.save") {
    const kind = data.kind === "initial" ? "initial" : "signature";
    const method = ["draw", "type", "upload"].includes(String(data.method)) ? String(data.method) : "type";
    const value = String(data.value ?? "");
    if (!value) return jsonError("Draw, type or upload a signature first");
    if (value.length > 400_000) return jsonError("Signature image is too large (max ~300 KB)");
    const font = data.font ? String(data.font).slice(0, 60) : null;

    const existingCount = await db.userSignature.count({ where: { userId: me.id, kind } });
    await db.userSignature.create({
      data: { userId: me.id, kind, method, value, font, isDefault: existingCount === 0 },
    });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "signature.created", resource: `user:${me.email}`,
      detail: `${kind === "initial" ? "Initials" : "Signature"} saved during onboarding (${method})`,
    });
    return jsonOk({ ok: true, message: kind === "initial" ? "Initials saved" : "Signature saved" });
  }

  // ── Security ──
  if (op === "security.skip") {
    if (me.orgs.some((o) => o.id === me.tenantId)) {
      const tenant = await db.tenant.findUnique({ where: { id: me.tenantId } });
      if (tenant?.enforceTwoFactor) {
        return jsonError("Your organization requires two-factor authentication - set it up to continue", 403);
      }
    }
    await setOnboardingFlags(me.id, { ...flags, skippedSecurity: true });
    return jsonOk({ ok: true, message: "Skipped for now - you can enable 2FA anytime in Settings → Profile" });
  }

  // ── In-session email verification (demo shortcut) ──
  if (op === "verify.demo") {
    if (SMTP_TRANSPORT_CONFIGURED) {
      return jsonError("SMTP delivery is live - use the link from your inbox", 400);
    }
    const user = await db.user.findUnique({ where: { id: me.id } });
    if (!user) return jsonError("Not authenticated", 401);
    if (user.emailVerifiedAt) return jsonOk({ ok: true, message: "Email already verified" });
    await db.user.update({ where: { id: me.id }, data: { emailVerifiedAt: new Date() } });
    await db.emailVerification.updateMany({
      where: { userId: me.id, purpose: "SIGNUP", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "user.email.verified", resource: `user:${me.email}`,
      severity: "WARNING",
      detail: "Verified in-session (no SMTP transport configured - demo shortcut)",
    });
    return jsonOk({ ok: true, message: "Email verified in-session" });
  }

  // ── Complete ──
  if (op === "complete") {
    const state = await computeOnboardingState(me.id);
    if (!state.emailVerified) return jsonError("Verify your email address before finishing setup");
    if (!state.steps.org) return jsonError("Name your organization before finishing setup");
    await setOnboardingFlags(me.id, { ...flags, completedAt: new Date().toISOString() });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "user.onboarding.completed", resource: `user:${me.email}`, tenantName: me.tenantName,
    });
    return jsonOk({ ok: true, message: "You're all set - welcome to Docurama" });
  }

  return jsonError("Unsupported operation", 404);
}
