import { db } from "@/lib/db";
import { resolveSmtpMode, smtpMode } from "@/lib/mail";
import { MailSenderError, resolveConfiguredMailSender, validateMailSender } from "@/lib/mail-sender";

/** Configuration status, independent of external relay or mailbox acceptance. */
export async function configuredMailState(tenantId?: string) {
  let configuredFrom: string | null = null;
  let senderError: string | null = null;
  try {
    configuredFrom = await resolveConfiguredMailSender(db, { tenantId, required: false });
    if (!configuredFrom) senderError = "Configure SMTP_FROM or a platform SMTP sender before mail delivery";
  } catch (error) {
    senderError = error instanceof MailSenderError ? error.message : "Sender configuration could not be verified";
  }
  const environmentMode = smtpMode();
  const mode = environmentMode.configured ? environmentMode : await resolveSmtpMode();
  const senderTrusted = Boolean(configuredFrom) && !senderError;
  return {
    configuredFrom, senderTrusted, senderError,
    transportConfigured: mode.configured,
    transportSource: environmentMode.configured ? "SMTP_URL" : mode.configured ? "PLATFORM_SETTINGS" : "OUTBOX_ONLY",
    smtpOverrideActive: false,
    deliveryConfigured: mode.configured && senderTrusted,
  };
}

/** A tenant candidate needs the same scoped proof that dispatch rechecks.
 * The schema default is inheritance; it never grants tenant sending authority. */
export async function validateWorkspaceMailSender(tenantId: string, raw: unknown): Promise<string> {
  const sender = validateMailSender(raw);
  if (sender.address.toLowerCase() !== "notifications@docurama.eu") {
    const proof = await db.domain.findFirst({ where: {
      tenantId, domain: sender.domain, purpose: "SENDING", status: "VERIFIED", verifiedAt: { not: null },
      tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
    }, select: { id: true } });
    if (!proof) throw new MailSenderError("Tenant sender requires a currently verified sending domain");
  }
  return sender.header;
}
