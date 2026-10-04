import { computeEnvelopeEvidenceDigest } from "@/lib/esign";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { createHash } from "node:crypto";
import { readStoredBytes } from "@/lib/document-store";
import { readContractSnapshot } from "@/lib/contract-snapshot";
import { parseEnvelopeFields } from "@/lib/envelope-fields";
import { readSignatureData, type SignatureData } from "@/lib/signature-data";
export class FinalDocumentError extends Error {}
type Recipient = { name: string; email: string; role: string; status: string; order: number; signedAt: Date | null; signatureData?: string | null };
export type FinalEnvelope = { publicCode: string; title: string; status: string; pages: number; createdAt: Date; sealedAt: Date | null;
  sha256: string | null; evidenceSha256?: string | null; contractSnapshot?: string | null; templateId?: string | null; documentId?: string | null;
  events?: { action: string; at: Date; actor: string; detail?: string | null }[];
  fields?: string | null; document?: { storageKey: string } | null; recipients: Recipient[] };
function fail(message: string): never { throw new FinalDocumentError(message); }
function width(font: PDFFont, text: string, size: number): number {
  try { return font.widthOfTextAtSize(text, size); } catch { fail("The final PDF cannot represent a character in these values. Contact the sender; no substitute characters were created."); }
}
/** Derived from immutable terms, original bytes and durable adoption values. Never replaces the original checksum. */
export async function buildFinalDocument(e: FinalEnvelope): Promise<{ bytes: Buffer; sha256: string; pages: number; recordBytes: Buffer; recordSha256: string }> {
  if (e.status !== "COMPLETED" || !e.sealedAt) fail("The final document is available after all signers complete.");
  const contract = readContractSnapshot(e);
  if (e.documentId && contract) fail("This envelope has ambiguous uploaded and template terms. Contact the sender to review and reissue it.");
  const signers = e.recipients.filter(r => r.role === "SIGNER").sort((a,b) => a.order-b.order);
  if (!signers.length || signers.some(r => r.status !== "SIGNED")) fail("All required signers must complete first.");
  const proof = computeEnvelopeEvidenceDigest({ id: "", publicCode: e.publicCode, title: e.title, pages: e.pages, createdAt: e.createdAt,
    documentSha256: e.documentId ? e.sha256 : null, contractSnapshot: e.contractSnapshot, fields: e.fields, recipients: signers, events: [] });
  if (!e.evidenceSha256 || proof !== e.evidenceSha256) fail("The immutable contract or signature adoption evidence does not match its recorded seal.");
  const adoptions = new Map<number, SignatureData>(signers.map(r => [r.order, readSignatureData(r.signatureData)]));
  if (new Set(signers.map(r => r.order)).size !== signers.length) fail("Invalid recipient signing order.");
  if (e.documentId && !e.document) fail("The original uploaded document is unavailable.");
  let pdf: PDFDocument;
  if (e.documentId && e.document) {
    const original = await readStoredBytes(e.document.storageKey);
    const digest = createHash("sha256").update(original).digest("hex");
    if (!e.sha256 || digest !== e.sha256) fail("The original PDF does not match its recorded checksum.");
    try { pdf = await PDFDocument.load(original, { updateMetadata: false }); }
    catch { fail("The original PDF is unsupported or encrypted; a final document was not created."); }
  } else if (contract) { pdf = await PDFDocument.create(); }
  else fail("No immutable original contract is available.");
  if (e.documentId && pdf.getPageCount() !== e.pages) fail("The original PDF page count does not match the reviewed document record.");
  const normal = await pdf.embedFont(StandardFonts.Helvetica), signature = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  if (contract) {
    const lines: string[] = [];
    for (const paragraph of contract.bodyMarkdown.split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (width(normal, (line ? line + " " : "") + word, 11) > 490 && line) { lines.push(line); line = word; }
        else line += (line ? " " : "") + word;
        if (width(normal, line, 11) > 490) fail("A contract line is too long to render faithfully.");
      }
      lines.push(line);
    }
    for (let offset = 0; offset < lines.length; offset += 46) {
      const page = pdf.addPage([595,842]);
      lines.slice(offset,offset+46).forEach((line,i) => page.drawText(line,{x:50,y:790-i*16,size:11,font:normal}));
    }
    while (pdf.getPageCount() < contract.pages) pdf.addPage([595,842]);
  }
  const fields = parseEnvelopeFields(contract ? JSON.stringify(contract.signatureLocations) : e.fields,
    { pageCount: e.pages, recipients: e.recipients });
  for (const field of fields) {
    const page = pdf.getPages()[field.pageNumber-1];
    if (!page) fail("A field references a missing final PDF page.");
    const crop = page.getCropBox();
    if (page.getRotation().angle % 360 !== 0 || crop.x !== 0 || crop.y !== 0 || crop.width !== page.getWidth() || crop.height !== page.getHeight()) fail("Rotated or cropped PDF fields are not supported by this final-document renderer.");
    const savedValues = adoptions.get(signers[field.recipientIndex]?.order)?.values;
    const value = savedValues && Object.hasOwn(savedValues, field.id) ? savedValues[field.id] : undefined;
    if (value === undefined) fail("Stored adoption evidence is missing a document field value.");
    const x = page.getWidth()*field.x/100, y = page.getHeight()*(1-(field.y+field.height)/100);
    const w = page.getWidth()*field.width/100, h = page.getHeight()*field.height/100;
    if (field.type === "checkbox") {
      if (Math.min(w,h) < 4) fail("Checkbox position is too small to render faithfully.");
      page.drawRectangle({x,y,width:Math.min(w,h),height:Math.min(w,h),borderWidth:1,borderColor:rgb(0,0,0)});
      if (value === true) {
        const size = Math.min(w,h);
        page.drawLine({start:{x:x+2,y:y+2},end:{x:x+size-2,y:y+size-2},thickness:1.5});
        page.drawLine({start:{x:x+2,y:y+size-2},end:{x:x+size-2,y:y+2},thickness:1.5});
      }
    } else {
      if (typeof value !== "string") fail("Invalid persisted field value.");
      const font = ["signature","initials"].includes(field.type) ? signature : normal;
      let size = Math.min(field.type === "signature" ? 20 : 12,h*.7);
      while (size > 4 && width(font,value,size) > w) size -= .5;
      if (size < 4 || width(font,value,size) > w || /[\r\n]/.test(value)) fail("A field value cannot fit its assigned position. Contact the sender to resize it.");
      if (value) page.drawText(value,{x,y:y+(h-size)/2,size,font});
    }
  }
  // A separate record keeps unpositioned typed adoption visible without inventing placed fields.
  const documentPageCount = pdf.getPageCount();
  const record = await PDFDocument.create();
  const auditFont = await record.embedFont(StandardFonts.Helvetica);
  let audit = record.addPage([595,842]), y = 790;
  const auditLine = (text: string) => {
    const drawLine = (line: string) => {
      if (y < 50) { audit = record.addPage([595,842]); y=790; }
      if (width(auditFont,line,10) > 490) fail("A completion-record line is too long to render faithfully.");
      audit.drawText(line,{x:50,y,size:10,font:auditFont});y-=15;
    };
    const words=text.split(/\s+/);let line="";
    for(const word of words){ if(width(auditFont,line+" "+word,10)>490&&line){drawLine(line);line=word;}else line+=(line?" ":"")+word; }
    drawLine(line);
  };
  auditLine(`Completion record: ${e.publicCode}`); auditLine(`Document: ${e.title}`); auditLine(`Completed: ${e.sealedAt.toISOString()}`);
  auditLine(`Document pages: ${documentPageCount}; signers completed: ${signers.length}; signature positions: ${fields.filter(f => f.type === "signature").length}; initial positions: ${fields.filter(f => f.type === "initials").length}; audit events: ${e.events?.length ?? 0}`);
  auditLine("Email-link typed signatures. PAdES and trusted timestamp conformance are not asserted.");
  for(const r of signers){const a=adoptions.get(r.order)!;auditLine(`${r.order}. ${a.name} <${r.email}>; ${a.authMethod}; ${a.consentAcceptedAt}`);auditLine(`Selected signature style: ${a.font}; rendered as standard italic typed text.`);auditLine(a.consent);}
  for (const event of e.events ?? []) auditLine(`${event.at.toISOString()} ${event.action}: ${event.actor}; ${event.detail ?? ""}`);
  for (const output of [pdf,record]) {
    output.setCreationDate(e.createdAt);output.setModificationDate(e.sealedAt);output.setProducer("Docurama derived completion document");output.setCreator("Docurama");
  }
  const bytes=Buffer.from(await pdf.save({useObjectStreams:false,addDefaultPage:false}));
  const recordBytes=Buffer.from(await record.save({useObjectStreams:false,addDefaultPage:false}));
  return {bytes,pages:documentPageCount,sha256:createHash("sha256").update(bytes).digest("hex"),recordBytes,recordSha256:createHash("sha256").update(recordBytes).digest("hex")};
}
