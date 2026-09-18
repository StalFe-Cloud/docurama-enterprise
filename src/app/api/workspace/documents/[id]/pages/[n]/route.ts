import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/serializers";
import { readDocumentBytes } from "@/lib/document-store";
import { renderPage, clampDpi } from "@/lib/docintel/text-extract";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; n: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!me.tenantId) return jsonError("No workspace membership for this account", 403);

    const { id, n } = await ctx.params;
    const pageNumber = parseInt(n, 10);
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      return jsonError("Invalid page number", 400);
    }

    const doc = await db.document.findFirst({
      where: { id, tenantId: me.tenantId },
    });
    if (!doc) return jsonError("Document not found", 404);

    if (pageNumber > doc.pageCount) {
      return jsonError(`Page ${pageNumber} out of range (1-${doc.pageCount})`, 404);
    }

    const url = new URL(req.url);
    const dpi = clampDpi(Number(url.searchParams.get("dpi") ?? 150));

    let fileBytes: Buffer;
    try {
      fileBytes = await readDocumentBytes(doc.id, doc.tenantId);
    } catch (err) {
      console.error("[page render file read error]", err);
      return jsonError("Document file not found on storage", 404);
    }

    const png = await renderPage(new Uint8Array(fileBytes), pageNumber, dpi);

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[page render GET]", err);
    return jsonError("Failed to render page image", 500);
  }
}
