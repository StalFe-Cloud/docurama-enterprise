import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, hashPassword, recordAudit, sessionCookieAttributes } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { verifyTotp, matchRecoveryCode, sha256 } from "@/lib/totp";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; otp?: string; challenge?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) return jsonError("Email and password are required");

  const user = await db.user.findUnique({ where: { email } });
  // Uniform error - never reveal whether the account exists.
  if (!user || user.passwordHash !== hashPassword(password)) {
    await db.securityEvent.create({
      data: {
        type: "FAILED_LOGIN", severity: "LOW", actor: email || "unknown",
        ip: "198.51.100.7", blocked: false, detail: "Invalid credentials at portal sign-in",
      },
    });
    return jsonError("Invalid email or password", 401);
  }
  if (user.status === "SUSPENDED") {
    return jsonError("This account has been deactivated. Contact your administrator.", 403);
  }

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
    if (!challenge || challenge.userId !== user.id || challenge.expiresAt < new Date() || challenge.attempts >= 5) {
      return jsonError("Verification session expired - start again", 401);
    }

    const okTotp = verifyTotp(user.totpSecret, otp);
    let usedRecovery = false;
    if (!okTotp && user.totpRecoveryCodes) {
      const hashes = JSON.parse(user.totpRecoveryCodes) as string[];
      const idx = matchRecoveryCode(hashes, otp);
      if (idx >= 0) {
        usedRecovery = true;
        hashes.splice(idx, 1); // one-time - burn the used code
        await db.user.update({
          where: { id: user.id },
          data: { totpRecoveryCodes: JSON.stringify(hashes) },
        });
      }
    }
    if (!okTotp && !usedRecovery) {
      await db.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return jsonError("Invalid verification code", 401);
    }
    await db.authChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    await db.securityEvent.create({
      data: {
        type: "2FA_LOGIN", severity: "INFO", actor: user.email,
        ip: "10.42.0.7", blocked: false,
        detail: usedRecovery ? "Signed in with a recovery code" : "Signed in with TOTP",
      },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent")?.slice(0, 250) ?? null;
  const session = await db.session.create({
    data: {
      userId: user.id,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });

  await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await recordAudit({
    actor: `${user.firstName} ${user.lastName}`, actorRole: user.role,
    action: "user.login.portal", resource: `user:${user.email}`, ip,
  });

  // The session id doubles as the bearer token for embedding contexts where the
  // browser refuses to persist any cookie at all.
  const res = jsonOk({
    ok: true,
    token: session.id,
    user: { id: user.id, email: user.email, role: user.role, name: `${user.firstName} ${user.lastName}` },
  });
  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${session.id}; ${sessionCookieAttributes(req)}`,
  );
  return res;
}
