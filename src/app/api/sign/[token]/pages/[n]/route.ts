import { readContractSnapshot, ContractSnapshotError } from "@/lib/contract-snapshot";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { signerReadRestriction } from "@/lib/signing-policy";
import { jsonError } from "@/lib/serializers";
import { readDocumentBytes } from "@/lib/document-store";
import { renderPage, clampDpi } from "@/lib/docintel/text-extract";
import { drawPreviewWatermark, watermarkFor } from "@/lib/preview-watermark";

/**
 * Signer document preview — the page renderer behind /sign/{token}.
 *
 * A signer must be able to see what they are signing before they consent —
 * a metadata card alone does not make an informed eIDAS signature. This route
 * reuses the workspace's pdfium render pipeline, but authenticates with the
 * recipient's 32-byte signing token instead of a session: no account, no
 * cookie, the link is the auth (same trust model as /api/sign/{token}).
 *
 *   GET /api/sign/{token}/pages/{n}?dpi=150 → image/png
 *
 * Access rules, mirroring /api/sign/{token}:
 *   - the token must resolve to a recipient of a SENT / PARTIALLY_SIGNED
 *     envelope (sealed, voided, declined, expired → 409)
 *   - CC recipients get 403 — they receive the completed copy, not a preview
 *   - the envelope must actually have a document attached (404 otherwise)
 *
 * Every recipient's first successful render lands one DOCUMENT_VIEWED event
 * in the envelope ledger (idempotent per recipient) — evidence that the
 * document was actually shown, not just that the link was opened.
 *
 * Each page is watermarked "Prepared for {name} <{email}>" with the envelope
 * code and render date (src/lib/preview-watermark.ts): a leaked screenshot,
 * print or forwarded copy of the preview is traceable to the exact recipient
 * it was prepared for. The workspace's own page renderer stays unwatermarked
 * — the owner reviews the pristine document, signers get personalised copies.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; n: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { token, n } = await ctx.params;
    if (!token || token.length > 256) return jsonError("This signing link is not valid.", 404);
    if (!/^[1-9][0-9]*$/.test(n)) return jsonError("Invalid page number", 400);
    const pageNumber = Number(n);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      return jsonError("Invalid page number", 400);
    }

    const recipient = await db.recipient.findUnique({
      where: { accessToken: token },
      include: { envelope: { include: { document: true, tenant: { select: { status: true } } } } },
    });
    if (!recipient) return jsonError("This signing link is not valid. Check the link in your invitation email.", 404);

    const env = recipient.envelope;
    if (env.document && env.document.tenantId !== env.tenantId) return jsonError("Invalid document workspace binding", 409);
    const restriction = signerReadRestriction(env.tenant);
    if (restriction) return jsonError(restriction, 409);
    if (env.status !== "SENT" && env.status !== "PARTIALLY_SIGNED") {
      return jsonError(`This document is not open for signing (status: ${env.status.toLowerCase()}).`, 409);
    }
    if (recipient.role === "CC") {
      return jsonError("You receive a copy of this document. The live preview is available to signers.", 403);
    }

    readContractSnapshot(env);
    const doc = env.document;
    if (!doc) return jsonError("This envelope has no attached document to preview.", 404);
    if (doc.pageCount < 1) return jsonError("This document has no renderable pages.", 404);
    if (pageNumber > doc.pageCount) {
      return jsonError(`Page ${pageNumber} out of range (1-${doc.pageCount}).`, 404);
    }

    const url = new URL(req.url);
    const dpi = clampDpi(Number(url.searchParams.get("dpi") ?? 150));

    let fileBytes: Buffer;
    try {
      fileBytes = await readDocumentBytes(doc.id, doc.tenantId);
    } catch (err) {
      console.error("[sign page render file read error]", err);
      return jsonError("Document file not found on storage", 404);
    }

    const png = await renderPage(new Uint8Array(fileBytes), pageNumber, dpi, (ctx, w, h) =>
      drawPreviewWatermark(ctx, w, h, watermarkFor({
        name: recipient.name,
        email: recipient.email,
        code: env.publicCode,
      })),
    );

    // Evidence: the document was actually shown to this signer before they
    // consented. Idempotent per recipient — the first successful page render
    // records it, later page flips do not grow the ledger. The event detail
    // carries the email, which is also the idempotency key. Never fatal: a
    // ledger hiccup must not blank the preview the signer is looking at.
    try {
      const seen = await db.envelopeEvent.findFirst({
        where: { envelopeId: env.id, action: "DOCUMENT_VIEWED", detail: { contains: recipient.email } },
        select: { id: true },
      });
      if (!seen) {
        await db.envelopeEvent.create({
          data: {
            envelopeId: env.id,
            actor: recipient.name,
            action: "DOCUMENT_VIEWED",
            detail: `Document preview shown to ${recipient.name} <${recipient.email}> (page ${pageNumber} of ${doc.pageCount})`,
          },
        });
      }
    } catch (err) {
      console.warn("[sign page render] DOCUMENT_VIEWED event not recorded:", err);
    }

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        // The token in the URL is per-recipient, so browser caches are
        // already scoped to one signer; private keeps intermediaries out.
        "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    if (err instanceof ContractSnapshotError) return jsonError(err.message, 409);
    console.error("[sign page render GET]", err);
    return jsonError("Failed to render page image", 500);
  }
}
