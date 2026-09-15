import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { iso, isos, jsonError, jsonOk } from "@/lib/serializers";
import { storeUpload, UploadError, newDocId } from "@/lib/document-store";
import { extractDocument } from "@/lib/docintel/text-extract";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.tenantId) return jsonError("No workspace membership for this account", 403);

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(5, Number(url.searchParams.get("perPage") ?? 20)));

    const [total, rows] = await Promise.all([
      db.document.count({ where: { tenantId: me.tenantId } }),
      db.document.findMany({
        where: { tenantId: me.tenantId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          pages: { orderBy: { pageNumber: "asc" } },
          uploadedBy: { select: { firstName: true, lastName: true, email: true } },
          _count: { select: { envelopes: true } },
        },
      }),
    ]);

    return jsonOk({
      total,
      page,
      perPage,
      rows: rows.map((d) => ({
        ...iso(d),
        uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
        envelopeCount: d._count.envelopes,
        pages: isos(d.pages),
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workspace documents GET]", err);
    return jsonError("Failed to fetch documents", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.tenantId) return jsonError("No workspace membership for this account", 403);

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError("Expected multipart/form-data", 400);
    }

    const formData = await req.formData();
    const file = (formData.get("file") || formData.get("document")) as File | null;
    if (!file || typeof file === "string") {
      return jsonError("No file provided in 'file' or 'document' form field", 400);
    }

    const filename = (file.name || "document.pdf").trim();
    const docId = newDocId();

    // Stream the file chunks to disk through storeUpload
    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);

    async function* chunkGenerator() {
      const CHUNK_SIZE = 64 * 1024;
      for (let i = 0; i < fileBytes.length; i += CHUNK_SIZE) {
        yield fileBytes.subarray(i, i + CHUNK_SIZE);
      }
    }

    let stored;
    try {
      stored = await storeUpload(chunkGenerator(), me.tenantId, docId);
    } catch (err) {
      if (err instanceof UploadError) {
        const statusMap: Record<string, number> = {
          NOT_A_PDF: 400,
          TOO_LARGE: 413,
          EMPTY: 400,
          WRITE_FAILED: 500,
        };
        return jsonError(err.message, statusMap[err.reason] ?? 400);
      }
      throw err;
    }

    // Extract text and geometry using pdfjs
    let extractResult;
    try {
      extractResult = await extractDocument(fileBytes);
    } catch (extractErr) {
      console.warn("[document extraction warning]", extractErr);
      // Fallback if extraction fails on corrupt metadata
      extractResult = {
        pageCount: 1,
        pages: [{ pageNumber: 1, width: 595.28, height: 841.89, hasText: false, charCount: 0, text: "", items: [] }],
        hasTextLayer: false,
        imageOnlyPages: [1],
        text: "",
      };
    }

    const doc = await db.document.create({
      data: {
        id: stored.docId,
        tenantId: me.tenantId,
        uploadedById: me.id,
        filename,
        storageKey: stored.storageKey,
        byteSize: stored.byteSize,
        mimeType: "application/pdf",
        pageCount: extractResult.pageCount,
        sha256: stored.sha256,
        hasTextLayer: extractResult.hasTextLayer,
        extractedText: extractResult.text ? extractResult.text.slice(0, 50000) : null,
        pages: {
          create: extractResult.pages.map((p) => ({
            pageNumber: p.pageNumber,
            width: p.width,
            height: p.height,
            hasText: p.hasText,
            charCount: p.charCount,
          })),
        },
      },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
      },
    });

    return jsonOk({
      id: doc.id,
      filename: doc.filename,
      pageCount: doc.pageCount,
      byteSize: doc.byteSize,
      sha256: doc.sha256,
      hasTextLayer: doc.hasTextLayer,
      pages: isos(doc.pages),
      createdAt: doc.createdAt.toISOString(),
    }, 201);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workspace documents POST]", err);
    return jsonError("Upload processing failed", 500);
  }
}
