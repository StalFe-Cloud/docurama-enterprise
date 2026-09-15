/**
 * OCR for image-only pages.
 *
 * Language data is loaded from the repo's `tessdata/` directory and never from
 * a CDN. That is a product constraint, not a preference: a CDN fetch would send
 * a request off-platform during document processing, which contradicts the
 * EU-data-residency claim, and it breaks offline and air-gapped builds. It is
 * also simply faster - the local load measures around 0.3s against 2.1s for the
 * remote one.
 *
 * Work runs off the request path. `ocrStatus` moves PENDING -> DONE|FAILED and
 * the client polls the document route, so an upload of a forty-page scan
 * returns as fast as an upload of a one-page contract.
 */

import { readFile } from "fs/promises";
import { db } from "@/lib/db";
import { OCR_DPI, estimateSkew, preprocessForOcr, renderPage, tessdataPath } from "./text-extract";
import { LOW_CONFIDENCE_FLOOR, type OcrPageResult, type OcrWord } from "./types";

/** Tesseract word node, narrowed to the fields this module reads. */
interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Create a worker over the bundled traineddata.
 *
 * `gzip: false` because the files in `tessdata/` are stored uncompressed, and
 * `cacheMethod: "none"` because the on-disk cache tesseract.js writes is only
 * worth having when the data came over the network - here it would be a second
 * copy of a file we already ship.
 */
async function newWorker() {
  const { createWorker } = await import("tesseract.js");
  return createWorker(["fra", "eng"], 1, {
    langPath: tessdataPath(),
    gzip: false,
    cacheMethod: "none",
  });
}

/** Flatten tesseract's block/paragraph/line tree down to words. */
function collectWords(blocks: any[] | undefined): TesseractWord[] {
  const out: TesseractWord[] = [];
  for (const block of blocks ?? []) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        for (const word of line?.words ?? []) {
          if (word?.bbox && typeof word.text === "string") out.push(word as TesseractWord);
        }
      }
    }
  }
  return out;
}

/**
 * OCR one already-rasterised, already-preprocessed page.
 *
 * `scale` is the raster's pixels-per-point so word boxes come back in PDF
 * points: the field detector and the builder both work in page geometry, and a
 * box in raster pixels would be wrong at any other DPI.
 */
export async function ocrImage(
  png: Buffer,
  pageNumber: number,
  scale: number,
  worker?: Awaited<ReturnType<typeof newWorker>>,
): Promise<OcrPageResult> {
  const own = !worker;
  const w = worker ?? (await newWorker());
  try {
    const res = await w.recognize(png, {}, { blocks: true, text: true });
    const raw = collectWords((res.data as any).blocks);

    const words: OcrWord[] = raw.map((word) => ({
      text: word.text,
      x0: word.bbox.x0 / scale,
      y0: word.bbox.y0 / scale,
      x1: word.bbox.x1 / scale,
      y1: word.bbox.y1 / scale,
      confidence: word.confidence,
    }));

    // Per-word mean rather than tesseract's page confidence: a page that reads
    // one line perfectly and fails on the rest should not average out as good.
    const confidence = words.length
      ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
      : 0;

    return {
      pageNumber,
      text: res.data.text ?? "",
      words,
      confidence,
      lowConfidence: confidence < LOW_CONFIDENCE_FLOOR,
    };
  } finally {
    if (own) await w.terminate().catch(() => undefined);
  }
}

/** Render, preprocess and OCR a single page of a PDF held in memory. */
export async function ocrPdfPage(
  data: Uint8Array,
  pageNumber: number,
  worker?: Awaited<ReturnType<typeof newWorker>>,
): Promise<OcrPageResult> {
  const png = await renderPage(data, pageNumber, OCR_DPI);
  const skew = await estimateSkew(png).catch(() => 0);
  const prepared = await preprocessForOcr(png, skew);
  return ocrImage(prepared, pageNumber, OCR_DPI / 72, worker);
}

/**
 * In-flight jobs, so a client that polls hard (or a double-submitted upload)
 * cannot start the same expensive OCR twice. Process-local by design: this is a
 * concurrency guard, not a distributed lock, and a second server process doing
 * duplicate work would waste CPU but not corrupt anything.
 */
const inFlight = new Map<string, Promise<void>>();

/**
 * Start OCR for a document without awaiting it.
 *
 * Callers are request handlers, so the rejection is swallowed here: the failure
 * is already recorded on the row as ocrStatus FAILED, and an unhandled
 * rejection would take the server down for a bad scan.
 */
export function queueOcr(docId: string): void {
  if (inFlight.has(docId)) return;
  const job = runOcr(docId).finally(() => inFlight.delete(docId));
  inFlight.set(docId, job);
  void job.catch(() => undefined);
}

/** True while this process is OCR'ing the document. */
export function isOcrRunning(docId: string): boolean {
  return inFlight.has(docId);
}

/**
 * OCR every page of a document that has no text layer, then fold the results
 * back onto the Document and DocumentPage rows.
 *
 * One worker for the whole document: spinning one up costs ~0.3s, which is
 * worth paying once per document and not once per page.
 */
export async function runOcr(docId: string): Promise<void> {
  const doc = await db.document.findUnique({
    where: { id: docId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!doc) return;

  const targets = doc.pages.filter((page) => !page.hasText).map((page) => page.pageNumber);
  if (!targets.length) {
    await db.document.update({ where: { id: docId }, data: { ocrStatus: "NONE", analyzedAt: new Date() } });
    return;
  }

  await db.document.update({ where: { id: docId }, data: { ocrStatus: "PENDING", ocrError: null } });

  let worker: Awaited<ReturnType<typeof newWorker>> | undefined;
  try {
    const { resolveStorageKey } = await import("@/lib/document-store");
    const bytes = new Uint8Array(await readFile(resolveStorageKey(doc.storageKey)));
    worker = await newWorker();

    const results: OcrPageResult[] = [];
    for (const pageNumber of targets) {
      const result = await ocrPdfPage(bytes, pageNumber, worker);
      results.push(result);
      await db.documentPage.update({
        where: { documentId_pageNumber: { documentId: docId, pageNumber } },
        data: {
          ocrConfidence: result.confidence,
          charCount: result.text.replace(/\s+/g, "").length,
        },
      });
    }

    // Weighted by word count: a one-word page that read perfectly should not
    // pull the document's confidence up past a dense page that struggled.
    const totalWords = results.reduce((sum, r) => sum + r.words.length, 0);
    const meanConfidence = totalWords
      ? results.reduce((sum, r) => sum + r.confidence * r.words.length, 0) / totalWords
      : 0;

    // Interleave OCR output with the text layer in page order, so the analyzer
    // reads a mixed document the way a person would.
    const byPage = new Map(results.map((r) => [r.pageNumber, r.text]));
    const merged = doc.pages
      .map((page) => (page.hasText ? "" : byPage.get(page.pageNumber) ?? ""))
      .join("\n");
    const combined = [doc.extractedText ?? "", merged].filter(Boolean).join("\n");

    await db.document.update({
      where: { id: docId },
      data: {
        ocrStatus: "DONE",
        ocrConfidence: meanConfidence,
        ocrError: null,
        extractedText: combined,
        analyzedAt: new Date(),
      },
    });
  } catch (err) {
    // Store the reason, not the stack: the message reaches the UI and a stack
    // would leak absolute server paths.
    await db.document
      .update({
        where: { id: docId },
        data: {
          ocrStatus: "FAILED",
          ocrError: err instanceof Error ? err.message.slice(0, 500) : "OCR failed",
        },
      })
      .catch(() => undefined);
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
