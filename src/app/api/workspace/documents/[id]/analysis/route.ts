import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { documentPath } from "@/lib/document-store";
import { extractDocument } from "@/lib/docintel/text-extract";
import { detectFields } from "@/lib/docintel/field-detector";
import { analyzeContract } from "@/lib/docintel/contract-analyzer";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!me.tenantId) return jsonError("No workspace membership for this account", 403);

    const { id } = await ctx.params;
    const doc = await db.document.findFirst({
      where: { id, tenantId: me.tenantId },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!doc) return jsonError("Document not found", 404);

    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // Read stored PDF bytes from disk
    const filePath = documentPath(doc.id, doc.tenantId);
    let fileBytes: Buffer;
    try {
      fileBytes = await readFile(filePath);
    } catch {
      return jsonError("Document file missing from storage", 404);
    }

    // Extract structure and run detectors
    const extract = await extractDocument(new Uint8Array(fileBytes));
    const fullText = doc.extractedText || extract.text;
    const analysis = analyzeContract(fullText, doc.pageCount);
    const fields = await detectFields(extract, new Uint8Array(fileBytes));

    // Update document record with latest analysis timestamp and detected fields
    await db.document.update({
      where: { id: doc.id },
      data: {
        analyzedAt: new Date(),
        detectedFields: JSON.stringify(fields),
        extractedText: fullText ? fullText.slice(0, 50000) : null,
      },
    });

    return jsonOk({
      documentId: doc.id,
      filename: doc.filename,
      analysis,
      detectedFields: fields,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[document analysis GET]", err);
    return jsonError("Failed to analyze document", 500);
  }
}
