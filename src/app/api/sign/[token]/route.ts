import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/serializers";
import { computeEnvelopeDigest } from "@/lib/esign";
import { pushAttestationForEnvelope } from "@/lib/attestation";
import { appendSealCommitment } from "@/lib/transparency";
import { queueEnvelopeEvent, retryFailedDeliveries } from "@/lib/webhooks";
import { serializableTransaction } from "@/lib/transaction";

/** Signing tokens authenticate recipients; every state decision is re-read in
 * the same serializable transaction as its ledger entry and durable outbox.
 * A retry may replay database work, never a network request. */
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };
const SIGNATURE_FONTS = new Set(["caveat", "dancing-script", "great-vibes"]);

async function loadRecipient(tx: Prisma.TransactionClient, token: string) {
  const recipient = await tx.recipient.findUnique({
    where: { accessToken: token },
    include: { envelope: { include: {
      recipients: true,
      createdBy: { select: { email: true } },
      tenant: { select: { status: true } },
    } } },
  });
  if (!recipient) throw jsonError("This signing link is not valid. Check the link in your invitation email.", 404);
  if (recipient.envelope.tenant.status === "SUSPENDED") throw jsonError("This document is not available for signing.", 409);
  if (["VOIDED", "DECLINED", "EXPIRED"].includes(recipient.envelope.status)) {
    throw jsonError(`This document is no longer available for signing (status: ${recipient.envelope.status.toLowerCase()}).`, 409);
  }
  if (recipient.role !== "SIGNER") throw jsonError("You receive a copy of this document. Only signers can sign it.", 409);
  return recipient;
}

function wakeWebhooks() {
  // The durable rows, not this best-effort wake-up, guarantee eventual work.
  void retryFailedDeliveries(20).catch((error) => console.warn("[sign] webhook wake-up failed", error));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length > 256) return jsonError("This signing link is not valid. Check the link in your invitation email.", 404);
    const input: unknown = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) return jsonError("Invalid signing request", 400);
    const body = input as Record<string, unknown>;
    const op = body.op;
    if (!["view", "sign", "decline"].includes(String(op))) return jsonError("Unknown operation", 400);
    const actionAt = new Date();

    if (op === "view") {
      const status = await serializableTransaction(async (tx) => {
        const recipient = await loadRecipient(tx, token);
        const envelope = recipient.envelope;
        if (recipient.status !== "PENDING") return recipient.status;
        if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) {
          throw jsonError("This document can no longer be viewed for signing.", 409);
        }
        await tx.recipient.update({ where: { id: recipient.id }, data: { status: "DELIVERED" } });
        await tx.envelopeEvent.create({ data: {
          envelopeId: envelope.id, actor: recipient.name, action: "VIEWED", at: actionAt,
          detail: "Signing link opened by the recipient",
        } });
        await queueEnvelopeEvent(tx, envelope.tenantId, "envelope.viewed", {
          code: envelope.publicCode, title: envelope.title, status: envelope.status,
          recipient: { name: recipient.name, email: recipient.email },
        });
        return "DELIVERED";
      });
      wakeWebhooks();
      return jsonOk({ ok: true, status });
    }

    if (op === "decline") {
      const reason = String(body.reason ?? "").trim().slice(0, 500) || "No reason provided";
      await serializableTransaction(async (tx) => {
        const recipient = await loadRecipient(tx, token);
        const envelope = recipient.envelope;
        if (recipient.status === "SIGNED") throw jsonError("You have already signed this document - it can no longer be declined.", 409);
        if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) throw jsonError("This document can no longer be declined.", 409);
        await tx.recipient.update({ where: { id: recipient.id }, data: { status: "DECLINED" } });
        await tx.envelope.update({ where: { id: envelope.id }, data: { status: "DECLINED" } });
        await tx.envelopeEvent.create({ data: {
          envelopeId: envelope.id, actor: recipient.name, action: "DECLINED", at: actionAt,
          detail: `Declined by ${recipient.name} <${recipient.email}>: ${reason}`,
        } });
        await queueEnvelopeEvent(tx, envelope.tenantId, "envelope.declined", {
          code: envelope.publicCode, title: envelope.title, status: "DECLINED",
          recipient: { name: recipient.name, email: recipient.email }, reason,
        });
      });
      wakeWebhooks();
      return jsonOk({ ok: true, status: "DECLINED", envelopeStatus: "DECLINED" });
    }

    const name = String(body.name ?? "").trim();
    if (name.length < 2 || name.length > 200) return jsonError("Please type your full name to sign (2 to 200 characters).");
    const font = SIGNATURE_FONTS.has(String(body.font)) ? String(body.font) : "caveat";
    const updated = await serializableTransaction(async (tx) => {
      const recipient = await loadRecipient(tx, token);
      const envelope = recipient.envelope;
      if (recipient.status === "SIGNED") throw jsonError("You have already signed this document.", 409);
      if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) throw jsonError("This document can no longer be signed.", 409);
      const signers = envelope.recipients.filter((item) => item.role === "SIGNER").sort((a, b) => a.order - b.order);
      const ahead = signers.find((item) => item.status === "PENDING" || item.status === "DELIVERED");
      if (ahead && ahead.id !== recipient.id) {
        throw jsonError(`${ahead.name} signs before you. You will be able to sign once they have completed.`, 409);
      }
      await tx.recipient.update({ where: { id: recipient.id }, data: { status: "SIGNED", signedAt: actionAt } });
      await tx.envelopeEvent.create({ data: {
        envelopeId: envelope.id, actor: recipient.name, action: "SIGNED", at: actionAt,
        detail: `Signed by ${name} <${recipient.email}> via signing link (${font} signature)`,
      } });
      const all = await tx.recipient.findMany({ where: { envelopeId: envelope.id, role: "SIGNER" } });
      const sealed = all.length > 0 && all.every((item) => item.status === "SIGNED");
      const signerCount = all.filter((item) => item.status === "SIGNED").length;
      let saved;
      if (sealed) {
        const events = await tx.envelopeEvent.findMany({ where: { envelopeId: envelope.id } });
        const digest = computeEnvelopeDigest({
          id: envelope.id, publicCode: envelope.publicCode, title: envelope.title, pages: envelope.pages,
          createdAt: envelope.createdAt, documentSha256: envelope.sha256, recipients: all, events,
        });
        const senderDomain = envelope.createdBy.email.split("@")[1]?.toLowerCase();
        const verifiedDomain = senderDomain ? await tx.domain.findFirst({
          where: { tenantId: envelope.tenantId, domain: senderDomain, purpose: "SENDING", status: "VERIFIED" },
          select: { domain: true },
        }) : null;
        saved = await tx.envelope.update({ where: { id: envelope.id }, data: {
          status: "COMPLETED", completedAt: actionAt, sealedAt: actionAt, sha256: digest,
          conformanceLevel: envelope.conformanceLevel ?? "B-T", verifiedSenderDomain: verifiedDomain?.domain ?? null,
        } });
        await tx.envelopeEvent.create({ data: {
          envelopeId: envelope.id, actor: "Docurama", action: "SEALED", at: actionAt,
          detail: `All signers completed. Envelope sealed (SHA-256 ${digest.slice(0, 12)}...), verification code ${envelope.publicCode}`,
        } });
      } else {
        saved = await tx.envelope.update({ where: { id: envelope.id }, data: { status: "PARTIALLY_SIGNED" } });
      }
      await queueEnvelopeEvent(tx, envelope.tenantId, "envelope.signed", {
        code: envelope.publicCode, title: envelope.title, status: saved.status,
        recipient: { name: recipient.name, email: recipient.email }, sealed,
      });
      if (sealed) await queueEnvelopeEvent(tx, envelope.tenantId, "envelope.completed", {
        code: envelope.publicCode, title: envelope.title, status: "COMPLETED", sha256: saved.sha256,
        sealedAt: actionAt.toISOString(), conformance: saved.conformanceLevel, signerCount,
      });
      return { envelope: saved, sealed, signerCount };
    });
    wakeWebhooks();

    if (updated.sealed) {
      // Existing transparency/attestation recovery remains independent of the
      // envelope transaction. Neither operation may run inside a retried callback.
      const envelope = updated.envelope;
      try {
        await appendSealCommitment({ tenantId: envelope.tenantId, envelopeId: envelope.id, commitment: {
          code: envelope.publicCode, sha256: envelope.sha256 ?? "", sealedAt: (envelope.sealedAt ?? actionAt).toISOString(),
          conformance: envelope.conformanceLevel ?? "B-T", pages: envelope.pages, signerCount: updated.signerCount,
        } });
      } catch (error) {
        console.warn("[sign] transparency append failed:", error);
      }
      const attest = await pushAttestationForEnvelope(envelope.id).catch(() => ({ pushed: false, note: "attestation push crashed" }));
      if (!attest.pushed && process.env.EVIDENCE_PORTAL_URL) console.warn(`[sign] attestation not pushed for ${envelope.publicCode}: ${attest.note}`);
    }
    return jsonOk({ ok: true, status: "SIGNED", envelopeStatus: updated.envelope.status,
      sealed: updated.sealed, code: updated.envelope.publicCode, signedAt: actionAt.toISOString() });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[sign POST]", error);
    return jsonError("Signing failed. Please try again.", 500);
  }
}
