/**
 * Shared shapes for the document-intelligence pipeline.
 *
 * Kept in one module so the detector, the analyzer, the extractor and the API
 * routes agree on geometry without importing each other. The percentage-based
 * coordinate convention is the load-bearing decision here: the builder places
 * fields on a rendered page whose pixel size depends on the DPI the client
 * asked for, so absolute PDF points would be wrong at every zoom level.
 */

/** Field kinds the signing builder knows how to place. */
export type FieldType = "signature" | "initials" | "checkbox" | "radio" | "dropdown" | "date" | "text";

/** Which language's clause vocabulary a document was read with. */
export type Locale = "fr" | "en" | "mixed";

/**
 * A field placement. `x`/`y` are percentages of page width/height measured from
 * the TOP-LEFT corner; `width`/`height` stay in PDF points because they are a
 * size hint for the widget, not a position on the page.
 */
export interface DetectedField {
  fieldType: FieldType;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  confidence: number;
  /**
   * How this placement was arrived at. `fallback` means the document could not
   * be inspected and the entry is a suggestion, not a reading of the file.
   */
  source: "acroform" | "keyword" | "ocr-keyword" | "fallback";
}

/** One OCR word with its box in PDF points, top-left origin. */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

/** OCR result for a single page. */
export interface OcrPageResult {
  pageNumber: number;
  text: string;
  words: OcrWord[];
  /** Mean per-word confidence, 0-100. */
  confidence: number;
  /** True when confidence fell under LOW_CONFIDENCE_FLOOR and the UI must say so. */
  lowConfidence: boolean;
}

/**
 * Below this mean per-word confidence the read is reported as unreliable rather
 * than presented as the document's text. A bad scan that silently becomes a
 * confident-looking transcript is worse than an honest "we could not read this".
 */
export const LOW_CONFIDENCE_FLOOR = 75;

/** Per-page classification produced before any OCR runs. */
export interface PageGeometry {
  pageNumber: number;
  width: number;
  height: number;
  /** True when the embedded text layer carries real content for this page. */
  hasText: boolean;
  charCount: number;
  text: string;
  /** Text-layer items with top-left-origin boxes, empty for image-only pages. */
  items: TextItemBox[];
}

/** A text-layer run with its box converted to top-left origin, in PDF points. */
export interface TextItemBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Whole-document extraction result. */
export interface ExtractResult {
  pageCount: number;
  pages: PageGeometry[];
  /** True when ANY page had a usable text layer. */
  hasTextLayer: boolean;
  /** Page numbers that carry no text layer and therefore need OCR. */
  imageOnlyPages: number[];
  /** Concatenated text layer across pages. */
  text: string;
}

/** A risk the analyzer found, or the notable absence of a clause. */
export interface RiskFlag {
  category: string;
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
}

/** Contract-analyzer report. Shape is the reference app's, plus `locale`. */
export interface ContractAnalysis {
  is_analyzed: boolean;
  locale: Locale;
  document_type: string;
  page_count: number;
  word_count: number;
  estimated_read_minutes: number;
  overall_risk_assessment: string;
  risk_badge: "amber" | "blue" | "emerald";
  key_commercial_terms: {
    governing_law: string;
    termination_notice: string;
    payment_terms: string;
    dispute_resolution: string;
  };
  risk_flags: RiskFlag[];
  error?: string;
}
