/**
 * Canonical JSON — the exact serialization both sides of a signature agree on.
 *
 * Used by the evidence-pack manifest and the public-portal attestation
 * protocol. The producer (server, Node crypto) and every verifier (offline
 * verify.html in the browser, the portal receiver, e2e tests) must serialize
 * the SAME payload object to the SAME bytes, or the RSA signature over it
 * means nothing. The rules are deliberately tiny and portable:
 *
 *   - object keys sorted by UTF-16 code unit, recursively
 *   - no whitespace anywhere
 *   - strings via JSON.stringify (standard escapes)
 *   - numbers via JSON.stringify (payloads use integers and ISO strings only)
 *
 * verify.html inside every evidence pack embeds a byte-for-byte mirror of this
 * function — if you change it here, change it there in the same commit.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(",")}}`;
    }
    default:
      // undefined / functions / symbols never appear in signed payloads;
      // normalizing them to null keeps the output total and predictable.
      return "null";
  }
}
