import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";

type Ctx = { params: Promise<{ token: string }> };

/** Public shape of an invitation - safe to show before any authentication. */
async function loadInvitation(token: string) {
  return db.invitation.findUnique({
    where: { token },
    include: { tenant: { select: { id: true, name: true, slug: true, planCode: true } } },
  });
}

/**
 * GET  /api/invitations/[token] - public: what am I invited to?
 * POST /api/invitations/[token] - authenticated accept: session email must
 *                               match the invited email.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const inv = await loadInvitation(token);
  if (!inv) return jsonError("Invitation not found", 404);
  const expired = inv.expiresAt < new Date();
  if (inv.status !== "PENDING" || expired) {
    return jsonOk({
      status: expired ? "EXPIRED" : inv.status,
      org: { name: inv.tenant.name },
      email: inv.email,
    });
  }
  return jsonOk({
    status: "PENDING",
    org: { name: inv.tenant.name, planCode: inv.tenant.planCode },
    email: inv.email,
    role: inv.role,
    invitedBy: inv.invitedBy,
    expiresAt: inv.expiresAt.toISOString(),
  });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return jsonError("Sign in (or create an account) with the invited email to accept", 401);

  const { token } = await ctx.params;
  const inv = await loadInvitation(token);
  if (!inv) return jsonError("Invitation not found", 404);
  if (inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    return jsonError("This invitation is no longer valid - ask your colleague to send a new one", 410);
  }
  if (me.email.toLowerCase() !== inv.email.toLowerCase()) {
    return jsonError(`This invitation was sent to ${inv.email} - you're signed in as ${me.email}`, 403);
  }

  const already = await db.member.findFirst({ where: { userId: me.id, tenantId: inv.tenantId } });
  if (already) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    return jsonOk({ ok: true, message: `You're already a member of ${inv.tenant.name}` });
  }

  await db.member.create({
    data: { userId: me.id, tenantId: inv.tenantId, role: inv.role, status: "ACTIVE" },
  });
  await db.user.update({ where: { id: me.id }, data: { activeTenantId: inv.tenantId } });
  await db.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  await recordAudit({
    actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
    action: "invite.accepted", resource: `invite:${inv.email}`, tenantName: inv.tenant.name,
    detail: `Joined ${inv.tenant.name} as ${inv.role}`,
  });

  return jsonOk({ ok: true, message: `Welcome to ${inv.tenant.name}` });
}
