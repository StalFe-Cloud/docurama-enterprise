import { requestClientIp } from "@/lib/request-metadata";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  hashPasswordAsync,
  recordAudit,
  sessionCookieAttributes,
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { sha } from "@/lib/onboarding";

async function handlePost(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";

  if (!token || token.length < 16) {
    return jsonError("A valid password reset token is required", 400);
  }

  if (password.length < 10) {
    return jsonError("Password must be at least 10 characters", 400);
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return jsonError("Password must include at least one letter and one number", 400);
  }

  const tokenHash = sha(token);
  const record = await db.emailVerification.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (
    !record ||
    record.purpose !== "PASSWORD_RESET" ||
    record.consumedAt ||
    record.expiresAt < new Date()
  ) {
    return jsonError(
      "This password reset link is invalid or has expired. Please request a new one.",
      410
    );
  }

  const newPasswordHash = await hashPasswordAsync(password);
  await db.user.update({
    where: { id: record.userId },
    data: {
      passwordHash: newPasswordHash,
      passwordChangedAt: new Date(),
    },
  });

  await db.emailVerification.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  // Security best practice: revoke existing sessions when password changes
  await db.session.deleteMany({
    where: { userId: record.userId },
  });

  // Issue fresh session so user is immediately logged in
  const ip = requestClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 250) ?? null;
  const session = await db.session.create({
    data: {
      userId: record.userId,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });

  await recordAudit({ actorUserId: record.userId, subjectUserId: record.userId, tenantId: record.user.activeTenantId,
    actor: `${record.user.firstName} ${record.user.lastName}`,
    actorRole: record.user.role,
    action: "user.password.reset",
    resource: `user:${record.user.email}`,
    ip,
    detail: "Password successfully changed via single-use reset token",
  });

  const res = jsonOk({
    ok: true,
    message: "Password reset successfully. Redirecting to portal…",
    token: session.id,
    user: {
      id: record.user.id,
      email: record.user.email,
      role: record.user.role,
      name: `${record.user.firstName} ${record.user.lastName}`,
    },
  });

  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${session.id}; ${sessionCookieAttributes(req)}`
  );

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
