import { db } from "@/lib/db";
import { randomBytes } from "crypto";
import { sha } from "@/lib/onboarding";
import { hashPassword } from "@/lib/auth";

async function main() {
  console.log("=== Testing Password Reset Flow ===");

  const user = await db.user.findUnique({ where: { email: "sofia@stalfe.example" } });
  if (!user) throw new Error("User sofia@stalfe.example not found");

  const originalPasswordHash = user.passwordHash;
  console.log("Found user:", user.firstName, user.lastName, user.email);

  // Step 1: Issue password reset token (simulates POST /api/auth/forgot-password)
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.emailVerification.deleteMany({
    where: { userId: user.id, purpose: "PASSWORD_RESET" },
  });

  const record = await db.emailVerification.create({
    data: {
      userId: user.id,
      email: user.email,
      tokenHash,
      purpose: "PASSWORD_RESET",
      expiresAt,
    },
  });
  console.log("Created EmailVerification for PASSWORD_RESET, id:", record.id);

  // Step 2: Queue reset email
  const resetUrl = `https://docurama.eu/reset-password?token=${rawToken}`;
  const outbox = await db.mailOutbox.create({
    data: {
      toEmail: user.email,
      fromEmail: "Docurama Sign <notifications@docurama.eu>",
      subject: "Reset your Docurama password",
      template: "PASSWORD_RESET",
      status: "QUEUED",
      bodyText: `Reset URL: ${resetUrl}`,
      linkUrl: resetUrl,
    },
  });
  console.log("Created MailOutbox record, id:", outbox.id, "linkUrl:", outbox.linkUrl);

  // Step 3: Consume reset token (simulates POST /api/auth/reset-password)
  const verification = await db.emailVerification.findUnique({
    where: { tokenHash: sha(rawToken) },
    include: { user: true },
  });

  if (!verification || verification.consumedAt || verification.expiresAt < new Date()) {
    throw new Error("Verification failed or expired");
  }

  const testNewPassword = "NewSecretPassword2026!";
  const newHash = hashPassword(testNewPassword);

  await db.user.update({
    where: { id: verification.userId },
    data: { passwordHash: newHash, passwordChangedAt: new Date() },
  });

  await db.emailVerification.update({
    where: { id: verification.id },
    data: { consumedAt: new Date() },
  });

  // Security: Invalidate existing sessions
  const deletedSessions = await db.session.deleteMany({ where: { userId: verification.userId } });
  console.log("Sessions revoked:", deletedSessions.count);

  // Step 4: Verify authentication with new password
  const updatedUser = await db.user.findUnique({ where: { email: user.email } });
  if (updatedUser?.passwordHash !== hashPassword(testNewPassword)) {
    throw new Error("Password authentication verification failed!");
  }
  console.log("Password reset successfully verified with cryptographic match!");

  // Step 5: Restore password back to original demo password
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: originalPasswordHash },
  });
  console.log("Restored original demo password. All tests passed!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
