/** Sender identity is server configuration, independent of SMTP credentials or request hosts. */
import type { Prisma } from "@prisma/client";
export class MailSenderError extends Error {}
const DEFAULT_ADDRESS = "notifications@docurama.eu";
export type MailSender = { address: string; domain: string; name: string; header: string };
export function validateMailSender(raw: unknown): MailSender {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 500 || /[\u0000-\u001f\u007f]/.test(raw)) throw new MailSenderError("A valid configured mail sender is required");
  const value = raw.trim();
  const named = /^([^<>]+)\s*<([^<>]+)>$/.exec(value);
  const address = (named ? named[2] : value).trim();
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at), domain = address.slice(at + 1).toLowerCase();
  if (address.length > 254 || at < 1 || local.length > 64 ||
      !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local) ||
      !/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(domain)) {
    throw new MailSenderError("Configured mail sender must contain exactly one valid mailbox");
  }
  const rawName = named ? named[1].trim() : "";
  const name = rawName.startsWith('"') && rawName.endsWith('"')
    ? rawName.slice(1, -1).replace(/\\(["\\])/g, "$1") : rawName;
  const normalized = `${local}@${domain}`;
  return { address: normalized, domain, name,
    header: name ? `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${normalized}>` : normalized };
}
type SenderClient = Pick<Prisma.TransactionClient, "platformSetting" | "notificationSettings" | "domain">;
/** Null permits an outbox-only queue; dispatch always requires a configured sender.
 * Platform SMTP configuration is privileged. A tenant override additionally
 * requires that tenant's currently verified SENDING-domain proof. */
export async function resolveConfiguredMailSender(client: SenderClient, options: { tenantId?: string | null; required?: boolean } = {}): Promise<string | null> {
  if (options.tenantId) {
    const settings = await client.notificationSettings.findUnique({ where: { tenantId: options.tenantId }, select: { smtpFrom: true } });
    if (settings) {
      const sender = validateMailSender(settings.smtpFrom);
      // Schema-populated default is inheritance, never tenant-owned authority.
      if (sender.address.toLowerCase() !== DEFAULT_ADDRESS) {
        const proof = await client.domain.findFirst({ where: { tenantId: options.tenantId, domain: sender.domain,
          purpose: "SENDING", status: "VERIFIED", verifiedAt: { not: null }, tenant: { status: { in: ["ACTIVE", "TRIAL"] } } }, select: { id: true } });
        if (!proof) throw new MailSenderError("Tenant sender requires a currently verified sending domain");
        return sender.header;
      }
    }
  }
  // Compose forwards optional variables as blank. Blank means absent; a
  // nonblank invalid identity never silently falls back to another sender.
  if (process.env.SMTP_FROM?.trim()) return validateMailSender(process.env.SMTP_FROM).header;
  const platform = await client.platformSetting.findUnique({ where: { id: "singleton" }, select: { smtpFrom: true, smtpHost: true } });
  if (platform?.smtpHost?.trim() && platform.smtpHost.trim() !== "smtp.eu.mailprovider.io") return validateMailSender(platform.smtpFrom).header;
  if (options.required === false) return null;
  throw new MailSenderError("Configure SMTP_FROM or a platform SMTP sender before mail delivery");
}
