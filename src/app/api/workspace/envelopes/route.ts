import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { requireUser, type SessionUser } from "@/lib/auth";
import { currentAllowance, reserveEnvelopeAllowance } from "@/lib/billing";
import { serializableTransaction } from "@/lib/transaction";
import { queueEnvelopeEvent, retryFailedDeliveries } from "@/lib/webhooks";
import { processOutbox } from "@/lib/mail";
import { jsonError, jsonOk } from "@/lib/serializers";
import { foldForSearch } from "@/lib/search";
import { requestClientIp } from "@/lib/request-metadata";
import { GET as workspaceGet } from "../[section]/route";

export const dynamic = "force-dynamic";
/** Preserve the existing list contract while moving mutations to their own route. */
export function GET(req: NextRequest) {
  return workspaceGet(req, { params: Promise.resolve({ section: "envelopes" }) });
}

async function requireActiveMembership(tx: Prisma.TransactionClient, me: SessionUser) {
  if (!me.tenantId) throw jsonError("No workspace membership for this account", 403);
  const membership = await tx.member.findFirst({ where: {
    userId: me.id, tenantId: me.tenantId, status: "ACTIVE",
    user: { status: "ACTIVE" }, tenant: { status: { not: "SUSPENDED" } },
  } });
  if (!membership) throw jsonError("Workspace membership is no longer active", 403);
  return me.tenantId;
}

function wakeDelivery() {
  void retryFailedDeliveries(20).catch((error) => console.warn("[envelopes] webhook wake-up failed", error));
  void processOutbox(20).catch((error) => console.warn("[envelopes] mail wake-up failed", error));
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.tenantId) return jsonError("No workspace membership for this account", 403);
    const input: unknown = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) return jsonError("Invalid envelope request", 400);
    const body = input as Record<string, unknown>;
    const data = body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data as Record<string, unknown> : {};
    const id = typeof body.id === "string" ? body.id : "";
    const actor = `${me.firstName} ${me.lastName}`;
    const now = new Date();
    const ip = requestClientIp(req);
    const origin = req.nextUrl.origin;

    if (body.op === "send") {
      const title = String(data.title ?? "").trim();
      if (!title || title.length > 500) return jsonError("Document title is required (maximum 500 characters)");
      if (!Array.isArray(data.recipients) || data.recipients.length === 0 || data.recipients.length > 500) {
        return jsonError("Provide between 1 and 500 recipients per request");
      }
      const recipients = data.recipients.map((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw jsonError("Invalid recipient");
        const item = value as Record<string, unknown>;
        const email = String(item.email ?? "").trim().toLowerCase();
        const name = String(item.name ?? email).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 200) {
          throw jsonError("Every recipient must have a valid email and name");
        }
        return { name, email, role: item.role === "CC" ? "CC" : "SIGNER" };
      });
      if (!recipients.some((item) => item.role === "SIGNER")) return jsonError("At least one signer is required");
      const documentId = typeof data.documentId === "string" && data.documentId ? data.documentId : undefined;
      const templateId = typeof data.templateId === "string" && data.templateId ? data.templateId : undefined;
      // Paid-term catch-up is separate; capacity is decided again in the transaction.
      await currentAllowance(me.tenantId, now);
      const envelope = await serializableTransaction(async (tx) => {
        const tenantId = await requireActiveMembership(tx, me);
        const document = documentId ? await tx.document.findFirst({ where: { id: documentId, tenantId } }) : null;
        if (documentId && !document) throw jsonError("Document not found in this workspace", 404);
        const template = templateId ? await tx.template.findFirst({
          where: { id: templateId, OR: [{ tenantId }, { isBuiltIn: true }] },
        }) : null;
        if (templateId && !template) throw jsonError("Template not found in this workspace", 404);
        const reservation = await reserveEnvelopeAllowance(tenantId, tx, now);
        if (!reservation) throw jsonError("Monthly envelope quota reached", 402);
        const code = `DOC-${randomBytes(4).toString("hex").toUpperCase()}`;
        const created = await tx.envelope.create({ data: {
          publicCode: code, title, titleLower: foldForSearch(title), tenantId, createdById: me.id,
          documentId, templateId, status: "SENT", message: String(data.message ?? "").slice(0, 10_000),
          pages: document?.pageCount ?? template?.pages ?? 1, sha256: document?.sha256, createdAt: now,
        } });
        if (template) await tx.template.update({ where: { id: template.id }, data: {
          usageCount: { increment: 1 }, lastUsedAt: now,
        } });
        const tokens = recipients.map(() => randomBytes(32).toString("base64url"));
        await tx.recipient.createMany({ data: recipients.map((item, index) => ({
          envelopeId: created.id, ...item, order: index + 1, status: "PENDING", accessToken: tokens[index],
        })) });
        await tx.mailOutbox.createMany({ data: recipients.map((item, index) => ({
          toEmail: item.email, template: item.role === "SIGNER" ? "SIGN_INVITE" : "COPY_NOTICE",
          subject: item.role === "SIGNER" ? `${actor} asks for your signature: ${title}` : `${actor} added you as a copy recipient: ${title}`,
          bodyText: item.role === "SIGNER"
            ? `Hello ${item.name},\n\n${actor} sent you "${title}" for electronic signature via Docurama.\n\nOpen your personal signing link (unique to you, do not forward):\n${origin}/sign/${tokens[index]}\n\nVerification code once completed: ${code}\n`
            : `Hello ${item.name},\n\n${actor} added you as a copy recipient for "${title}". No signature is required from you.\n\nVerification code: ${code}\n`,
          linkUrl: item.role === "SIGNER" ? `${origin}/sign/${tokens[index]}` : null,
          createdAt: now,
        })) });
        await tx.envelopeEvent.createMany({ data: [
          { envelopeId: created.id, actor, action: "CREATED", at: now, detail: "Document prepared in Builder" },
          { envelopeId: created.id, actor: "Docurama", action: "SENT", at: now,
            detail: `Signing invitations and copy notices queued for ${recipients.length} recipients` },
        ] });
        await queueEnvelopeEvent(tx, tenantId, "envelope.sent", {
          code, title, status: "SENT", recipientCount: recipients.length, recipients,
        });
        return created;
      });
      wakeDelivery();
      return jsonOk({ ok: true, message: `Sent to ${recipients.length} recipient${recipients.length > 1 ? "s" : ""} - code ${envelope.publicCode}` });
    }

    if (body.op === "remind") {
      await serializableTransaction(async (tx) => {
        const tenantId = await requireActiveMembership(tx, me);
        const envelope = await tx.envelope.findFirst({ where: { id, tenantId }, include: { recipients: true } });
        if (!envelope) throw jsonError("Envelope not found", 404);
        if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) throw jsonError("Reminders can only be sent for active envelopes");
        if (envelope.lastRemindedAt && now.getTime() - envelope.lastRemindedAt.getTime() < 6 * 3_600_000) {
          throw jsonError("A reminder was already sent recently - please wait before sending another.");
        }
        const pending = envelope.recipients.filter((item) => item.role === "SIGNER" && ["PENDING", "DELIVERED"].includes(item.status));
        if (!pending.length) throw jsonError("No pending signers remain");
        await tx.mailOutbox.createMany({ data: pending.map((item) => ({
          toEmail: item.email, template: "REMINDER", subject: `Reminder: ${envelope.title}`,
          bodyText: `Hello ${item.name},\n\n${actor} reminds you to sign "${envelope.title}".\n\nYour personal signing link:\n${origin}/sign/${item.accessToken}\n`,
          linkUrl: `${origin}/sign/${item.accessToken}`, createdAt: now,
        })) });
        await tx.envelope.update({ where: { id }, data: { lastRemindedAt: now, reminderCount: { increment: 1 } } });
        await tx.envelopeEvent.create({ data: { envelopeId: id, actor, action: "REMINDED", at: now,
          detail: `${pending.length} reminder email(s) queued` } });
        await queueEnvelopeEvent(tx, tenantId, "reminder.sent", { code: envelope.publicCode, title: envelope.title, status: envelope.status });
      });
      wakeDelivery();
      return jsonOk({ ok: true, message: "Reminder queued" });
    }

    if (body.op === "void") {
      const reason = String(data.reason ?? "").trim();
      if (!reason || reason.length > 1000) return jsonError("A void reason is required (maximum 1000 characters)");
      await serializableTransaction(async (tx) => {
        const tenantId = await requireActiveMembership(tx, me);
        const envelope = await tx.envelope.findFirst({ where: { id, tenantId } });
        if (!envelope) throw jsonError("Envelope not found", 404);
        if (["COMPLETED", "VOIDED", "DECLINED", "EXPIRED"].includes(envelope.status)) throw jsonError("This envelope can no longer be voided");
        await tx.envelope.update({ where: { id }, data: { status: "VOIDED", voidedAt: now, voidReason: reason } });
        await tx.envelopeEvent.create({ data: { envelopeId: id, actor, action: "VOIDED", detail: reason, at: now } });
        await tx.auditEvent.create({ data: {
          actor, actorUserId: me.id, tenantId, actorRole: me.role, action: "envelope.voided",
          resource: `envelope:${envelope.publicCode}`, severity: "WARNING", tenantName: me.tenantName, detail: reason, ip,
        } });
        await queueEnvelopeEvent(tx, tenantId, "envelope.voided", {
          code: envelope.publicCode, title: envelope.title, status: "VOIDED", reason,
        });
      });
      wakeDelivery();
      return jsonOk({ ok: true, message: "Envelope voided" });
    }
    return jsonError("Unsupported operation");
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[envelopes POST]", error);
    return jsonError("Operation failed", 500);
  }
}
