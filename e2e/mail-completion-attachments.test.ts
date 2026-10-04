/** Standalone: synthetic DB double, real generated PDFs and owned loopback SMTP only. */
import { expect, mock, test } from "bun:test";
import net from "node:net";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { freezeTemplateContract } from "../src/lib/contract-snapshot";
import { computeEnvelopeEvidenceDigest } from "../src/lib/esign";
import { captureSignatureData } from "../src/lib/signature-data";
import { validateEnvelopeFields } from "../src/lib/envelope-fields";
let row: Record<string, unknown>;
let envelope: ReturnType<typeof fixtureEnvelope>;
mock.module("../src/lib/db", () => ({ db: {
  mailOutbox: {
    findMany: async () => [{ ...row }],
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if ((where.attempts as { gte?: number } | undefined)?.gte !== undefined) return { count: 0 };
      if (where.status !== row.status || (where.claimToken && where.claimToken !== row.claimToken)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  envelope: { findUnique: async () => envelope },
} }));
mock.module("../src/lib/document-store", () => ({ readStoredBytes: async () => { throw new Error("Unexpected upload read"); } }));
const { processOutbox } = await import("../src/lib/mail");
const { buildFinalDocument } = await import("../src/lib/final-document");
const signers = [
  { id: "first", name: "First Synthetic Signer", email: "first@example.invalid", role: "SIGNER", status: "SIGNED", order: 1, signedAt: new Date(1000) },
  { id: "second", name: "Second Synthetic Signer", email: "second@example.invalid", role: "SIGNER", status: "SIGNED", order: 2, signedAt: new Date(2000) },
];
function fixtureEnvelope() {
  const fields = validateEnvelopeFields(signers.map((r,index) => ({ id: "signature"+index, type: "signature", pageNumber: 1, x: 10, y: 30+index*15, width: 80, height: 8, recipientIndex: index, recipientEmail: r.email, required: true })), { pageCount: 1, recipients: signers });
  const recipients = [...signers.map(r=>({...r, signatureData: JSON.stringify(captureSignatureData({name:r.name,consent:true}, fields, r.email, r.signedAt))})),
    { id: "copy", name: "Synthetic Copy", email: "copy@example.invalid", role: "CC", status: "PENDING", order: 3, signedAt: null, signatureData: null }];
  const value = { id: "envelope", tenantId: "tenant", publicCode: "DOC-SYNTHETIC", title: "Synthetic original agreement", status: "COMPLETED", pages: 1,
    createdAt: new Date(0), sealedAt: new Date(2000), sha256: null, evidenceSha256: "", documentId: null, document: null as {tenantId:string;storageKey:string} | null,
    templateId: "template", fields: JSON.stringify(fields), contractSnapshot: freezeTemplateContract({id:"template",name:"Synthetic",version:"1",bodyMarkdown:"Original synthetic terms",pages:1},fields),
    recipients, events: [{at:new Date(2000),actor:"Synthetic signer",action:"SIGNED",detail:"Synthetic completion"}],
    tenant: {status:"ACTIVE"}, createdBy: {email:"sender@example.invalid"} };
  value.evidenceSha256 = computeEnvelopeEvidenceDigest({...value,documentSha256:null,events:[]});
  return value;
}
function queue(recipientId: string | null = "first", toEmail = "first@example.invalid") {
  row={id:"synthetic-completion",envelopeId:"envelope",recipientId,toEmail,fromEmail:"sender@example.invalid",subject:"Completed: Synthetic",bodyText:"All parties signed.",bodyHtml:"<p>All parties signed.</p>",template:"SIGN_COMPLETED",status:"QUEUED",attempts:0,claimToken:null};
}
async function relay() {
  const messages: string[] = [], sockets = new Set<net.Socket>();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on("close",()=>sockets.delete(socket));
    let buffer="",data=false,message="";
    socket.write("220 synthetic relay\r\n");
    socket.on("data",chunk=>{buffer+=chunk.toString();let end:number;while((end=buffer.indexOf("\r\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
      if(data){if(line==="."){messages.push(message);message="";data=false;socket.write("250 accepted\r\n");}else message+=line+"\r\n";}
      else if(/^EHLO|^HELO/i.test(line))socket.write("250 synthetic relay\r\n");
      else if(/^DATA/i.test(line)){data=true;socket.write("354 continue\r\n");}
      else if(/^QUIT/i.test(line))socket.end("221 goodbye\r\n");else socket.write("250 ok\r\n");}});
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  process.env.SMTP_URL="smtp://127.0.0.1:"+(server.address() as net.AddressInfo).port+"?tls=off";
  return {messages,close:async()=>{for(const s of sockets)s.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
function attachmentBytes(message: string) {
  const boundary=/boundary="([^"]+)"/.exec(message)?.[1];
  expect(boundary).toBeDefined();
  return message.split("--"+boundary).filter(part=>/Content-Disposition: attachment/i.test(part)).map(part=>{
    const separator=part.indexOf("\r\n\r\n");
    expect(part).toContain("Content-Type: application/pdf");
    expect(part).toContain("Content-Transfer-Encoding: base64");
    return {filename:/filename=([^\r\n]+)/.exec(part)?.[1]?.replace(/"/g,""),bytes:Buffer.from(part.slice(separator+4).trim(),"base64")};
  });
}
test("completion sends two actual PDF attachments to bound recipient and sender",async()=>{
  const smtp=await relay();
  try {
    envelope=fixtureEnvelope();
    const expected=await buildFinalDocument(envelope);
    for(const [id,email] of [["first","first@example.invalid"],["copy","copy@example.invalid"],[null,"sender@example.invalid"]] as const){
      queue(id,email);await processOutbox();expect(row.status).toBe("SENT");
    }
    expect(smtp.messages).toHaveLength(3);
    for(const message of smtp.messages){
      const attachments=attachmentBytes(message);expect(attachments).toHaveLength(2);
      expect(attachments[0]!.filename).toBe("DOC-SYNTHETIC-completed.pdf");
      expect(attachments[1]!.filename).toBe("DOC-SYNTHETIC-completion-record.pdf");
      expect(attachments[0]!.bytes.equals(expected.bytes)).toBe(true);
      expect(attachments[1]!.bytes.equals(expected.recordBytes)).toBe(true);
      expect(createHash("sha256").update(attachments[0]!.bytes).digest("hex")).toBe(expected.sha256);
      expect((await PDFDocument.load(attachments[0]!.bytes)).getPageCount()).toBe(1);
      expect((await PDFDocument.load(attachments[1]!.bytes)).getPageCount()).toBeGreaterThan(0);
    }
    envelope.tenant.status="TRIAL";
    queue(); await processOutbox();
    expect(row.status).toBe("SENT");
    const trialAttachments=attachmentBytes(smtp.messages.at(-1)!);
    expect(trialAttachments).toHaveLength(2);
    expect(trialAttachments[0]!.bytes.equals(expected.bytes)).toBe(true);
    expect(trialAttachments[1]!.bytes.equals(expected.recordBytes)).toBe(true);
  }finally{await smtp.close();}
});
test("wrong recipient destination, suspended workspace and tampered seal send nothing",async()=>{
  const smtp=await relay();
  try{
    for(const reason of ["destination","recipient","role","sender","suspended","status","proof","document"]){
      envelope=fixtureEnvelope();queue();
      if(reason==="destination")row.toEmail="other@example.invalid";
      if(reason==="recipient")row.recipientId="foreign";
      if(reason==="role")envelope.recipients[0]!.role="APPROVER";
      if(reason==="sender"){row.recipientId=null;row.toEmail="other@example.invalid";}
      if(reason==="suspended")envelope.tenant.status="SUSPENDED";
      if(reason==="status")envelope.status="VOIDED";
      if(reason==="proof")envelope.evidenceSha256="tampered";
      if(reason==="document")envelope.document={tenantId:"foreign",storageKey:"synthetic-never-read"};
      const result=await processOutbox();
      expect(result.sent).toBe(0);expect(result.deferred).toBe(1);expect(row.status).toBe("QUEUED");expect(row.claimToken).toBeNull();
    }
    expect(smtp.messages).toHaveLength(0);
  }finally{await smtp.close();}
});
