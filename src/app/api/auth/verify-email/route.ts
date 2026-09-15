import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { consumeVerificationToken } from "@/lib/onboarding";

/**
 * Email verification for signup.
 *
 *  GET  /api/auth/verify-email?token=…  - the link target from the email:
 *      consumes the token and redirects to /welcome with a result flag.
 *  POST /api/auth/verify-email {token}  - JSON variant used by the wizard.
 */
async function verify(token: string): Promise<{ userId: string; email: string } | null> {
  if (!token || token.length < 16) return null;
  const result = await consumeVerificationToken(token);
  if (!result) return null;
  const user = await db.user.findUnique({ where: { id: result.userId } });
  if (user) {
    await recordAudit({
      actor: `${user.firstName} ${user.lastName}`,
      actorRole: user.role,
      action: "user.email.verified",
      resource: `user:${user.email}`,
      detail: "Email address confirmed via verification link",
    });
  }
  return result;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const result = await verify(token);
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(
    result ? `${origin}/welcome?verified=1` : `${origin}/welcome?verified=0`,
    303,
  );
}

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }
  const result = await verify((body.token ?? "").trim());
  if (!result) return jsonError("This verification link is invalid or has expired", 410);
  return jsonOk({ ok: true, email: result.email });
}
