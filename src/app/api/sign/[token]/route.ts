import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/serializers";
import { computeEnvelopeDigest } from "@/lib/esign";
import { pushAttestationForEnvelope } from "@/lib/attestation";
import { appendSealCommitment } from "@/lib/transparency";
import { dispatchEnvelopeEvent } from "@/lib/webhooks";

/**
 * Public signing endpoint — the engine behind /sign/{token}.
 *
 * The 32-byte base64url accessToken in the link IS the authentication: it is
 * unguessable, unique per recipient, and never shared between signers. No
 * session, no account — a recipient opens the link from their invitation and
 * signs. Every state change lands in the envelope event ledger.
 *
 *   POST /api/sign/{token}  { op: "view" | "sign" | "decline", ... }
 *
 *   view    first open of the link: PENDING → DELIVERED + VIEWED event
 *   sign    { name, font, consent } → recipient SIGNED; when every SIGNER
 *           has signed, the envelope is sealed (COMPLETED, sha256, B-T)
 *   decline { reason } → recipient DECLINED + envelope DECLINED
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const SIGNATURE_FONTS = new Set(["caveat", "dancing-script", "great-vibes"]);

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      op?: string;
      name?: string;
      font?: string;
      reason?: string;
    };
    const op = body.op ?? "";

    const recipient = await db.recipient.findUnique({
      where: { accessToken: token },
      include: {
        envelope: {
          include: {
            recipients: true,
            events: true,
            tenant: { select: { name: true } },
            createdBy: { select: { email: true } },
          },
        },
      },
    });
    if (!recipient) return jsonError("This signing link is not valid. Check the link in your invitation email.", 404);
    const env = recipient.envelope;

    // Terminal states apply to everyone on the envelope.
    if (["VOIDED", "DECLINED", "EXPIRED"].includes(env.status)) {
      return jsonError(`This document is no longer available for signing (status: ${env.status.toLowerCase()}).`, 409);
    }
    if (recipient.role === "CC") {
      return jsonError("You receive a copy of this document. Only signers can sign it.", 409);
    }

    /* ── view ────────────────────────────────────────────────────────────── */
    if (op === "view") {
      if (recipient.status === "PENDING") {
        await db.$transaction([
          db.recipient.update({ where: { id: recipient.id }, data: { status: "DELIVERED" } }),
          db.envelopeEvent.create({
            data: {
              envelopeId: env.id, actor: recipient.name, action: "VIEWED",
              detail: "Signing link opened by the recipient",
            },
          }),
        ]);
        void dispatchEnvelopeEvent(env.tenantId, "envelope.viewed", {
          code: env.publicCode, title: env.title, status: env.status,
          recipient: { name: recipient.name, email: recipient.email },
        }).catch(() => undefined);
      }
      return jsonOk({ ok: true, status: "DELIVERED" });
    }

    /* ── sign ────────────────────────────────────────────────────────────── */
    if (op === "sign") {
      if (recipient.status === "SIGNED") return jsonError("You have already signed this document.", 409);
      if (env.status !== "SENT" && env.status !== "PARTIALLY_SIGNED") {
        return jsonError("This document can no longer be signed.", 409);
      }
      const name = String(body.name ?? "").trim();
      if (name.length < 2) return jsonError("Please type your full name to sign.");
      const font = SIGNATURE_FONTS.has(String(body.font)) ? String(body.font) : "caveat";
      const signedAt = new Date();

      // Signing order: only the current recipient in line may sign.
      const signers = env.recipients.filter((r) => r.role === "SIGNER").sort((a, b) => a.order - b.order);
      const ahead = signers.find((r) => r.status === "PENDING" || r.status === "DELIVERED");
      if (ahead && ahead.id !== recipient.id) {
        return jsonError(`${ahead.name} signs before you. You will be able to sign once they have completed.`, 409);
      }

      const updated = await db.$transaction(async (tx) => {
        await tx.recipient.update({
          where: { id: recipient.id },
          data: { status: "SIGNED", signedAt },
        });
        await tx.envelopeEvent.create({
          data: {
            envelopeId: env.id, actor: recipient.name, action: "SIGNED",
            detail: `Signed by ${name} <${recipient.email}> via signing link (${font} signature)`,
          },
        });

        const all = await tx.recipient.findMany({ where: { envelopeId: env.id, role: "SIGNER" } });
        const remaining = all.filter((r) => r.status !== "SIGNED");
        if (remaining.length > 0) {
          const env2 = await tx.envelope.update({
            where: { id: env.id }, data: { status: "PARTIALLY_SIGNED" },
          });
          return { envelope: env2, sealed: false };
        }

        // Every signer has signed — seal the envelope.
        const events = await tx.envelopeEvent.findMany({ where: { envelopeId: env.id } });
        const digest = computeEnvelopeDigest({
          id: env.id, publicCode: env.publicCode, title: env.title, pages: env.pages,
          createdAt: env.createdAt, documentSha256: env.sha256,
          recipients: all, events,
        });
        // Sender-domain proof: if the sender's email domain is DNS-TXT-verified
        // for this tenant, the seal carries it (evidence packs + verify portal
        // cite it as the sender-authenticity chain).
        const senderDomain = env.createdBy?.email?.split("@")?.[1]?.toLowerCase() ?? null;
        const verifiedDomain = senderDomain
          ? await tx.domain.findFirst({
              where: { tenantId: env.tenantId, domain: senderDomain, purpose: "SENDING", status: "VERIFIED" },
              select: { domain: true },
            })
          : null;
        const sealedEnv = await tx.envelope.update({
          where: { id: env.id },
          data: {
            status: "COMPLETED", completedAt: signedAt, sealedAt: signedAt,
            sha256: digest, conformanceLevel: env.conformanceLevel ?? "B-T",
            verifiedSenderDomain: verifiedDomain?.domain ?? null,
          },
        });
        await tx.envelopeEvent.create({
          data: {
            envelopeId: env.id, actor: "Docurama", action: "SEALED",
            detail: `All signers completed. Envelope sealed (SHA-256 ${digest.slice(0, 12)}…), verification code ${env.publicCode}`,
          },
        });
        return { envelope: sealedEnv, sealed: true, signerCount: all.filter((r) => r.status === "SIGNED").length };
      });

      if (updated.sealed) {
        // Transparency registry: append the seal commitment to the tenant's
        // append-only hash chain, AFTER the seal transaction commits (the
        // chain writes on its own connection — inside the transaction it
        // would deadlock on SQLite's write lock). Idempotent (the attestation
        // builder re-appends lazily with the same commitment), non-fatal by
        // design — the log never blocks a seal.
        try {
          await appendSealCommitment({
            tenantId: env.tenantId,
            envelopeId: env.id,
            commitment: {
              code: env.publicCode,
              sha256: updated.envelope.sha256 ?? "",
              sealedAt: (updated.envelope.sealedAt ?? signedAt).toISOString(),
              conformance: updated.envelope.conformanceLevel ?? env.conformanceLevel ?? "B-T",
              pages: env.pages,
              signerCount: updated.signerCount ?? 0,
            },
          });
        } catch (err) {
          console.warn("[sign] transparency append failed:", err);
        }

        // Federation: if this instance is configured to publish fingerprints to
        // a public verification portal (self-hosted setups), push the minimal
        // attestation now. Non-fatal by design — a portal outage never blocks
        // the signer's success screen, and only a successful push is recorded.
        const attest = await pushAttestationForEnvelope(env.id).catch(() => ({ pushed: false, note: "attestation push crashed" }));
        if (!attest.pushed && process.env.EVIDENCE_PORTAL_URL) {
          console.warn(`[sign] attestation not pushed for ${env.publicCode}: ${attest.note}`);
        }
      }

      // Lifecycle webhooks, post-commit and non-fatal by the same policy as
      // the transparency append: a customer endpoint can never break signing.
      void dispatchEnvelopeEvent(env.tenantId, "envelope.signed", {
        code: env.publicCode, title: env.title,
        status: updated.envelope.status,
        recipient: { name: recipient.name, email: recipient.email },
        sealed: updated.sealed,
      }).catch(() => undefined);
      if (updated.sealed) {
        void dispatchEnvelopeEvent(env.tenantId, "envelope.completed", {
          code: env.publicCode, title: env.title, status: "COMPLETED",
          sha256: updated.envelope.sha256,
          sealedAt: (updated.envelope.sealedAt ?? signedAt).toISOString(),
          conformance: updated.envelope.conformanceLevel,
          signerCount: updated.signerCount,
        }).catch(() => undefined);
      }

      return jsonOk({
        ok: true,
        status: "SIGNED",
        envelopeStatus: updated.envelope.status,
        sealed: updated.sealed,
        code: env.publicCode,
        signedAt: signedAt.toISOString(),
      });
    }

    /* ── decline ─────────────────────────────────────────────────────────── */
    if (op === "decline") {
      if (recipient.status === "SIGNED") return jsonError("You have already signed this document - it can no longer be declined.", 409);
      if (env.status !== "SENT" && env.status !== "PARTIALLY_SIGNED") {
        return jsonError("This document can no longer be declined.", 409);
      }
      const reason = String(body.reason ?? "").trim().slice(0, 500) || "No reason provided";
      await db.$transaction([
        db.recipient.update({ where: { id: recipient.id }, data: { status: "DECLINED" } }),
        db.envelope.update({ where: { id: env.id }, data: { status: "DECLINED" } }),
        db.envelopeEvent.create({
          data: {
            envelopeId: env.id, actor: recipient.name, action: "DECLINED",
            detail: `Declined by ${recipient.name} <${recipient.email}>: ${reason}`,
          },
        }),
      ]);
      void dispatchEnvelopeEvent(env.tenantId, "envelope.declined", {
        code: env.publicCode, title: env.title, status: "DECLINED",
        recipient: { name: recipient.name, email: recipient.email }, reason,
      }).catch(() => undefined);
      return jsonOk({ ok: true, status: "DECLINED", envelopeStatus: "DECLINED" });
    }

    return jsonError("Unknown operation", 400);
  } catch (err) {
    console.error("[sign POST]", err);
    return jsonError("Signing failed. Please try again.", 500);
  }
}
