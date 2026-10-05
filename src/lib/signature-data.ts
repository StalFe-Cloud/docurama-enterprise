import { StandardFontEmbedder, StandardFonts } from "pdf-lib";
import { assertConsentAcknowledgement, readConsentSnapshot, ConsentTermsError, type ConsentTerms } from "@/lib/consent";
import type { EnvelopeField } from "@/lib/envelope-fields";
export type SignatureData = { version: 1 | 2; consentVersion?: string; consentDigest?: string; name: string; font: string; consent: string; consentAcceptedAt: string;
  authMethod: "EMAIL_LINK"; values: Record<string, string | boolean> };
export class SignatureDataError extends Error {}
function fail(message: string): never { throw new SignatureDataError(message); }
function renderable(text: string): void {
  try { StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as Parameters<typeof StandardFontEmbedder.for>[0]).encodeText(text); }
  catch { fail("This final PDF renderer cannot represent a character in your name or field values. Contact the sender."); }
}
export function captureSignatureData(body: Record<string, unknown>, fields: EnvelopeField[], email: string, at: Date, terms: ConsentTerms): SignatureData {
  try { assertConsentAcknowledgement(body, terms); }
  catch (error) { if (error instanceof ConsentTermsError) fail(error.message); throw error; }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 200) fail("Type your full name (2 to 200 characters).");
  renderable(name);
  const raw = body.values ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Buffer.byteLength(JSON.stringify(raw), "utf8") > 128 * 1024) fail("Invalid field values.");
  const input = raw as Record<string, unknown>, own = fields.filter(f => f.recipientEmail.toLowerCase() === email.toLowerCase());
  if (Object.keys(input).some(id => !own.some(f => f.id === id))) fail("Field values must belong to this signer.");
  const values: Record<string, string | boolean> = Object.create(null);
  for (const field of own) {
    let value = Object.hasOwn(input, field.id) ? input[field.id] : undefined;
    if (field.type === "signature") value = name;
    if (field.type === "initials") value = name.split(/\s+/).map(p => p[0]).join("").slice(0, 20);
    if (field.type === "checkbox") {
      if (value === undefined) value = false;
      if (typeof value !== "boolean") fail("Checkbox values must be true or false.");
      if (field.required && !value) fail(`Complete required field: ${field.label}`);
    } else {
      if (value === undefined && !field.required) value = "";
      if (typeof value !== "string" || value.length > 2000 || (field.required && !value.trim())) fail(`Complete required field: ${field.label}`);
      if (field.type === "date" && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0,10) !== value)) fail("Choose a valid calendar date.");
    }
    if (typeof value === "string") { if (/[\r\n]/.test(value)) fail("Document field values must fit a single line."); renderable(value); }
    values[field.id] = value as string | boolean;
  }
  return { version: 2, name, font: String(body.font ?? "caveat"), consent: terms.text,
    consentVersion: terms.version, consentDigest: terms.digest,
    consentAcceptedAt: at.toISOString(), authMethod: "EMAIL_LINK", values };
}
export function readSignatureData(raw: string | null | undefined): SignatureData {
  if (!raw || Buffer.byteLength(raw,"utf8") > 128 * 1024) fail("Historical signature adoption proof is unavailable.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail("Invalid signature adoption evidence."); }
  const s = parsed as SignatureData;
  if (!s || ![1, 2].includes(s.version) || typeof s.name !== "string" || !s.name.trim() || typeof s.consent !== "string" || !s.consent ||
    !Number.isFinite(Date.parse(s.consentAcceptedAt)) || s.authMethod !== "EMAIL_LINK" || !s.values || typeof s.values !== "object" || Array.isArray(s.values)) fail("Invalid signature adoption evidence.");
  if (s.version === 2) {
    try { readConsentSnapshot(JSON.stringify({ schema: 1, text: s.consent, version: s.consentVersion, digest: s.consentDigest })); }
    catch (error) { if (error instanceof ConsentTermsError) fail("Invalid frozen consent in signature adoption evidence."); throw error; }
  }
  return s; // Version 1 historical wording is retained verbatim, never rewritten.
}
