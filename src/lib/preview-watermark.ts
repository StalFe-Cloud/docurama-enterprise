/**
 * Per-recipient watermark for the signer document preview.
 *
 * Every page the signer portal renders is personalised: a light diagonal
 * band carries "Prepared for {name} <{email}>" plus the envelope code and
 * the render date. This closes a chain-of-custody gap that a plain render
 * leaves open — a screenshot, print or forwarded copy of the preview is
 * traceable to the exact recipient it was prepared for, and pairs with the
 * DOCUMENT_VIEWED ledger event as evidence that *this* person was shown
 * *this* document. It is the same posture as the major signature platforms.
 *
 * Drawing rules, in order of importance:
 *   1. Never obscure content — ink coverage stays in the low single-digit
 *      percent of the page at ~12% alpha, gray-on-white by design.
 *   2. Never break the preview — a watermark failure must degrade to an
 *      unwatermarked image, never to a failed render (renderPage guards).
 *   3. Deterministic layout — same inputs, same pixels (no timestamps
 *      beyond the caller-supplied date, no randomness).
 */

import { GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

export type PreviewWatermark = {
  /** Primary line — who this render was prepared for. */
  forLine: string;
  /** Secondary line — envelope code, render date, short notice. */
  metaLine: string;
};

/** Build the watermark text for a signer's render of an envelope page. */
export function watermarkFor(opts: {
  name: string;
  email: string;
  code: string;
  date?: Date;
}): PreviewWatermark {
  const day = (opts.date ?? new Date()).toISOString().slice(0, 10);
  return {
    forLine: `Prepared for ${opts.name} <${opts.email}>`,
    metaLine: `${opts.code} · ${day} · preview copy`,
  };
}

/** Ink colour (slate-900) and opacity — faint but legible on any paper. */
const INK = "#0f172a";
const ALPHA = 0.12;

/**
 * Resolve a font family that actually rasterises.
 *
 * Reason this exists (found by the E2E suite, not by theory): when the CSS
 * generic "sans-serif" does not resolve to a real face — a bare fontconfig
 * install, a stripped container, an odd default — @napi-rs/canvas silently
 * no-ops fillText while measureText still returns numbers, so a naive
 * implementation ships a watermark that renders as nothing (or, worse, as
 * the digits-only fragment of whatever emoji face fontconfig picked). We
 * therefore probe known-good families and cache the first one fontconfig
 * actually has; "sans-serif" stays as the final fallback because it IS the
 * right answer on a properly configured system.
 */
const FAMILY_CANDIDATES = [
  "DejaVu Sans", // Debian/Ubuntu default, incl. the production image
  "Liberation Sans", // common on minimal Linux images
  "Arial", // macOS / Windows dev machines
  "Helvetica",
  "FreeSans",
  "Noto Sans",
];

let cachedFamily: string | null = null;
function watermarkFamily(): string {
  if (!cachedFamily) {
    cachedFamily = FAMILY_CANDIDATES.find((f) => {
      try {
        return GlobalFonts.has(f);
      } catch {
        return false;
      }
    }) ?? "sans-serif";
  }
  return cachedFamily;
}

/** Font size for the primary line, as a fraction of page height. */
const BASE_FRACTION = 1 / 34;
const MIN_FONT = 12;
const MAX_FONT = 96;

/** How much of the page diagonal a text line may span. */
const MAX_SPAN = 0.84;

/** Vertical offset of the three tiles from the page centre (fractions of height). */
const TILE_OFFSETS = [-0.36, 0, 0.36];

function fitFont(
  ctx: SKRSContext2D,
  text: string,
  size: number,
  maxWidth: number,
  bold: boolean,
): number {
  const set = (s: number) => {
    ctx.font = `${bold ? "bold " : ""}${s}px ${watermarkFamily()}`;
  };
  set(size);
  const width = ctx.measureText(text).width;
  if (width > maxWidth && width > 0) {
    size = Math.max(MIN_FONT, Math.floor(size * (maxWidth / width)));
    set(size);
  }
  return size;
}

/**
 * Draw the watermark onto a rendered page. Mutates nothing but the canvas.
 * Callers wrap this in try/catch (see renderPage) so a font hiccup can never
 * blank a preview.
 */
export function drawPreviewWatermark(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  wm: PreviewWatermark,
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 8 || height < 8) return;

  const diagonal = Math.hypot(width, height);
  const maxWidth = diagonal * MAX_SPAN;
  const base = Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(height * BASE_FRACTION)));

  // Size both lines first (fitFont leaves ctx.font set to the fitted size,
  // so re-set explicitly before each fillText below).
  const s1 = fitFont(ctx, wm.forLine, base, maxWidth, true);
  const s2 = fitFont(ctx, wm.metaLine, Math.max(MIN_FONT, Math.round(base * 0.72)), maxWidth, false);

  ctx.save();
  try {
    ctx.translate(width / 2, height / 2);
    // Gentle diagonal that adapts to orientation: steeper on portrait pages,
    // shallower on landscape ones.
    ctx.rotate(-Math.atan2(height * 0.55, width));
    ctx.globalAlpha = ALPHA;
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const dyFrac of TILE_OFFSETS) {
      const dy = dyFrac * height;
      ctx.font = `bold ${s1}px ${watermarkFamily()}`;
      ctx.fillText(wm.forLine, 0, dy - s1 * 0.62);
      ctx.font = `${s2}px ${watermarkFamily()}`;
      ctx.fillText(wm.metaLine, 0, dy + s2 * 0.9);
    }
  } finally {
    ctx.restore();
  }
}
