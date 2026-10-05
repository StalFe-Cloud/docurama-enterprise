import type { FinalEnvelope } from "../src/lib/final-document";
import { computeEnvelopeDigest, computeEnvelopeEvidenceDigest } from "../src/lib/esign";
import { describe, expect, mock, test } from "bun:test";
import { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream, degrees } from "pdf-lib";
import { createHash } from "node:crypto";
import { freezeTemplateContract } from "../src/lib/contract-snapshot";
import { captureSignatureData as capture } from "../src/lib/signature-data";
import { resolveConsentTerms, freezeConsentTerms } from "../src/lib/consent";
const consentTerms=resolveConsentTerms(null);
function captureSignatureData(body:Parameters<typeof capture>[0],fields:Parameters<typeof capture>[1],email:string,at:Date) {
 return capture({consentDigest:consentTerms.digest,consentVersion:consentTerms.version,...body},fields,email,at,consentTerms);
}
import { validateEnvelopeFields } from "../src/lib/envelope-fields";
let original: Buffer;
let storageUnavailable=false;
let lastReadLimits: { timeoutMs?: number; maxBytes?: number } | undefined;
mock.module("../src/lib/document-store",()=>({MAX_UPLOAD_BYTES:50*1024*1024,readStoredBytes:async(_key:string,limits?:{timeoutMs?:number;maxBytes?:number})=>{lastReadLimits=limits;if(storageUnavailable)throw new Error("missing synthetic storage");return original;}}));
const {buildFinalDocument,preflightSignatureDocument,completionRecordEvents}=await import("../src/lib/final-document");
const recipients=[{name:"Alice Signer",email:"alice@example.test",role:"SIGNER",status:"SIGNED",order:1,signedAt:new Date(1000)},
{name:"Bob Signer",email:"bob@example.test",role:"SIGNER",status:"SIGNED",order:2,signedAt:new Date(2000)}];
const types=["signature","initials","text","date","checkbox"];
const fields=validateEnvelopeFields([...types.map((type,i)=>({id:`field-${i}`,type,pageNumber:1,x:10,y:10+i*10,width:60,height:6,recipientIndex:0,recipientEmail:recipients[0].email,required:true})),{id:"second-signature",type:"signature",pageNumber:1,x:20,y:65,width:60,height:6,recipientIndex:1,recipientEmail:recipients[1].email,required:true}],{pageCount:1,recipients});
const adoption=captureSignatureData({name:"Alice Signer",font:"caveat",consent:true,values:{"field-2":"Durable terms","field-3":"2026-10-04","field-4":true}},fields,recipients[0].email,new Date(1000));
const base={consentSnapshot:freezeConsentTerms(null),publicCode:"DOC-SYNTHETIC",title:"Synthetic agreement",status:"COMPLETED",pages:1,createdAt:new Date(0),sealedAt:new Date(2000),sha256:null,
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
 for(const text of ["EMAIL_LINK","signature positions: 2","initial positions: 1","completion events: 0"]){expect(record.text).toContain(Buffer.from(text).toString("hex").toUpperCase());}
 expect(document.text).not.toContain(Buffer.from("Completion record:").toString("hex").toUpperCase());
 });
 test("long frozen template terms paginate without truncation and report actual final pages",async()=>{
 const contractSnapshot=freezeTemplateContract({id:"template-one",name:"Synthetic",version:"1",bodyMarkdown:Array.from({length:120},(_,i)=>`Contract clause ${i}: complete immutable terms.`).join("\n"),pages:1},fields);
 const result=await buildFinalDocument(sealed({...base,contractSnapshot}));expect(result.pages).toBe(3);expect((await content(result.bytes)).pdf.getPageCount()).toBe(3);
 expect((await content(result.bytes)).text).toContain(Buffer.from("Contract clause 119: complete immutable terms.").toString("hex").toUpperCase());
 });
 test("late ASCII and Unicode audit activity cannot change either completed artifact",async()=>{
 const initialEvents=[{at:new Date(1000),action:"SIGNED",actor:"Alice Signer",detail:"Initial signer adoption"},
  {at:new Date(2000),action:"SIGNED",actor:"Bob Signer",detail:"Final signer adoption"},
  {at:new Date(2000),action:"SEALED",actor:"Docurama",detail:"All signers complete"}];
 const input=sealed({...base,events:initialEvents}),before=await buildFinalDocument(input);
 for(const actor of ["Synthetic Owner","Synthetic \u{1f680} Owner"]) {
  const later=[...initialEvents,{at:new Date(3000),action:"EVIDENCE_EXPORTED",actor,detail:"Pack exported"},
   {at:new Date(3000),action:"ATTESTED",actor,detail:"Later verification activity"},
   {at:new Date(3000),action:"DOCUMENT_VIEWED",actor,detail:"Later preview"},
   {at:new Date(3000),action:"UNKNOWN_LATER_ACTIVITY",actor,detail:"Later activity beyond seal"}];
  const after=await buildFinalDocument({...input,events:later});
  expect(after.bytes).toEqual(before.bytes);expect(after.sha256).toBe(before.sha256);
  expect(after.recordBytes).toEqual(before.recordBytes);expect(after.recordSha256).toBe(before.recordSha256);
  expect(later).toHaveLength(7);expect(completionRecordEvents({...input,events:later})).toHaveLength(3);
 }
 });
 test("equal-clock export, attestation and preview activity are excluded without hiding full source ledger",async()=>{
  const originalEvents=[{at:new Date(2000),action:"SIGNED",actor:"Bob Signer",detail:"Final signature"},
   {at:new Date(2000),action:"SEALED",actor:"Docurama",detail:"Sealed"}];
  const input=sealed({...base,events:originalEvents}),before=await buildFinalDocument(input);
  const events=[...originalEvents,...["EVIDENCE_EXPORTED","ATTESTED","DOCUMENT_VIEWED"].map(action=>({
   at:new Date(2000),action,actor:"Post-completion \u{1f680}",detail:"Equal-clock later activity"}))];
  const unchanged=JSON.stringify(events),after=await buildFinalDocument({...input,events});
  expect(after.recordBytes).toEqual(before.recordBytes);expect(after.recordSha256).toBe(before.recordSha256);
  expect(JSON.stringify(events)).toBe(unchanged);expect(events).toHaveLength(5);
  expect(completionRecordEvents({...input,events}).map(e=>e.action)).toEqual(["SIGNED","SEALED"]);
 });
 test("timestamp ties render deterministically and prospective final ledger matches actual persisted order",async()=>{
  const events=[{at:new Date(0),action:"CREATED",actor:"Sender",detail:"Created"},
   {at:new Date(0),action:"SENT",actor:"Docurama",detail:"Sent"},
   {at:new Date(2000),action:"SIGNED",actor:"Alice Signer",detail:"First signed"},
   {at:new Date(2000),action:"SIGNED",actor:"Bob Signer",detail:"Final signed"},
   {at:new Date(2000),action:"SEALED",actor:"Docurama",detail:"Sealed"}];
  const persisted=[events[4],events[1],events[3],events[0],events[2]];
  const first=await buildFinalDocument(sealed({...base,events}));
  const second=await buildFinalDocument(sealed({...base,events:persisted}));
  expect(second.recordBytes).toEqual(first.recordBytes);expect(second.recordSha256).toBe(first.recordSha256);
  expect(completionRecordEvents({...base,events:persisted}).map(e=>e.action)).toEqual(["CREATED","SENT","SIGNED","SIGNED","SEALED"]);
  expect((await content(first.recordBytes)).text).toContain(Buffer.from("completion events: 5").toString("hex").toUpperCase());
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
 test("export keeps completion and immutable seal guards after preflight sharing",async()=>{
  await expect(buildFinalDocument({...sealed(base),status:"PARTIALLY_SIGNED"})).rejects.toThrow("after all signers");
  await expect(buildFinalDocument({...sealed(base),sealedAt:null})).rejects.toThrow("after all signers");
  await expect(buildFinalDocument(sealed({...base,recipients:[base.recipients[0],{...base.recipients[1],status:"PENDING",signedAt:null,signatureData:null as any}]}))).rejects.toThrow("All required signers");
  await expect(buildFinalDocument({...base,evidenceSha256:null})).rejects.toThrow("recorded seal");
 });
 test("v2 adoption binds frozen consent text, version and digest even after resealing",async()=>{
  for(const preferences of [{consentText:"Other reviewed terms",consentVersion:consentTerms.version},
   {consentText:consentTerms.text,consentVersion:"different-v2"}]) {
   await expect(buildFinalDocument(sealed({...base,consentSnapshot:freezeConsentTerms(preferences)}))).rejects.toThrow("frozen consent terms");
  }
  await expect(buildFinalDocument(sealed({...base,consentSnapshot:null}))).rejects.toThrow("Historical consent");
  const changed={...adoption,consentDigest:"0".repeat(64)};
  await expect(buildFinalDocument(sealed({...base,recipients:[{...base.recipients[0],signatureData:JSON.stringify(changed)},base.recipients[1]]}))).rejects.toThrow("Invalid frozen consent");
  const result=await buildFinalDocument(sealed(base));
  expect((await content(result.recordBytes)).text).toContain(Buffer.from(`Consent version: ${consentTerms.version}`).toString("hex").toUpperCase());
 });
 test("historical version-one exports retain recorded wording without invented consent metadata",async()=>{
  const legacyConsent="Historical recorded wording retained exactly.";
  const legacyRecipients=base.recipients.map(r=>{
   const data=JSON.parse(r.signatureData);delete data.consentDigest;delete data.consentVersion;
   return {...r,signatureData:JSON.stringify({...data,version:1,consent:legacyConsent})};
  });
  const record=await content((await buildFinalDocument(sealed({...base,consentSnapshot:null,recipients:legacyRecipients}))).recordBytes);
  expect(record.text).toContain(Buffer.from(legacyConsent).toString("hex").toUpperCase());
  expect(record.text).not.toContain(Buffer.from("Consent version:").toString("hex").toUpperCase());
  expect(record.text).not.toContain(Buffer.from(consentTerms.text).toString("hex").toUpperCase());
 });
 test("missing historical adoption and unsupported glyphs fail closed",async()=>{
 await expect(buildFinalDocument(sealed({...base,recipients:base.recipients.map(r=>({...r,signatureData:null as any}))}))).rejects.toThrow("Historical");
 const changed={...adoption,values:{...adoption.values,"field-2":"漢字"}};
 await expect(buildFinalDocument(sealed({...base,recipients:[{...base.recipients[0],signatureData:JSON.stringify(changed)},base.recipients[1]]}))).rejects.toThrow("character");
 });
});

describe("precommit PDF deliverability", () => {
 const draft = (): FinalEnvelope => ({...base,status:"SENT",sealedAt:null,
   recipients:base.recipients.map(r=>({...r,status:"PENDING",signedAt:null,signatureData:null}))});
 const proposal = (data=adoption) => ({email:recipients[0].email,order:1,signatureData:JSON.stringify(data)});
 const withFields = (locations:typeof fields) => ({...draft(),contractSnapshot:freezeTemplateContract({id:"template-one",name:"Synthetic",version:"1",bodyMarkdown:"Original contract terms",pages:1},locations)});
 async function uploaded(change?: (pdf:PDFDocument)=>void):Promise<FinalEnvelope> {
   const pdf=await PDFDocument.create();pdf.addPage([595,842]);change?.(pdf);
   original=Buffer.from(await pdf.save());
   return {...draft(),contractSnapshot:null,documentId:"doc-one",document:{storageKey:"synthetic"},fields:JSON.stringify(fields),
     sha256:createHash("sha256").update(original).digest("hex")};
 }
 test("valid first and later proposals render without mutating envelope or adoption evidence",async()=>{
   const first=draft(),before=JSON.stringify(first);
   await preflightSignatureDocument(first,proposal());expect(JSON.stringify(first)).toBe(before);
   const partial={...first,status:"PARTIALLY_SIGNED",recipients:[base.recipients[0],first.recipients[1]]};
   const previous=JSON.stringify(partial);
   await preflightSignatureDocument(partial,{email:recipients[1].email,order:2,signatureData:base.recipients[1].signatureData});
   expect(JSON.stringify(partial)).toBe(previous);
 });
 test("positive but tiny geometry and allowed long text cannot commit unrenderable values",async()=>{
   await expect(preflightSignatureDocument(withFields(fields.map(f=>f.id==="field-2"?{...f,width:0.01}:f)),proposal())).rejects.toThrow("fit");
   await expect(preflightSignatureDocument(withFields(fields.map(f=>f.id==="second-signature"?{...f,height:0.001}:f)),proposal())).rejects.toThrow("fit");
   await expect(preflightSignatureDocument(withFields(fields.map(f=>f.id==="field-4"?{...f,width:0.001,height:0.001}:f)),proposal())).rejects.toThrow("too small");
   const long=captureSignatureData({name:"Alice Signer",font:"caveat",consent:true,values:{"field-2":"W".repeat(2000),"field-3":"2026-10-04","field-4":true}},fields,recipients[0].email,new Date(1000));
   expect(long.values["field-2"]).toHaveLength(2000);
   await expect(preflightSignatureDocument(draft(),proposal(long))).rejects.toThrow("fit");
   const name=captureSignatureData({name:"W".repeat(200),font:"caveat",consent:true,values:{"field-2":"Terms","field-3":"2026-10-04","field-4":true}},fields,recipients[0].email,new Date(1000));
   await expect(preflightSignatureDocument(draft(),proposal(name))).rejects.toThrow("fit");
 });
 test("authoritative PDF rotation and crop reject before signing",async()=>{
   await expect(preflightSignatureDocument(await uploaded(pdf=>pdf.getPage(0).setRotation(degrees(90))),proposal())).rejects.toThrow("Rotated");
   await expect(preflightSignatureDocument(await uploaded(pdf=>pdf.getPage(0).setCropBox(10,10,400,700)),proposal())).rejects.toThrow("cropped");
 });
 test("missing, encrypted-marked, corrupt and checksum-mismatched originals reject",async()=>{
   const e=await uploaded();storageUnavailable=true;
   try {await expect(preflightSignatureDocument(e,proposal())).rejects.toThrow("unavailable");} finally {storageUnavailable=false;}
   const encrypted=await uploaded(pdf=>{pdf.context.trailerInfo.Encrypt=pdf.context.register(pdf.context.obj({Filter:"Standard"}));});
   await expect(preflightSignatureDocument(encrypted,proposal())).rejects.toThrow("encrypted");
   original=Buffer.from("not a PDF");const corrupt={...e,sha256:createHash("sha256").update(original).digest("hex")};
   await expect(preflightSignatureDocument(corrupt,proposal())).rejects.toThrow("unsupported");
   const bound=await uploaded();
   await expect(preflightSignatureDocument({...bound,tenantId:"tenant-one",document:{storageKey:"synthetic",tenantId:"tenant-two"}},proposal())).rejects.toThrow("workspace binding");
   await expect(preflightSignatureDocument({...bound,pages:2},proposal())).rejects.toThrow("page count");
   const valid=await uploaded();original=Buffer.from("mutated source");
   await expect(preflightSignatureDocument(valid,proposal())).rejects.toThrow("checksum");
 });
 test("allowed metadata and terms must fit the real completion record and document",async()=>{
   await expect(preflightSignatureDocument({...draft(),title:"W".repeat(400)},proposal())).rejects.toThrow("completion-record");
   const contractSnapshot=freezeTemplateContract({id:"template-one",name:"Synthetic",version:"1",bodyMarkdown:"W".repeat(400),pages:1},fields);
   await expect(preflightSignatureDocument({...draft(),contractSnapshot},proposal())).rejects.toThrow("contract line");
   for(const actor of ["W".repeat(400),"Unsupported \u{1f680}"]) {
     await expect(preflightSignatureDocument({...draft(),events:[{action:"SIGNED",actor,at:new Date(1000),detail:"Prospective signed event"}]},proposal())).rejects.toThrow();
   }
 });
 test("proposal consent and record metadata reject before signing without changing prior evidence",async()=>{
   const e=draft(),before=JSON.stringify(e);
   for(const consentSnapshot of [null,freezeConsentTerms({consentText:"Different tenant terms",consentVersion:consentTerms.version})]) {
     await expect(preflightSignatureDocument({...e,consentSnapshot},proposal())).rejects.toThrow();
   }
   const terms=resolveConsentTerms({consentText:"Reviewed terms",consentVersion:"W".repeat(128)});
   const data=capture({name:"Alice Signer",font:"caveat",consent:true,consentDigest:terms.digest,consentVersion:terms.version,
     values:{"field-2":"Durable terms","field-3":"2026-10-04","field-4":true}},fields,recipients[0].email,new Date(1000),terms);
   await expect(preflightSignatureDocument({...e,consentSnapshot:JSON.stringify(terms)},proposal(data))).rejects.toThrow("completion-record");
   expect(JSON.stringify(e)).toBe(before);
 });
 test("uploaded preflight preserves authoritative bytes and rejects already-signed proposals",async()=>{
   const e=await uploaded(),bytes=Buffer.from(original),before=JSON.stringify(e);
   await preflightSignatureDocument(e,proposal());expect(original).toEqual(bytes);expect(JSON.stringify(e)).toBe(before);
   expect(lastReadLimits).toEqual({timeoutMs:8000,maxBytes:50*1024*1024});
   await buildFinalDocument(sealed({...base,contractSnapshot:null,documentId:e.documentId,document:e.document,fields:e.fields,sha256:e.sha256}));expect(lastReadLimits).toBeUndefined();
   await expect(preflightSignatureDocument({...e,recipients:[base.recipients[0],e.recipients[1]]},proposal())).rejects.toThrow("Invalid proposed");
   await expect(preflightSignatureDocument({...e,status:"COMPLETED"},proposal())).rejects.toThrow("can no longer");
 });
 test("wrong recipient and absent immutable source reject without touching state",async()=>{
   const e=draft(),before=JSON.stringify(e);
   await expect(preflightSignatureDocument(e,{...proposal(),email:"foreign@example.test"})).rejects.toThrow("Invalid proposed");
   await expect(preflightSignatureDocument({...e,contractSnapshot:null},proposal())).rejects.toThrow();
   expect(JSON.stringify(e)).toBe(before);
 });
});
