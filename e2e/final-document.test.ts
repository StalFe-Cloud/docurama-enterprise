import type { FinalEnvelope } from "../src/lib/final-document";
import { computeEnvelopeDigest, computeEnvelopeEvidenceDigest } from "../src/lib/esign";
import { describe, expect, mock, test } from "bun:test";
import { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } from "pdf-lib";
import { createHash } from "node:crypto";
import { freezeTemplateContract } from "../src/lib/contract-snapshot";
import { captureSignatureData } from "../src/lib/signature-data";
import { validateEnvelopeFields } from "../src/lib/envelope-fields";
let original: Buffer;
mock.module("../src/lib/document-store",()=>({readStoredBytes:async()=>original}));
const {buildFinalDocument}=await import("../src/lib/final-document");
const recipients=[{name:"Alice Signer",email:"alice@example.test",role:"SIGNER",status:"SIGNED",order:1,signedAt:new Date(1000)},
{name:"Bob Signer",email:"bob@example.test",role:"SIGNER",status:"SIGNED",order:2,signedAt:new Date(2000)}];
const types=["signature","initials","text","date","checkbox"];
const fields=validateEnvelopeFields([...types.map((type,i)=>({id:`field-${i}`,type,pageNumber:1,x:10,y:10+i*10,width:60,height:6,recipientIndex:0,recipientEmail:recipients[0].email,required:true})),{id:"second-signature",type:"signature",pageNumber:1,x:20,y:65,width:60,height:6,recipientIndex:1,recipientEmail:recipients[1].email,required:true}],{pageCount:1,recipients});
const adoption=captureSignatureData({name:"Alice Signer",font:"caveat",consent:true,values:{"field-2":"Durable terms","field-3":"2026-10-04","field-4":true}},fields,recipients[0].email,new Date(1000));
const base={publicCode:"DOC-SYNTHETIC",title:"Synthetic agreement",status:"COMPLETED",pages:1,createdAt:new Date(0),sealedAt:new Date(2000),sha256:null,
contractSnapshot:freezeTemplateContract({id:"template-one",name:"Synthetic",version:"1",bodyMarkdown:"Original contract terms",pages:1},fields),
recipients:recipients.map((r,i)=>({...r,signatureData:JSON.stringify(i?captureSignatureData({name:r.name,consent:true},fields,r.email,new Date(2000)):adoption)}))};
// Empty fields are an actual array; no production data or services.
base.recipients[1].signatureData=JSON.stringify(captureSignatureData({name:"Bob Signer",consent:true},fields,"bob@example.test",new Date(2000)));
function sealed<T extends FinalEnvelope>(e: T) {
 return {...e,evidenceSha256:computeEnvelopeEvidenceDigest({id:"",publicCode:e.publicCode,title:e.title,pages:e.pages,createdAt:e.createdAt,
 documentSha256:(e as any).documentId?e.sha256:null,contractSnapshot:e.contractSnapshot,fields:(e as any).fields,recipients:e.recipients,events:[]})};
}
async function content(bytes:Buffer){
const pdf=await PDFDocument.load(bytes);const texts:string[]=[];
for(const page of pdf.getPages()){const contents=page.node.Contents();const streams=contents instanceof PDFArray?contents.asArray():contents?[contents]:[];for(const ref of streams){const stream=pdf.context.lookup(ref);if(stream instanceof PDFRawStream)texts.push(Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"));}}
return {pdf,text:texts.join("\n")};}
describe("durable adoption and real completed PDFs",()=>{
 test("explicit consent, required values and recipient ownership are enforced",()=>{
  expect(()=>captureSignatureData({name:"Alice",values:{}},fields,recipients[0].email,new Date())).toThrow("consent");
  expect(()=>captureSignatureData({name:"Alice",consent:true,values:{}},fields,recipients[0].email,new Date())).toThrow("required");
  expect(()=>captureSignatureData({name:"Bob",consent:true,values:{"field-2":"forged"}},fields,recipients[1].email,new Date())).toThrow("belong");
  expect(()=>captureSignatureData({name:"Alice",consent:true,values:{"field-2":"terms","field-3":"2026-02-30","field-4":true}},fields,recipients[0].email,new Date())).toThrow("calendar");
 });
 test("actual template PDF contains durable text/date/initials, distinct positions and checkbox lines",async()=>{
 const first=await buildFinalDocument(sealed(base)),second=await buildFinalDocument(sealed(base));expect(first.bytes).toEqual(second.bytes);
 const {pdf,text}=await content(first.bytes);expect(pdf.getPageCount()).toBe(1);
 for(const value of ["Alice Signer","Bob Signer","AS","Durable terms","2026-10-04"]){const hex=Buffer.from(value).toString("hex").toUpperCase();expect(text).toContain(hex);}
 expect(text).toContain("119");expect(text).toContain(" l");expect(text).toContain("59.5");expect(first.sha256).toBe(createHash("sha256").update(first.bytes).digest("hex"));
 });
 test("uploaded source bytes remain unchanged and output checksum is separate",async()=>{
 const source=await PDFDocument.create();source.addPage([595,842]);original=Buffer.from(await source.save());const saved=Buffer.from(original),hash=createHash("sha256").update(original).digest("hex");
 const result=await buildFinalDocument(sealed({...base,contractSnapshot:null as any,fields:JSON.stringify(fields),documentId:"doc-one",document:{storageKey:"synthetic"},sha256:hash}));expect(original).toEqual(saved);expect(result.sha256).not.toBe(hash);expect((await content(result.bytes)).pdf.getPageCount()).toBe(1);
 });
 test("separate evidence digest binds adoption values while original checksum retains its meaning",()=>{
 const input={id:"envelope-one",publicCode:base.publicCode,title:base.title,pages:1,createdAt:base.createdAt,
 documentSha256:"original-file-checksum",contractSnapshot:base.contractSnapshot,fields:JSON.stringify(fields),recipients:base.recipients,events:[]};
 const before=computeEnvelopeEvidenceDigest(input);expect(computeEnvelopeDigest(input)).toBe("original-file-checksum");
 for(const key of ["name","font","consentAcceptedAt"]){const changed={...adoption,[key]:"changed"};
 expect(computeEnvelopeEvidenceDigest({...input,recipients:[{...input.recipients[0],signatureData:JSON.stringify(changed)},input.recipients[1]]})).not.toBe(before);}
 expect(computeEnvelopeEvidenceDigest({...input,recipients:[{...input.recipients[0],signatureData:JSON.stringify({...adoption,values:{...adoption.values,"field-2":"Changed terms"}})},input.recipients[1]]})).not.toBe(before);
 expect(computeEnvelopeEvidenceDigest({...input,fields:JSON.stringify([{...fields[0],x:11}])})).not.toBe(before);
 expect(computeEnvelopeDigest({...input,fields:null})).toBe("original-file-checksum");
 });
 test("separate printable record contains actual adoption and counts while document pages stay unchanged",async()=>{
 const output=await buildFinalDocument(sealed(base)),again=await buildFinalDocument(sealed(base));
 expect(output.recordBytes).toEqual(again.recordBytes);expect(output.recordSha256).toBe(createHash("sha256").update(output.recordBytes).digest("hex"));
 const document=await content(output.bytes),record=await content(output.recordBytes);
 expect(document.pdf.getPageCount()).toBe(1);expect(record.pdf.getPageCount()).toBe(1);
 for(const text of ["EMAIL_LINK","signature positions: 2","initial positions: 1","audit events: 0"]){expect(record.text).toContain(Buffer.from(text).toString("hex").toUpperCase());}
 expect(document.text).not.toContain(Buffer.from("Completion record:").toString("hex").toUpperCase());
 });
 test("long frozen template terms paginate without truncation and report actual final pages",async()=>{
 const contractSnapshot=freezeTemplateContract({id:"template-one",name:"Synthetic",version:"1",bodyMarkdown:Array.from({length:120},(_,i)=>`Contract clause ${i}: complete immutable terms.`).join("\n"),pages:1},fields);
 const result=await buildFinalDocument(sealed({...base,contractSnapshot}));expect(result.pages).toBe(3);expect((await content(result.bytes)).pdf.getPageCount()).toBe(3);
 expect((await content(result.bytes)).text).toContain(Buffer.from("Contract clause 119: complete immutable terms.").toString("hex").toUpperCase());
 });
 test("later audit events change the record but cannot change completed document bytes",async()=>{
 const input=sealed(base),before=await buildFinalDocument(input);
 const after=await buildFinalDocument({...input,events:[{at:new Date(3000),action:"EVIDENCE_EXPORTED",actor:"Synthetic Owner",detail:"Pack exported"}]});
 expect(after.bytes).toEqual(before.bytes);expect(after.sha256).toBe(before.sha256);expect(after.recordSha256).not.toBe(before.recordSha256);
 });
 test("prototype-like field ids persist own values and round-trip into PDF",async()=>{
 const protoFields=validateEnvelopeFields([{...fields[2],id:"__proto__"}],{pageCount:1,recipients});
 const captured=captureSignatureData({name:"Alice Signer",consent:true,values:{["__proto__"]:"Durable proto value"}},protoFields,recipients[0].email,new Date(1000));
 expect(Object.hasOwn(JSON.parse(JSON.stringify(captured.values)),"__proto__")).toBe(true);
 const envelope={...base,contractSnapshot:freezeTemplateContract({id:"template-one",name:"Synthetic",version:"1",bodyMarkdown:"Original terms",pages:1},protoFields),recipients:[{...base.recipients[0],signatureData:JSON.stringify(captured)},base.recipients[1]]};
 const output=await buildFinalDocument(sealed(envelope));expect((await content(output.bytes)).text).toContain(Buffer.from("Durable proto value").toString("hex").toUpperCase());
 });
 test("tampering durable values is rejected against the original seal",async()=>{
 const frozen=sealed(base);
 const changed={...adoption,values:{...adoption.values,"field-2":"Tampered terms"}};
 await expect(buildFinalDocument({...frozen,recipients:[{...base.recipients[0],signatureData:JSON.stringify(changed)},base.recipients[1]]})).rejects.toThrow("recorded seal");
 });
 test("missing historical adoption and unsupported glyphs fail closed",async()=>{
 await expect(buildFinalDocument(sealed({...base,recipients:base.recipients.map(r=>({...r,signatureData:null as any}))}))).rejects.toThrow("Historical");
 const changed={...adoption,values:{...adoption.values,"field-2":"漢字"}};
 await expect(buildFinalDocument(sealed({...base,recipients:[{...base.recipients[0],signatureData:JSON.stringify(changed)},base.recipients[1]]}))).rejects.toThrow("character");
 });
});
