/** Recipient-bound locations for durable value capture and derived PDF rendering. */
export const MAX_ENVELOPE_FIELDS = 200;
const MAX_FIELDS_JSON_BYTES = 128 * 1024;
export type FieldRecipient = { name: string; email: string; role: string };
export type EnvelopeField = {
  id: string; type: "signature" | "initials" | "text" | "date" | "checkbox"; pageNumber: number;
  x: number; y: number; width: number; height: number;
  /** Index in the SIGNER list, excluding CC recipients (builder contract). */
  recipientIndex: number; recipientEmail: string; recipientName: string;
  label: string; required: boolean;
};
export class EnvelopeFieldsError extends Error {}
function fail(message: string): never { throw new EnvelopeFieldsError(message); }

export function validateEnvelopeFields(raw: unknown, context: { pageCount: number; recipients: FieldRecipient[] }): EnvelopeField[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail("Fields must be an array of signature location hints");
  if (raw.length > MAX_ENVELOPE_FIELDS) fail(`Provide at most ${MAX_ENVELOPE_FIELDS} signature locations`);
  if (Buffer.byteLength(JSON.stringify(raw), "utf8") > MAX_FIELDS_JSON_BYTES) fail("Signature locations exceed the supported payload size");
  if (!Number.isInteger(context.pageCount) || context.pageCount < 1) fail("The document has no valid pages for signature locations");
  const signers = context.recipients.filter((r) => r.role === "SIGNER");
  const ids = new Set<string>();
  return raw.map((value: unknown): EnvelopeField => {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("Every field must be a signature location object");
    const field = value as Record<string, unknown>;
    if (typeof field.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(field.id) || ids.has(field.id)) fail("Every signature location must have a unique valid id");
    ids.add(field.id);
    if (!["signature", "initials", "text", "date", "checkbox"].includes(String(field.type))) fail("Unsupported document field type");
    if (typeof field.pageNumber !== "number" || !Number.isInteger(field.pageNumber) || field.pageNumber < 1 || field.pageNumber > context.pageCount) fail("Signature location page is outside this document");
    for (const key of ["x", "y", "width", "height"] as const) {
      if (typeof field[key] !== "number" || !Number.isFinite(field[key])) fail("Signature location coordinates must be finite numbers");
    }
    const { x, y, width, height } = field as { x: number; y: number; width: number; height: number };
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) fail("Signature location must fit inside its document page");
    if (typeof field.recipientIndex !== "number" || !Number.isInteger(field.recipientIndex) || field.recipientIndex < 0 || field.recipientIndex >= signers.length) fail("Signature locations must belong to a signer, never a copy recipient");
    const signer = signers[field.recipientIndex];
    if (typeof field.recipientEmail !== "string" || field.recipientEmail.trim().toLowerCase() !== signer.email.trim().toLowerCase()) fail("Signature location recipient does not match its assigned signer");
    // Email addresses also bind displayed hints to signing tokens. Duplicate
    // signers with the same email make that binding ambiguous.
    if (signers.filter((r) => r.email.trim().toLowerCase() === signer.email.trim().toLowerCase()).length !== 1) fail("Signature location assignment requires unique signer email addresses");
    if (field.label !== undefined && (typeof field.label !== "string" || field.label.length > 200)) fail("Signature location label must be text of at most 200 characters");
    if (field.required !== undefined && typeof field.required !== "boolean") fail("Signature location required flag must be a boolean");
    return {
      id: field.id, type: field.type as EnvelopeField["type"], pageNumber: field.pageNumber,
      x, y, width, height, recipientIndex: field.recipientIndex,
      recipientEmail: signer.email.trim().toLowerCase(), recipientName: signer.name,
      label: typeof field.label === "string" ? field.label : "Signature", required: field.required !== false,
    };
  });
}

/** Persisted content is untrusted too: old rows may predate the send boundary. */
export function parseEnvelopeFields(raw: string | null | undefined, context: { pageCount: number; recipients: FieldRecipient[] }): EnvelopeField[] {
  if (!raw) return [];
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_FIELDS_JSON_BYTES) fail("Stored signature locations exceed the supported payload size");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail("Stored signature locations are invalid; contact the sender"); }
  return validateEnvelopeFields(parsed, context);
}
