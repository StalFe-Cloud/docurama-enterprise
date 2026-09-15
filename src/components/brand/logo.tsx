import { cn } from "@/lib/utils";

/**
 * Official Docurama brand assets - rebuilt from the 2026 brand board.
 *
 * Brand mark: a signed document inside a rounded-square ink border -
 * three text lines, a purple dog-ear fold and the emerald signature
 * stroke that sweeps across the lower half.
 *
 * Palette: ink #1A1A1A · emerald #0F7A5A · mint #4FD1A1 (dark-mode accent)
 *          dog-ear purple #6B66A3 · line grey #D1D1D1
 * Wordmark: "Docurama" - "Docu" in ink/foreground, "rama" in emerald/mint.
 * Tagline:  "SIGN • SEAL • VERIFY"
 */

export const BRAND_LEGAL_NAME = "Docurama SAS";
export const BRAND_ADDRESS = "1 Rue Marguerin, 75014 Paris, France";
export const BRAND_LEGAL_LINE = `${BRAND_LEGAL_NAME} - ${BRAND_ADDRESS}`;

/** Icon-only brand mark. Adapts to light/dark via CSS custom properties. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-9 w-9", className)}
      role="img"
      aria-label="Docurama"
    >
      <rect
        x="3.5" y="3.5" width="57" height="57" rx="13"
        fill="var(--brand-doc, #ffffff)"
        stroke="var(--brand-ink, #1a1a1a)"
        strokeWidth="7"
      />
      <path d="M43 7.5 L54.5 19 L43 19 Z" fill="#6B66A3" />
      <g fill="var(--brand-line, #d1d1d1)">
        <rect x="12" y="15.5" width="24" height="4.6" rx="2.3" />
        <rect x="12" y="24" width="28" height="4.6" rx="2.3" />
        <rect x="12" y="32.5" width="21" height="4.6" rx="2.3" />
      </g>
      <path
        d="M8.5 47.5 C11.5 38.5 15 34.5 18 41.5 C21 48.5 24 45.5 27 41.5 C30 37.5 33.5 43.5 38.5 46.5 C44 49.8 52 48 57.5 41"
        fill="none"
        stroke="var(--brand-emerald, #0f7a5a)"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The emerald signature element on its own (seal/verify accents). */
export function BrandSignature({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" className={cn("h-4 w-11", className)} role="img" aria-hidden>
      <path
        d="M3 18 C6.5 8.5 10 4.5 13 12 C16 19 19 16 22 12 C25 8 28.5 14 33.5 17 C39 20.3 48 18.5 61 11.5"
        fill="none"
        stroke="var(--brand-emerald, #0f7a5a)"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Horizontal lockup: mark + wordmark, with optional tagline.
 * `tone="invert"` renders the light variant for dark surfaces (nautical panel).
 */
export function BrandLogo({
  className,
  tagline = false,
  invert = false,
  size = "md",
}: {
  className?: string;
  tagline?: boolean;
  /** Use on dark surfaces: white "Docu", mint "rama", white mark border. */
  invert?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: { mark: "h-7 w-7", word: "text-base", tag: "text-[8.5px]", gap: "gap-2" },
    md: { mark: "h-9 w-9", word: "text-xl", tag: "text-[9.5px]", gap: "gap-2.5" },
    lg: { mark: "h-12 w-12", word: "text-3xl", tag: "text-xs", gap: "gap-3" },
  }[size];

  return (
    <span className={cn("inline-flex items-center", dims.gap, className)}>
      <BrandMark
        className={cn(dims.mark, invert && "[--brand-ink:#ffffff] [--brand-doc:#12211b] [--brand-line:#3d554a] [--brand-emerald:#4fd1a1]")}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-tight",
            dims.word,
            invert ? "text-white" : "text-foreground",
          )}
        >
          Docu
          <span className={invert ? "text-[#4fd1a1]" : "text-primary"}>
            rama
          </span>
        </span>
        {tagline && (
          <span
            className={cn(
              "mt-1 font-medium uppercase tracking-[0.22em]",
              dims.tag,
              invert ? "text-white/60" : "text-muted-foreground",
            )}
          >
            Sign&nbsp;•&nbsp;Seal&nbsp;•&nbsp;Verify
          </span>
        )}
      </span>
    </span>
  );
}
