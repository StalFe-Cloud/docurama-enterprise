/**
 * Search normalization.
 *
 * The bug this closes: query strings were lowercased at the API boundary and
 * then compared with Prisma `contains` against mixed-case stored values, and
 * SQLite has no `mode: "insensitive"`. Searching "NDA" was sent as "nda" and
 * matched nothing.
 *
 * Lowercasing alone is not enough once the French catalogue lands: a user who
 * types "resiliation" expects to find "résiliation", and "Contrat de Prestation"
 * should match however it was capitalised. So every searchable string gets an
 * accent-folded lowercase mirror column, written on every save, and queries are
 * folded the same way before they are compared.
 */

/**
 * Fold a string for search: lowercase, strip diacritics, collapse whitespace.
 *
 * NFD splits an accented character into its base letter plus a combining mark,
 * and the range U+0300-U+036F is exactly those marks, so removing it leaves the
 * base letters. Ligatures that have no decomposition (oe, ae) are mapped
 * explicitly, because "coeur" should find "cœur".
 */
export function foldForSearch(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/Œ/g, "OE")
    .replace(/œ/g, "oe")
    .replace(/Æ/g, "AE")
    .replace(/æ/g, "ae")
    .replace(/Ø/g, "O")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
