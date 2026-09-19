import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { issueEmailVerification, requestOrigin } from "@/lib/onboarding";

/** POST /api/auth/resend-verification - re-queues the signup verification email (60s rate limit). */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const cookieToken = req.cookies.get("docurama_session")?.value;
  const sessionId = auth || cookieToken;
  if (!sessionId) return jsonError("Not authenticated", 401);

  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return jsonError("Not authenticated", 401);
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE") return jsonError("Not authenticated", 401);
  if (user.emailVerifiedAt) return jsonError("Your email is already verified");

  // Rate limit: at most one fresh verification email per minute.
  const last = await db.emailVerification.findFirst({
    where: { userId: user.id, purpose: "SIGNUP" },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - last.createdAt.getTime() < 60_000) {
    return jsonError("Please wait a minute before requesting another email", 429);
  }

  await issueEmailVerification(user.id, user.email, requestOrigin(req));
  await recordAudit({
    actor: `${user.firstName} ${user.lastName}`,
    actorRole: user.role,
    action: "user.email.verification_resent",
    resource: `user:${user.email}`,
  });

  return jsonOk({ ok: true, message: `Verification email re-sent to ${user.email}` });
}
