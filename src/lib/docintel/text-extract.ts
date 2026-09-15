/**
 * Per-page text extraction and page rasterisation.
 *
 * The design decision that matters: classification is PER PAGE, not per
 * document. Real contracts arrive as a born-digital body with a scanned,
 * signed last page. An all-or-nothing "does this PDF have text" test sends the
 * whole file to OCR (slow, and it degrades text we already had perfectly) or
 * skips OCR entirely and loses the signature page. Only the pages that need it
 * are rasterised.
 */

import path from "path";
import type { ExtractResult, PageGeometry, TextItemBox } from "./types";

/**
 * pdfjs must be the legacy build under Node. The default entry assumes a
 * browser (DOM, workers, fetch) and throws on import.
 */
async function pdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

/**
 * A page counts as carrying a text layer when it has real characters on it.
 *
 * Two gates rather than one because they catch different lies. The character
 * floor rejects a scanner's junk text layer (a page-number stamp, an OCR
 * watermark) that would otherwise pass as content. The density gate rejects a
 * large page whose few characters are a header, where the body is an image.
 * Both are deliberately low: the question is "is there anything here", and a
 * genuinely sparse page (a signature page with two printed lines) should be
 * read, not re-OCR'd.
 */
const MIN_PAGE_CHARS = 16;
const MIN_CHAR_DENSITY = 0.15; // characters per square inch

/** Raster DPI for OCR. 300 is the floor tesseract needs for reliable 10pt text. */
export const OCR_DPI = 300;

/** Bound the render cost; DPI is caller-supplied on the page-image route. */
export const MIN_RENDER_DPI = 72;
export const MAX_RENDER_DPI = 300;

export function clampDpi(value: number): number {
  if (!Number.isFinite(value)) return 150;
  return Math.max(MIN_RENDER_DPI, Math.min(MAX_RENDER_DPI, Math.round(value)));
}

/**
 * Convert a text item's transform matrix into a top-left-origin box.
 *
 * PDF user space has its origin at the bottom-left and the field detector,
 * the builder and the page renderer all work top-left, matching the reference
 * app's PyMuPDF rects. Doing the flip once, here, keeps the inversion out of
 * every consumer.
 */
function itemBox(transform: number[], width: number, height: number, pageHeight: number): Omit<TextItemBox, "text"> {
  const x0 = transform[4];
  const yBaseline = transform[5];
  return {
    x0,
    y0: pageHeight - yBaseline - height,
    x1: x0 + width,
    y1: pageHeight - yBaseline,
  };
}

/** Read geometry and the text layer for every page of a PDF. */
export async function extractDocument(data: Uint8Array): Promise<ExtractResult> {
  const lib = await pdfjs();
  // A copy, because pdfjs transfers the buffer to its worker and leaves the
  // caller's view detached - which breaks the hashing and storage paths that
  // legitimately hold the same bytes.
  const doc = await lib.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;

  const pages: PageGeometry[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items: TextItemBox[] = [];
      let text = "";
      for (const raw of content.items as any[]) {
        if (typeof raw?.str !== "string") continue;
        if (raw.str.length) {
          items.push({
            text: raw.str,
            ...itemBox(raw.transform as number[], raw.width ?? 0, raw.height ?? 0, viewport.height),
          });
        }
        text += raw.str;
        if (raw.hasEOL) text += "\n";
        else text += " ";
      }

      const charCount = text.replace(/\s+/g, "").length;
      const areaSqIn = (viewport.width / 72) * (viewport.height / 72);
      const density = areaSqIn > 0 ? charCount / areaSqIn : 0;
      const hasText = charCount >= MIN_PAGE_CHARS && density >= MIN_CHAR_DENSITY;

      pages.push({
        pageNumber: n,
        width: viewport.width,
        height: viewport.height,
        hasText,
        charCount,
        text,
        items: hasText ? items : [],
      });
      page.cleanup();
    }
  } finally {
    await (doc as any).destroy?.()?.catch?.(() => undefined);
  }

  return {
    pageCount: pages.length,
    pages,
    hasTextLayer: pages.some((p) => p.hasText),
    imageOnlyPages: pages.filter((p) => !p.hasText).map((p) => p.pageNumber),
    text: pages.map((p) => p.text).join("\n"),
  };
}

/**
 * Render one page to a PNG.
 *
 * @napi-rs/canvas rather than node-canvas: no native build step on Windows,
 * which is where this is developed.
 */
export async function renderPage(data: Uint8Array, pageNumber: number, dpi: number): Promise<Buffer> {
  const [lib, canvasLib] = await Promise.all([pdfjs(), import("@napi-rs/canvas")]);
  const doc = await lib.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;

  try {
    if (pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(`Page ${pageNumber} is outside this document (1-${doc.numPages}).`);
    }
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = canvasLib.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext("2d");

    // White ground first. A PDF page is paper; an unpainted canvas is
    // transparent, and transparent pixels binarise to black under the OCR
    // preprocessing chain, which destroys the page.
    canvasContext.fillStyle = "#ffffff";
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    // This pdfjs version wants `canvas` alongside `canvasContext`.
    await page.render({ canvasContext: canvasContext as any, viewport, canvas: canvas as any } as any).promise;
    page.cleanup();
    return canvas.toBuffer("image/png");
  } finally {
    await (doc as any).destroy?.()?.catch?.(() => undefined);
  }
}

/**
 * Binarisation chain for OCR input.
 *
 * Most of the accuracy gain comes from here rather than from tesseract
 * settings: greyscale drops colour noise, normalise stretches a washed-out
 * scan back to full range, sharpen recovers edges the rasteriser softened, and
 * the threshold gives tesseract the clean bi-level page its training data
 * looks like. The threshold value is the one part worth tuning per corpus.
 */
export const OCR_THRESHOLD = 160;

export async function preprocessForOcr(png: Buffer, deskewDegrees = 0): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  let pipeline = sharp(png).grayscale().normalize().sharpen();
  if (Math.abs(deskewDegrees) >= 0.25) {
    // Rotate on the greyscale image, before thresholding, so the interpolated
    // edge pixels get binarised rather than being smeared across black and white.
    pipeline = pipeline.rotate(deskewDegrees, { background: "#ffffff" });
  }
  return pipeline.threshold(OCR_THRESHOLD).png().toBuffer();
}

/**
 * Estimate page skew in degrees by maximising the variance of the horizontal
 * ink profile.
 *
 * A straight page of text has sharp peaks (lines) and deep troughs (leading);
 * skew smears them together. Rather than rotating the image once per candidate
 * angle, the row index is sheared per column, which is the same projection at a
 * fraction of the cost. Runs on a downscaled copy because skew is a
 * page-level property and does not need full resolution.
 */
export async function estimateSkew(png: Buffer): Promise<number> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(png)
    .grayscale()
    .resize({ width: 500, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  if (width < 32 || height < 32) return 0;

  let best = 0;
  let bestScore = -1;
  for (let deg = -4; deg <= 4; deg += 0.5) {
    const slope = Math.tan((deg * Math.PI) / 180);
    const rows = new Float64Array(height);
    for (let x = 0; x < width; x++) {
      const shift = Math.round((x - width / 2) * slope);
      for (let y = 0; y < height; y++) {
        const sy = y + shift;
        if (sy < 0 || sy >= height) continue;
        // Ink is dark, so invert: a black pixel contributes the most.
        rows[y] += 255 - data[sy * width + x];
      }
    }
    let mean = 0;
    for (let y = 0; y < height; y++) mean += rows[y];
    mean /= height;
    let variance = 0;
    for (let y = 0; y < height; y++) variance += (rows[y] - mean) ** 2;
    if (variance > bestScore) {
      bestScore = variance;
      best = deg;
    }
  }
  // Report the correction, not the measured tilt.
  return -best;
}

/** Absolute path to the bundled language data. Never a CDN - see ocr.ts. */
export function tessdataPath(): string {
  return path.resolve(process.env.TESSDATA_DIR || "./tessdata");
}
