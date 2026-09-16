import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { sha, requestOrigin } from "@/lib/onboarding";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return jsonError("Please enter a valid work email address");
  }

  const genericResponse = jsonOk({
    ok: true,
    message: "If an account exists with this email address, a password reset link has been sent.",
  });

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status === "SUSPENDED") {
    return genericResponse;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

  // Clear previous pending reset requests for this user
  await db.emailVerification.deleteMany({
    where: { userId: user.id, purpose: "PASSWORD_RESET" },
  });

  await db.emailVerification.create({
    data: {
      userId: user.id,
      email: user.email,
      tokenHash,
      purpose: "PASSWORD_RESET",
      expiresAt,
    },
  });

  const origin = requestOrigin(req);
  const resetUrl = `${origin}/reset-password?token=${rawToken}`;

  await db.mailOutbox.create({
    data: {
      toEmail: user.email,
      fromEmail: "Docurama Sign <notifications@docurama.eu>",
      subject: "Reset your Docurama password",
      template: "PASSWORD_RESET",
      status: "QUEUED",
      bodyText: [
        `Hello ${user.firstName},`,
        ``,
        `A password reset was requested for your Docurama account (${user.email}).`,
        `Click the link below to choose a new password:`,
        ``,
        resetUrl,
        ``,
        `This link is single-use and will expire in 1 hour.`,
        `If you didn't request a password reset, you can safely ignore this email; your password remains unchanged.`,
        ``,
        `Docurama SAS · 1 Rue Marguerin, 75014 Paris, France`,
      ].join("\n"),
      linkUrl: resetUrl,
    },
  });

  await recordAudit({
    actor: `${user.firstName} ${user.lastName}`,
    actorRole: user.role,
    action: "user.password.reset_requested",
    resource: `user:${user.email}`,
    detail: "Password reset link issued and queued to outbox",
  });

  return genericResponse;
}
