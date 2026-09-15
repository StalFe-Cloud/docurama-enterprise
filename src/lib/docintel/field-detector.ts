/**
 * Field detector for document intelligence.
 *
 * Discovers signature blocks, initials, date stamps and form inputs through
 * AcroForm inspection, embedded text-layer keyword matching (French + English),
 * and fallback heuristics for legacy or scanned contracts.
 */

import type { DetectedField, ExtractResult, FieldType, PageGeometry, TextItemBox } from "./types";

async function pdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

interface KeywordRule {
  type: FieldType;
  regex: RegExp;
  confidence: number;
  width: number;
  height: number;
  offsetY: number; // in pt below the keyword
}

const RULES: KeywordRule[] = [
  // French signature blocks
  {
    type: "signature",
    regex: /\b(bon\s+pour\s+accord|lu\s+et\s+approuv[eé]|sign[eé]\s+par|cachet\s+et\s+signature|le\s+soussign[eé]|pour\s+la\s+soci[eé]t[eé]|le\s+salari[eé]|le\s+prestataire|signature\s*:?)\b/i,
    confidence: 0.88,
    width: 160,
    height: 50,
    offsetY: 8,
  },
  // English signature blocks
  {
    type: "signature",
    regex: /\b(authorized\s+signature|agreed\s+and\s+accepted|signed\s+by|signature\s+of|by\s*:\s*$|signature\s*:?)\b/i,
    confidence: 0.85,
    width: 160,
    height: 50,
    offsetY: 8,
  },
  // French dates
  {
    type: "date",
    regex: /\b(fait\s+[aà].*le|date\s+de\s+signature|le\s*:\s*|date\s*:?)\b/i,
    confidence: 0.82,
    width: 110,
    height: 28,
    offsetY: 4,
  },
  // English dates
  {
    type: "date",
    regex: /\b(dated\s*:?|as\s+of\s+date|date\s*:)\b/i,
    confidence: 0.80,
    width: 110,
    height: 28,
    offsetY: 4,
  },
  // Initials / Paraphes
  {
    type: "initials",
    regex: /\b(paraphes?|initiales?|initial\s+here|initials)\b/i,
    confidence: 0.85,
    width: 70,
    height: 35,
    offsetY: 4,
  },
  // Text inputs
  {
    type: "text",
    regex: /\b(nom\s*:|pr[eé]nom\s*:|soci[eé]t[eé]\s*:|fonction\s*:|title\s*:|full\s+name\s*:)\b/i,
    confidence: 0.75,
    width: 140,
    height: 26,
    offsetY: 4,
  },
];

/**
 * Check if two detected fields overlap closely on the same page.
 */
function isOverlapping(a: DetectedField, b: DetectedField): boolean {
  if (a.pageNumber !== b.pageNumber) return false;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx < 6 && dy < 5;
}

/**
 * Extract fields from AcroForm interactive form fields if present.
 */
async function detectAcroFormFields(pdfBytes?: Uint8Array): Promise<DetectedField[]> {
  if (!pdfBytes || pdfBytes.length === 0) return [];
  const fields: DetectedField[] = [];

  try {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;

    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const annotations = await page.getAnnotations().catch(() => []);

        for (const annot of annotations as any[]) {
          if (annot.subtype === "Widget" && annot.rect && Array.isArray(annot.rect) && annot.rect.length === 4) {
            const [x0, y0, x1, y1] = annot.rect as number[];
            const width = Math.max(20, Math.abs(x1 - x0));
            const height = Math.max(15, Math.abs(y1 - y0));

            // Convert PDF user space (origin bottom-left) to top-left percentages
            const topY = viewport.height - Math.max(y0, y1);
            const xPercent = Math.max(0, Math.min(100, (Math.min(x0, x1) / viewport.width) * 100));
            const yPercent = Math.max(0, Math.min(100, (topY / viewport.height) * 100));

            let fieldType: FieldType = "text";
            const fieldName = String(annot.fieldName || annot.alternativeText || "field").toLowerCase();

            if (annot.fieldType === "Sig" || /sign|signature/i.test(fieldName)) {
              fieldType = "signature";
            } else if (annot.fieldType === "Btn") {
              fieldType = annot.checkBox ? "checkbox" : "radio";
            } else if (annot.fieldType === "Ch") {
              fieldType = "dropdown";
            } else if (/date/i.test(fieldName)) {
              fieldType = "date";
            } else if (/init|paraph/i.test(fieldName)) {
              fieldType = "initials";
            }

            fields.push({
              fieldType,
              pageNumber: n,
              x: Math.round(xPercent * 10) / 10,
              y: Math.round(yPercent * 10) / 10,
              width: Math.round(width),
              height: Math.round(height),
              name: annot.fieldName || `${fieldType}_p${n}`,
              confidence: 0.98,
              source: "acroform",
            });
          }
        }
        page.cleanup();
      }
    } finally {
      await (doc as any).destroy?.()?.catch?.(() => undefined);
    }
  } catch (err) {
    console.warn("[field detector acroform warning]", err);
  }

  return fields;
}

/**
 * Scan text items on a page for signature, date and input keywords.
 */
function scanPageKeywords(page: PageGeometry): DetectedField[] {
  const fields: DetectedField[] = [];
  if (!page.items || page.items.length === 0) return fields;

  for (const item of page.items) {
    for (const rule of RULES) {
      if (rule.regex.test(item.text)) {
        // Compute position in percentages from top-left
        const xPt = Math.max(0, item.x0);
        const yPt = Math.min(page.height - rule.height, item.y1 + rule.offsetY);

        const xPercent = Math.max(2, Math.min(85, (xPt / page.width) * 100));
        const yPercent = Math.max(2, Math.min(90, (yPt / page.height) * 100));

        const field: DetectedField = {
          fieldType: rule.type,
          pageNumber: page.pageNumber,
          x: Math.round(xPercent * 10) / 10,
          y: Math.round(yPercent * 10) / 10,
          width: rule.width,
          height: rule.height,
          name: `${rule.type}_p${page.pageNumber}_${fields.length + 1}`,
          confidence: rule.confidence,
          source: "keyword",
        };

        if (!fields.some((existing) => isOverlapping(existing, field))) {
          fields.push(field);
        }
        break; // Match one rule per text item
      }
    }
  }

  return fields;
}

/**
 * Run field detection across all pages of an extracted document.
 */
export async function detectFields(
  extract: ExtractResult,
  pdfBytes?: Uint8Array,
): Promise<DetectedField[]> {
  const results: DetectedField[] = [];

  // 1. Try AcroForm interactive form extraction first
  if (pdfBytes && pdfBytes.length > 0) {
    const acroFields = await detectAcroFormFields(pdfBytes);
    results.push(...acroFields);
  }

  // 2. Keyword detection on text items
  for (const page of extract.pages) {
    const pageFields = scanPageKeywords(page);
    for (const f of pageFields) {
      if (!results.some((existing) => isOverlapping(existing, f))) {
        results.push(f);
      }
    }
  }

  // 3. Fallback signature block on the last page if no signatures were found
  const hasSignature = results.some((f) => f.fieldType === "signature");
  if (!hasSignature && extract.pageCount > 0) {
    const lastPage = extract.pageCount;
    results.push(
      {
        fieldType: "date",
        pageNumber: lastPage,
        x: 60,
        y: 76,
        width: 110,
        height: 28,
        name: `date_p${lastPage}_fallback`,
        confidence: 0.5,
        source: "fallback",
      },
      {
        fieldType: "signature",
        pageNumber: lastPage,
        x: 60,
        y: 82,
        width: 160,
        height: 50,
        name: `signature_p${lastPage}_fallback`,
        confidence: 0.5,
        source: "fallback",
      },
    );
  }

  return results;
}
