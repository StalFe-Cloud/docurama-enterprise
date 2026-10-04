import { canonicalJson } from "@/lib/canonical-json";
/**
 * eSign domain helpers: document download filename formats, TSA presets and
 * 21 CFR Part 11 / eIDAS reference copy shared by the settings UI and API.
 */
import { createHash } from "crypto";

export const FILENAME_TOKENS: { token: string; description: string; example: string }[] = [
  { token: "{title}", description: "Envelope title", example: "Service Agreement" },
  { token: "{document}", description: "Document file name", example: "contract-v3" },
  { token: "{signer}", description: "Signer full name", example: "Alexandra Fischer" },
  { token: "{sender}", description: "Sender full name", example: "Priya Shah" },
  { token: "{envelope_id}", description: "Public verification code", example: "DOC-8F3K2M9P" },
  { token: "{sequence}", description: "Recipient signing order", example: "1" },
  { token: "{date}", description: "Completion date (YYYY-MM-DD)", example: "2026-09-14" },
  { token: "{time}", description: "Completion time (HHmm)", example: "1642" },
  { token: "{year}", description: "Year", example: "2026" },
  { token: "{month}", description: "Month number", example: "09" },
];

export const FILENAME_PRESETS: { label: string; format: string }[] = [
  { label: "Friendly (default)", format: "{title} - {signer} ({date})" },
  { label: "Code-prefixed", format: "{envelope_id}_{title}" },
  { label: "Compact", format: "{document}_{date}" },
  { label: "Signer-first", format: "{signer}_{title}_{time}" },
  { label: "Archive order", format: "{date}_{sequence}_{title}_{envelope_id}" },
];

export const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Validate a filename pattern: at least one token, no invalid characters, ≤ 120 chars. */
export function validateFilenameFormat(format: string): { ok: boolean; error?: string } {
  if (!format.trim()) return { ok: false, error: "A filename format is required" };
  if (format.length > 120) return { ok: false, error: "Keep the format under 120 characters" };
  if (INVALID_FILENAME_CHARS.test(format)) {
    return { ok: false, error: "The format contains characters that are not allowed in file names (\\ / : * ? \" < > |)" };
  }
  if (!/\{[a-z_]+\}/.test(format)) {
    return { ok: false, error: "Add at least one placeholder such as {title} or {signer}" };
  }
  const unknown = [...format.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1])
    .filter((t) => !FILENAME_TOKENS.some((k) => k.token === `{${t}}`));
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown placeholder: ${unknown.map((t) => `{${t}}`).join(", ")}` };
  }
  return { ok: true };
}

/** Render a preview of the pattern with sample values (no .pdf suffix handling here). */
export function previewFilename(
  format: string,
  sample: Partial<Record<string, string>> = {},
): string {
  const values: Record<string, string> = {
    title: "Service Agreement",
    document: "contract-v3",
    signer: "Alexandra Fischer",
    sender: "Priya Shah",
    envelope_id: "DOC-8F3K2M9P",
    sequence: "1",
    date: "2026-09-14",
    time: "1642",
    year: "2026",
    month: "09",
    ...sample,
  };
  return format.replace(/\{([a-z_]+)\}/g, (_, k: string) => values[k] ?? `{${k}}`) + ".pdf";
}

// ── RFC 3161 Timestamp Authority presets ─────────────────────────────────────

export const TSA_PRESETS: { key: string; name: string; url: string; note: string }[] = [
  { key: "digicert", name: "DigiCert", url: "https://timestamp.digicert.com", note: "Industry default, high availability" },
  { key: "sectigo", name: "Sectigo", url: "https://timestamp.sectigo.com", note: "Generous rate limits" },
  { key: "globalsign", name: "GlobalSign", url: "https://timestamp.globalsign.com/tsa/rsladvanced/rfc3161", note: "SHA-256 advanced" },
  { key: "freetsa", name: "FreeTSA.org", url: "https://freetsa.org", note: "Free community TSA - fine for QA, not for qualified seals" },
];

// ── 21 CFR Part 11 reference copy ────────────────────────────────────────────

export const DEFAULT_CONSENT_TEXT =
  "By electronically signing this document, I confirm that I have reviewed it and consent to sign electronically. " +
  "My typed name and signing activity will be recorded with the document's completion evidence.";

export const SIGNATURE_MANIFESTATION_FIELDS = [
  { field: "Printed name", example: "Alexandra Fischer", regulation: "21 CFR §11.50(a)(1)" },
  { field: "Date & time (UTC)", example: "2026-09-14 16:42:07 UTC", regulation: "21 CFR §11.50(a)(2)" },
  { field: "Meaning", example: "Approval, reviewed and agreed", regulation: "21 CFR §11.50(a)(3)" },
  { field: "Signer identity", example: "alex@stalfe.example (authenticated)", regulation: "21 CFR §11.100(c)" },
  { field: "Document hash", example: "SHA-256: 3a2f…9c41", regulation: "Integrity control" },
  { field: "RFC 3161 timestamp", example: "TSA: timestamp.digicert.com, genTime 16:42:09 UTC", regulation: "Long-term validation" },
];

export const ESIGN_LEVELS: { key: string; label: string; description: string }[] = [
  { key: "simple", label: "Simple (SES)", description: "Basic eIDAS electronic signature - email-to-sign flows" },
  { key: "advanced", label: "Advanced (AdES)", description: "Uniquely linked to the signer, tamper-evident, PAdES conformance" },
  { key: "qualified", label: "Qualified (QES)", description: "Qualified certificate + qualified timestamp (QSCD) - highest eIDAS level" },
];

/* ── Envelope sealing ──────────────────────────────────────────────────────── */

export type SealInput = {
  id: string;
  publicCode: string;
  title: string;
  pages: number;
  createdAt: Date;
  documentSha256?: string | null;
  contractSnapshot?: string | null;
  fields?: string | null;
  recipients: { email: string; role: string; status: string; order: number; signedAt: Date | null; signatureData?: string | null }[];
  events: { action: string; actor: string; at: Date }[];
};

/**
 * Keep an uploaded document's original checksum unchanged. This is a file
 * integrity anchor, not a signature over the signer ledger or placed hints.
 * Without an upload, bind frozen contract terms, locations, recipient state
 * and durable adoption values. The export manifest separately authenticates
 * its artifacts; this helper does not implement PAdES or trusted timestamps.
 */
export function computeEnvelopeDigest(env: SealInput): string {
  return env.documentSha256 || computeEnvelopeEvidenceDigest(env);
}

/** Separate proof binding preserves the uploaded file checksum contract. */
export function computeEnvelopeEvidenceDigest(env: SealInput): string {
  const parsed = (raw: string | null | undefined): unknown => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { throw new Error("Invalid evidence JSON"); }
  };
  // The append-only event ledger is authenticated separately by the export
  // manifest. Excluding it keeps this immutable contract/adoption seal stable
  // when later seal, delivery and export events are recorded.
  const payload = {
    version: 1, code: env.publicCode, title: env.title, pages: env.pages,
    createdAt: env.createdAt.toISOString(), originalSha256: env.documentSha256 ?? null,
    contract: parsed(env.contractSnapshot), fields: parsed(env.fields),
    recipients: env.recipients.filter(r => r.role === "SIGNER").sort((a,b) => a.order-b.order).map(r => ({
      order: r.order, email: r.email, role: r.role, status: r.status,
      signedAt: r.signedAt?.toISOString() ?? null, adoption: parsed(r.signatureData),
    })),
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
