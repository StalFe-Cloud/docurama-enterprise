import { StandardFontEmbedder, StandardFonts } from "pdf-lib";
import { canonicalJson } from "@/lib/canonical-json";

export type ContractSnapshot = {
  version: 1; kind: "template"; templateId: string; name: string;
  templateVersion: string; bodyMarkdown: string; pages: number;
  signatureLocations: unknown[];
};
export class ContractSnapshotError extends Error {}
const MAX_BYTES = 2 * 1024 * 1024;
function invalid(): never { throw new ContractSnapshotError("This contract has no valid immutable snapshot. Contact the sender to review and reissue it."); }
function checked(value: unknown): ContractSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const s = value as Record<string, unknown>;
  if (s.version !== 1 || s.kind !== "template" || typeof s.templateId !== "string" || !s.templateId || s.templateId.length > 200 ||
    typeof s.name !== "string" || !s.name.trim() || s.name.length > 500 ||
    typeof s.templateVersion !== "string" || s.templateVersion.length > 100 ||
    typeof s.bodyMarkdown !== "string" || !s.bodyMarkdown.trim() || Buffer.byteLength(s.bodyMarkdown, "utf8") > 1024 * 1024 ||
    typeof s.pages !== "number" || !Number.isSafeInteger(s.pages) || s.pages < 1 ||
    !Array.isArray(s.signatureLocations) || s.signatureLocations.length > 200) invalid();
  return { version: 1, kind: "template", templateId: s.templateId, name: s.name,
    templateVersion: s.templateVersion, bodyMarkdown: s.bodyMarkdown, pages: s.pages, signatureLocations: s.signatureLocations };
}
/** Called only with the authoritative template and validated locations inside send's transaction. */
export function freezeTemplateContract(template: { id: string; name: string; version: string; bodyMarkdown: string | null; pages: number }, locations: unknown[] = []): string {
  const snapshot = checked({ version: 1, kind: "template", templateId: template.id, name: template.name,
    templateVersion: template.version, bodyMarkdown: template.bodyMarkdown, pages: template.pages, signatureLocations: locations });
  try { StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as Parameters<typeof StandardFontEmbedder.for>[0]).encodeText(snapshot.bodyMarkdown.replace(/[\r\n\t]/g, " ")); }
  catch { throw new ContractSnapshotError("This template contains characters unsupported by the final PDF renderer. Use an uploaded document or supported template text."); }
  const serialized = canonicalJson(snapshot);
  if (Buffer.byteLength(serialized, "utf8") > MAX_BYTES) invalid();
  return serialized;
}
/** Never substitute today's template for missing historical terms, including deleted template relations. */
export function readContractSnapshot(envelope: { contractSnapshot?: string | null; templateId?: string | null; documentId?: string | null }): ContractSnapshot | null {
  if (!envelope.contractSnapshot) {
    if (envelope.templateId || !envelope.documentId) invalid();
    return null;
  }
  if (Buffer.byteLength(envelope.contractSnapshot, "utf8") > MAX_BYTES) invalid();
  let value: unknown;
  try { value = JSON.parse(envelope.contractSnapshot); } catch { invalid(); }
  const snapshot = checked(value);
  if (envelope.templateId && snapshot.templateId !== envelope.templateId) invalid();
  return snapshot;
}
