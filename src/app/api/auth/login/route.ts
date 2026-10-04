import { requestClientIp } from "@/lib/request-metadata";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { allowLoginAttempt } from "@/lib/login-throttle";
import { db } from "@/lib/db";
import { SESSION_COOKIE, hashPasswordAsync, passwordNeedsUpgrade, verifyPasswordAsync, recordAudit, sessionCookieAttributes } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { verifyTotp, matchRecoveryCode, generateTotpSecret, generateRecoveryCodes, otpauthUri } from "@/lib/totp";

const DUMMY_PASSWORD_HASH = "scrypt$1$32768$8$3$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
const enrollmentPurpose = (secret: string) => `2FA_ENROLL:${createHash("sha256").update(secret).digest("hex")}`;

async function handlePost(req: NextRequest) {
  let body: { email?: string; password?: string; otp?: string; challenge?: string; enrollment?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" ||
      (body.otp !== undefined && typeof body.otp !== "string") ||
      (body.challenge !== undefined && typeof body.challenge !== "string") ||
      (body.enrollment !== undefined && typeof body.enrollment !== "boolean")) {
    return jsonError("Invalid request body");
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) return jsonError("Email and password are required");
  if (email.length > 320 || Buffer.byteLength(password) > 16 * 1024 || (body.otp?.length ?? 0) > 64 || (body.challenge?.length ?? 0) > 256) return jsonError("Invalid request body");
  if (!allowLoginAttempt(email, requestClientIp(req))) {
    const response = jsonError("Too many sign-in attempts; retry shortly", 429);
    response.headers.set("retry-after", "300");
    return response;
  }

  const user = await db.user.findUnique({ where: { email } });
  // Uniform error - never reveal whether the account exists.
  const passwordOk = await verifyPasswordAsync(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  // Legacy digests are fast; give them the same expensive work as unknown accounts.
  if (user && passwordNeedsUpgrade(user.passwordHash)) await verifyPasswordAsync(password, DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk) {
    await db.securityEvent.create({
      data: {
        type: "FAILED_LOGIN", severity: "LOW", actor: email || "unknown",
        ip: requestClientIp(req), actorUserId: user?.id ?? null, blocked: false, detail: "Invalid credentials at portal sign-in",
      },
    });
    return jsonError("Invalid email or password", 401);
  }
  if (user.status !== "ACTIVE") {
    return jsonError("This account has been deactivated. Contact your administrator.", 403);
  }

  if (user.totpEnabled && !user.totpSecret) return jsonError("Two-factor enrollment is incomplete; contact your administrator", 403);
  const memberships = await db.member.findMany({ where: { userId: user.id, status: "ACTIVE", tenant: { status: { not: "SUSPENDED" } } }, include: { tenant: true } });
  const active = memberships.find((m) => m.tenantId === user.activeTenantId) ?? memberships[0];
  let mfaVerifiedAt: Date | null = null;
  let recoveryCodes: string[] | undefined;
  if (active?.tenant.enforceTwoFactor && !user.totpEnabled) {
    if (!body.enrollment) {
      const secret = generateTotpSecret();
      await db.user.update({ where: { id: user.id }, data: { totpPendingSecret: secret } });
      const challenge = await db.authChallenge.create({ data: { userId: user.id, purpose: enrollmentPurpose(secret), expiresAt: new Date(Date.now() + 5 * 60_000) } });
      // Password proof grants enrollment only: there is no session/cookie/token.
      return jsonOk({ requiresEnrollment: true, challenge: challenge.id, secret, uri: otpauthUri(secret, user.email) });
    }
    const secret = user.totpPendingSecret;
    const challenge = body.challenge ? await db.authChallenge.findUnique({ where: { id: body.challenge } }) : null;
    if (!secret || !challenge || challenge.userId !== user.id || challenge.purpose !== enrollmentPurpose(secret) || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return jsonError("Enrollment expired; start again", 401);
    if (!verifyTotp(secret, body.otp ?? "")) {
      await db.authChallenge.updateMany({ where: { id: challenge.id, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
      return jsonError("Invalid verification code", 401);
    }
    const recovery = generateRecoveryCodes();
    const enrolled = await db.$transaction(async (tx) => {
      const consumed = await tx.authChallenge.deleteMany({ where: { id: challenge.id, userId: user.id, purpose: enrollmentPurpose(secret), expiresAt: { gt: new Date() }, attempts: { lt: 5 } } });
      if (consumed.count !== 1) return false;
      const changed = await tx.user.updateMany({ where: { id: user.id, totpEnabled: false, totpPendingSecret: secret }, data: { totpEnabled: true, totpSecret: secret, totpPendingSecret: null, totpRecoveryCodes: JSON.stringify(recovery.hashes) } });
      if (changed.count !== 1) throw new Response(JSON.stringify({ error: "Enrollment changed; start again" }), { status: 409, headers: { "content-type": "application/json" } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!enrolled) return jsonError("Enrollment expired; start again", 401);
    mfaVerifiedAt = new Date(); recoveryCodes = recovery.codes;
  } else if (body.enrollment) return jsonError("Enrollment is not available for this account", 409);

  // ── Two-factor (TOTP / recovery code) second step ──
  if (user.totpEnabled && user.totpSecret) {
    const otp = (body.otp ?? "").trim();
    if (!otp) {
      // Password is correct - hand back a short-lived challenge, do NOT create a session yet.
      const challenge = await db.authChallenge.create({
        data: { userId: user.id, purpose: "2FA_LOGIN", expiresAt: new Date(Date.now() + 5 * 60_000) },
      });
      return jsonOk({ requiresOtp: true, challenge: challenge.id });
    }

    const challengeId = body.challenge ?? "";
    const challenge = challengeId
      ? await db.authChallenge.findUnique({ where: { id: challengeId } })
      : null;
    if (!challenge || challenge.userId !== user.id || challenge.purpose !== "2FA_LOGIN" || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      return jsonError("Verification session expired - start again", 401);
    }

    const okTotp = verifyTotp(user.totpSecret, otp);
    let usedRecovery = false;
    if (!okTotp && user.totpRecoveryCodes) {
      const hashes = JSON.parse(user.totpRecoveryCodes) as string[];
      const idx = matchRecoveryCode(hashes, otp);
      if (idx >= 0) {
        usedRecovery = true;
      }
    }
    if (!okTotp && !usedRecovery) {
      await db.authChallenge.updateMany({
        where: { id: challenge.id, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      return jsonError("Invalid verification code", 401);
    }
    const consumed = await db.$transaction(async (tx) => {
      const claimed = await tx.authChallenge.deleteMany({ where: { id: challenge.id, userId: user.id, purpose: "2FA_LOGIN", expiresAt: { gt: new Date() }, attempts: { lt: 5 } } });
      if (claimed.count !== 1) return false;
      if (usedRecovery) {
        const hashes = JSON.parse(user.totpRecoveryCodes!) as string[];
        const index = matchRecoveryCode(hashes, otp);
        hashes.splice(index, 1);
        const burned = await tx.user.updateMany({ where: { id: user.id, totpRecoveryCodes: user.totpRecoveryCodes }, data: { totpRecoveryCodes: JSON.stringify(hashes) } });
        if (burned.count !== 1) throw new Response(JSON.stringify({ error: "Recovery code already used; start again" }), { status: 401, headers: { "content-type": "application/json" } });
      }
      return true;
    });
    if (!consumed) return jsonError("Verification session expired - start again", 401);
    mfaVerifiedAt = new Date();
    await db.securityEvent.create({
      data: {
        type: "2FA_LOGIN", severity: "INFO", actor: user.email,
        ip: requestClientIp(req), actorUserId: user.id, blocked: false,
        detail: usedRecovery ? "Signed in with a recovery code" : "Signed in with TOTP",
      },
    });
  }

  // Upgrade only after every required factor succeeds. Compare-and-swap avoids
  // overwriting a password changed/reset concurrently with this sign-in.
  if (passwordNeedsUpgrade(user.passwordHash)) {
    const upgraded = await db.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash: await hashPasswordAsync(password) },
    });
    if (upgraded.count !== 1) return jsonError("Invalid email or password", 401);
  }

  const ip = requestClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 250) ?? null;
  const session = await db.session.create({
    data: {
      userId: user.id,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
      mfaVerifiedAt,
    },
  });

  await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await recordAudit({ actorUserId: user.id, subjectUserId: user.id, tenantId: user.activeTenantId,
    actor: `${user.firstName} ${user.lastName}`, actorRole: user.role,
    action: "user.login.portal", resource: `user:${user.email}`, ip,
  });

  // The session id doubles as the bearer token for embedding contexts where the
  // browser refuses to persist any cookie at all.
  const res = jsonOk({
    ok: true,
    token: session.id,
    ...(recoveryCodes ? { recoveryCodes } : {}),
    user: { id: user.id, email: user.email, role: user.role, name: `${user.firstName} ${user.lastName}` },
  });
  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${session.id}; ${sessionCookieAttributes(req)}`,
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
