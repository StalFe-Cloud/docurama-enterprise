import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/canonical-json";
import { DEFAULT_CONSENT_TEXT } from "@/lib/esign";

export type ConsentTerms = { schema: 1; text: string; version: string; digest: string };
export type ConsentPreferences = { consentText: string | null; consentVersion: string };
export class ConsentTermsError extends Error {}
const MAX_TEXT_BYTES = 16 * 1024;
const MAX_VERSION_BYTES = 128;
function fail(message: string): never { throw new ConsentTermsError(message); }
function checkedText(text: unknown): string {
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES || text.includes("\0")) {
    fail("Consent terms are missing or invalid. Contact the sender.");
  }
  return text; // Preserve the exact trusted wording, including whitespace.
}
function checkedVersion(version: unknown): string {
  if (typeof version !== "string" || !version.trim() || Buffer.byteLength(version, "utf8") > MAX_VERSION_BYTES || /[\x00-\x1f\x7f]/.test(version)) {
    fail("Consent version is missing or invalid. Contact the sender.");
  }
  return version;
}
function digest(text: string, version: string): string {
  return createHash("sha256").update(canonicalJson({ purpose: "DOCURAMA_CONSENT_V1", text, version }), "utf8").digest("hex");
}
export function resolveConsentTerms(preferences: ConsentPreferences | null = null): ConsentTerms {
  const text = checkedText(preferences?.consentText ?? DEFAULT_CONSENT_TEXT);
  const version = checkedVersion(preferences ? preferences.consentVersion : "v1.0");
  return { schema: 1, text, version, digest: digest(text, version) };
}
export function freezeConsentTerms(preferences: ConsentPreferences | null = null): string {
  return JSON.stringify(resolveConsentTerms(preferences));
}
export function readConsentSnapshot(raw: string | null | undefined): ConsentTerms {
  if (!raw || Buffer.byteLength(raw, "utf8") > 32 * 1024) fail("Historical consent terms are unavailable. Contact the sender to review and reissue this document.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail("Invalid frozen consent terms. Contact the sender."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Invalid frozen consent terms. Contact the sender.");
  const terms = parsed as ConsentTerms;
  if (terms.schema !== 1) fail("Unsupported frozen consent terms. Contact the sender.");
  const text = checkedText(terms.text), version = checkedVersion(terms.version);
  if (typeof terms.digest !== "string" || !/^[a-f0-9]{64}$/.test(terms.digest) || terms.digest !== digest(text, version)) {
    fail("Frozen consent terms do not match their recorded digest. Contact the sender.");
  }
  return { schema: 1, text, version, digest: terms.digest };
}
export function assertConsentAcknowledgement(body: Record<string, unknown>, terms: ConsentTerms): void {
  // Revalidate even an in-memory caller object before capturing authoritative text.
  const trusted = readConsentSnapshot(JSON.stringify(terms));
  if (body.consent !== true) fail("Explicit consent to sign electronically is required.");
  if (body.consentDigest !== trusted.digest || body.consentVersion !== trusted.version ||
      (body.consentText !== undefined && body.consentText !== trusted.text)) {
    fail("Consent terms changed or do not match the displayed version. Reload this document before signing.");
  }
}
