import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { NextRequest } from "next/server";
import { canonicalJson } from "../src/lib/canonical-json";
import { computeEnvelopeDigest } from "../src/lib/esign";
import { readConsentSnapshot } from "../src/lib/consent";

// Own process; synthetic in-memory rows, ephemeral evidence key, no services,
// dotenv, stored database, original repository data or provider calls.
let template: any;
let envelope: any;
let signers: any[];
let events: any[];
let creations = 0;
const originalBody = "# Frozen agreement\n\nThe contract terms presented when sent.";
const changedBody = "# Changed template\n\nThese later terms must never enter the sent contract.";
const syntheticPdf = await PDFDocument.create(); syntheticPdf.addPage([595,842]);
const document = Buffer.from(await syntheticPdf.save());
const checksum = createHash("sha256").update(document).digest("hex");
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
const tenant = { id: "tenant-one", name: "Synthetic tenant", status: "ACTIVE", esignPrefs: null };
const db = {
  tenant: { findUnique: async () => tenant }, member: { findFirst: async () => ({ id: "member-one" }) },
  notificationSettings: { findUnique: async () => null },
  platformSetting: { findUnique: async () => ({ smtpHost: "smtp.fixture.invalid", smtpFrom: "Fixture <notifications@example.test>" }) },
  template: { findFirst: async () => template, update: async () => {} },
  document: { findFirst: async () => ({ id: "document-one", tenantId: tenant.id, pageCount: 1, sha256: checksum, filename: "synthetic.pdf", storageKey: "synthetic-only" }) },
  envelope: {
    create: async ({ data }: any) => { creations++; envelope = { id: "envelope-one", ...data, tenant,
      createdBy: { firstName: "Fixture", lastName: "Owner", email: "owner@example.test" }, template,
      document: data.documentId ? await db.document.findFirst() : null }; return envelope; },
    findFirst: async () => ({ ...envelope, recipients: signers, events }),
    update: async ({ data }: any) => { Object.assign(envelope, data); return envelope; },
  },
  recipient: {
    createMany: async ({ data }: any) => { signers = data.map((r: any, i: number) => ({ ...r, id: `signer-${i}`, signedAt: null })); },
    findUnique: async ({where}: any) => where.accessToken === "invalid" ? null : ({ ...(where.accessToken === "cc-synthetic" ? signers.find(r => r.role === "CC") : signers[0]), envelope: { ...envelope, recipients: signers, events } }),
    update: async ({ data }: any) => { Object.assign(signers[0], data); return signers[0]; },
    findMany: async () => signers,
  },
  envelopeEvent: {
    createMany: async ({ data }: any) => { events.push(...data); },
    create: async ({ data }: any) => { events.push(data); }, findMany: async () => events,
  },
  mailOutbox: { createMany: async () => {}, create: async () => {} }, domain: { findFirst: async () => null },
  $transaction: async (fn: any) => fn(db),
};
mock.module("../src/lib/db", () => ({ db }));
mock.module("../src/lib/auth", () => ({ requireUser: async () => ({ id: "owner-one", tenantId: tenant.id, firstName: "Fixture", lastName: "Owner" }), recordAudit: async () => {} }));
mock.module("../src/lib/settings-handlers", () => ({ getSettingsSection: async () => {}, postSettingsOp: async () => {} }));
mock.module("../src/lib/transaction", () => ({ serializableTransaction: async (fn: any) => fn(db) }));
mock.module("../src/lib/billing", () => ({ currentAllowance: async () => ({ used: 0, total: 100 }), reserveEnvelopeAllowance: async () => ({}) }));
mock.module("../src/lib/webhooks", () => ({ queueEnvelopeEvent: async () => {}, retryFailedDeliveries: async () => {}, dispatchEnvelopeEvent: async () => {} }));
mock.module("../src/lib/mail", () => ({ processOutbox: async () => {} }));
mock.module("../src/lib/attestation", () => ({ pushAttestationForEnvelope: async () => ({ pushed: false }) }));
mock.module("../src/lib/document-store", () => ({ MAX_UPLOAD_BYTES: 50 * 1024 * 1024, readStoredBytes: async () => document }));
mock.module("../src/components/marketing/public-sign", () => ({ PublicSign: () => null }));
mock.module("../src/lib/evidence-key", () => ({
  EVIDENCE_SIGNATURE_ALGORITHM: "RSASSA-PKCS1-v1_5-SHA-256",
  getOrCreateEvidenceKey: async () => ({ privateKeyPem, publicKeyPem, certificatePem: "synthetic-certificate", keyId: "synthetic-key",
    thumbprint: "synthetic-thumbprint", sanDomain: null, createdAt: new Date(0) }),
  signPayload: (key: string, payload: unknown) => sign("RSA-SHA256", Buffer.from(canonicalJson(payload)), key).toString("base64"),
}));
mock.module("../src/lib/transparency", () => ({
  TRANSPARENCY_FORMAT: "synthetic-transparency", appendSealCommitment: async () => ({ seq: 1, payloadHash: "synthetic", prevHead: null, head: "synthetic", at: new Date(1000) }),
  getChainSegment: async () => ({ segment: [], truncated: false }), signCheckpoint: () => ({ synthetic: true }),
}));
const dedicated = await import("../src/app/api/workspace/envelopes/route");
const legacy = await import("../src/app/api/workspace/[section]/route");
const completedApi = await import("../src/app/api/sign/[token]/completed/route");
const signApi = await import("../src/app/api/sign/[token]/route");
const { default: SignPage } = await import("../src/app/sign/[token]/page");
const { buildEvidencePack } = await import("../src/lib/evidence-pack");
const send = (route: { POST: (...args: any[]) => Promise<Response> } = dedicated, extra: Record<string, unknown> = {}) => route.POST(new NextRequest("http://localhost/api/workspace/envelopes", {
  method: "POST", body: JSON.stringify({ op: "send", data: { title: "Frozen agreement", templateId: "template-one",
    recipients: [{ name: "Fixture Signer", email: "signer@example.test", role: "SIGNER" }], ...extra } }),
}), { params: Promise.resolve({ section: "envelopes" }) });
const signing = (extra: Record<string, unknown> = {}) => signApi.POST(new NextRequest("http://localhost/api/sign/synthetic", {
  method: "POST", body: JSON.stringify({ op: "sign", consent: true, consentDigest: readConsentSnapshot(envelope.consentSnapshot).digest, consentVersion: readConsentSnapshot(envelope.consentSnapshot).version, name: "Fixture Signer", font: "caveat", ...extra }),
}), { params: Promise.resolve({ token: "synthetic" }) });
function filesInZip(bytes: Buffer) {
  const files = new Map<string, Buffer>(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const path = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"), start = offset + 30 + nameLength + extraLength;
    files.set(path, bytes.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
beforeEach(() => {
  template = { id: "template-one", name: "Original template", version: "1.0.0", pages: 1, bodyMarkdown: originalBody };
  envelope = null; signers = []; events = []; creations = 0;
});
describe("immutable template contracts", () => {
  for (const [name, route] of [["dedicated", dedicated], ["legacy", legacy]] as const) {
    test(`${name} send freezes server-authoritative content instead of client snapshot`, async () => {
      expect((await send(route, { contractSnapshot: { bodyMarkdown: "attacker-controlled" } })).status).toBe(200);
      expect(typeof envelope.contractSnapshot).toBe("string");
      expect(JSON.parse(envelope.contractSnapshot).bodyMarkdown).toBe(originalBody);
      template.bodyMarkdown = changedBody; template.name = "Changed name"; template.pages = 9;
      const page = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
      expect(page.props.state.bodyMarkdown).toBe(originalBody);
      expect(page.props.state.pages).toBe(1);
    });
  }
  test("template edits after signing cannot change export contract or completed checksum", async () => {
    expect((await send()).status).toBe(200);
    expect((await signing()).status).toBe(200);
    const sealedChecksum = envelope.sha256;
    const first = filesInZip((await buildEvidencePack(envelope.id, tenant.id)).bytes);
    template.bodyMarkdown = changedBody; template.name = "Changed name";
    const second = filesInZip((await buildEvidencePack(envelope.id, tenant.id)).bytes);
    expect(second.get("document/contract-text.md")!.toString("utf8")).toBe(originalBody);
    expect(second.get("document/contract-text.md")).toEqual(first.get("document/contract-text.md"));
    expect(envelope.sha256).toBe(sealedChecksum);
    const manifest = JSON.parse(second.get("manifest.json")!.toString("utf8"));
    expect(manifest.payload.envelope.sha256).toBe(sealedChecksum);
    expect(verify("RSA-SHA256", Buffer.from(canonicalJson(manifest.payload)), publicKeyPem, Buffer.from(manifest.signature, "base64"))).toBe(true);
  });
  test("late Unicode export ledger remains signed while both completed PDF artifacts stay stable", async () => {
    expect((await send()).status).toBe(200);expect((await signing()).status).toBe(200);
    const before=filesInZip((await buildEvidencePack(envelope.id,tenant.id)).bytes);
    for(const action of ["EVIDENCE_EXPORTED","ATTESTED","DOCUMENT_VIEWED"])events.push({
      envelopeId:envelope.id,at:new Date(envelope.sealedAt),actor:"Later \u{1f680} Owner",action,detail:"Equal-clock later activity retained in current ledger"});
    const after=filesInZip((await buildEvidencePack(envelope.id,tenant.id)).bytes);
    expect(after.get("document/completed.pdf")).toEqual(before.get("document/completed.pdf"));
    expect(after.get("completion/record.pdf")).toEqual(before.get("completion/record.pdf"));
    const csv=after.get("evidence/event-ledger.csv")!.toString("utf8");
    expect(csv).toContain("Later \u{1f680} Owner");
    for(const action of ["EVIDENCE_EXPORTED","ATTESTED","DOCUMENT_VIEWED"])expect(csv).toContain(action);
    const manifest=JSON.parse(after.get("manifest.json")!.toString("utf8"));
    const ledger=manifest.payload.artifacts.find((a:any)=>a.path==="evidence/event-ledger.csv");
    expect(ledger.sha256).toBe(createHash("sha256").update(after.get(ledger.path)!).digest("hex"));
    expect(verify("RSA-SHA256",Buffer.from(canonicalJson(manifest.payload)),publicKeyPem,Buffer.from(manifest.signature,"base64"))).toBe(true);
  });
  test("template digest binds frozen body and locations, not just template identity", async () => {
    expect((await send()).status).toBe(200);
    const input = { id: envelope.id, publicCode: envelope.publicCode, title: envelope.title, pages: 1,
      createdAt: new Date(0), recipients: [], events: [], contractSnapshot: envelope.contractSnapshot };
    const before = computeEnvelopeDigest(input);
    const snapshot = JSON.parse(envelope.contractSnapshot); snapshot.bodyMarkdown = changedBody;
    expect(computeEnvelopeDigest({ ...input, contractSnapshot: JSON.stringify(snapshot) })).not.toBe(before);
    snapshot.bodyMarkdown = originalBody; snapshot.signatureLocations = [{ id: "changed-location" }];
    expect(computeEnvelopeDigest({ ...input, contractSnapshot: JSON.stringify(snapshot) })).not.toBe(before);
    template.bodyMarkdown = changedBody;
    expect(computeEnvelopeDigest(input)).toBe(before);
  });
  test("legacy active templates without provable snapshot fail closed for signing and display", async () => {
    expect((await send()).status).toBe(200); envelope.contractSnapshot = null;
    expect((await signing()).status).toBe(409);
    expect(signers[0].status).toBe("PENDING");
    const page = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
    expect(page.props.state.phase).toBe("unavailable");
    expect(page.props.state.bodyMarkdown).toBeUndefined();
  });
  test("legacy completed templates without provable snapshot cannot export live replacement body", async () => {
    expect((await send()).status).toBe(200); expect((await signing()).status).toBe(200); envelope.contractSnapshot = null;
    await expect(buildEvidencePack(envelope.id, tenant.id)).rejects.toMatchObject({ status: 409 });
  });
  test("ambiguous upload and template sends are rejected", async () => {
    expect((await send(dedicated, { documentId: "document-one" })).status).toBe(400);
    expect(creations).toBe(0);
  });
  test("uploaded-only completion preserves original checksum and exports separate final PDF", async () => {
    expect((await send(dedicated, { documentId: "document-one", templateId: null })).status).toBe(200);
    expect((await signing()).status).toBe(200); expect(envelope.sha256).toBe(checksum);
    envelope.document.filename="completed.pdf";
    const files=filesInZip((await buildEvidencePack(envelope.id,tenant.id)).bytes);
    expect(files.get("document/original.pdf")).toEqual(document);
    expect(files.get("document/completed.pdf")!.equals(document)).toBe(false);
  });
  test("deleted template relation does not discard frozen terms", async () => {
    expect((await send()).status).toBe(200);
    envelope.templateId = null; envelope.template = null;
    const page = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
    expect(page.props.state.bodyMarkdown).toBe(originalBody);
    expect((await signing()).status).toBe(200);
    const files = filesInZip((await buildEvidencePack(envelope.id, tenant.id)).bytes);
    expect(files.get("document/contract-text.md")!.toString("utf8")).toBe(originalBody);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    const snapshotArtifact = manifest.payload.artifacts.find((a: any) => a.path === "evidence/contract-snapshot.json");
    expect(snapshotArtifact.sha256).toBe(createHash("sha256").update(files.get(snapshotArtifact.path)!).digest("hex"));
  });
  test("title-only signing is rejected without reserving an invisible contract", async () => {
    expect((await send(dedicated, { templateId: null })).status).toBe(400);
    expect(creations).toBe(0);
  });
  test("recipient-bound required values and consent are captured before completion", async () => {
    const fields = [{ id:"required-text",type:"text",pageNumber:1,x:10,y:20,width:50,height:8,recipientIndex:0,recipientEmail:"signer@example.test",required:true }];
    expect((await send(dedicated,{fields})).status).toBe(200);
    expect((await signing({consent:false})).status).toBe(400); expect(signers[0].status).toBe("PENDING");
    expect((await signing()).status).toBe(400); expect(signers[0].status).toBe("PENDING");
    expect((await signing({values:{"foreign-field":"forged","required-text":"Durable"}})).status).toBe(400);
    expect((await signing({values:{"required-text":"Durable"}})).status).toBe(200);
    expect(JSON.parse(signers[0].signatureData).values["required-text"]).toBe("Durable");
    const pack=filesInZip((await buildEvidencePack(envelope.id,tenant.id)).bytes);
    expect(pack.get("document/completed.pdf")!.subarray(0,5).toString()).toBe("%PDF-");
    const manifest=JSON.parse(pack.get("manifest.json")!.toString());
    expect(manifest.payload.envelope.finalDocumentSha256).toBe(createHash("sha256").update(pack.get("document/completed.pdf")!).digest("hex"));
  });
  test("completed PDF and record require a valid active completed recipient token", async () => {
    const download=(token="synthetic",format="")=>completedApi.GET(new NextRequest(`http://localhost/api/sign/${token}/completed${format}`),{params:Promise.resolve({token})});
    expect((await send()).status).toBe(200);expect((await download()).status).toBe(409);
    expect((await download("invalid")).status).toBe(404);expect((await signing()).status).toBe(200);
    const pdf=await download();expect(pdf.status).toBe(200);expect(pdf.headers.get("cache-control")).toBe("no-store");
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(100);
    const recordPdf=await download("synthetic","?format=record-pdf");expect(recordPdf.status).toBe(200);expect(recordPdf.headers.get("content-type")).toBe("application/pdf");
    const record=await download("synthetic","?format=record");expect(record.status).toBe(200);
    const summary=await record.json();expect(summary.conformance).toBeNull();
    expect(summary.finalDocumentSha256).toBe(pdf.headers.get("x-document-sha256"));expect(summary.completionRecordSha256).toBe(recordPdf.headers.get("x-document-sha256"));
    expect(JSON.stringify(summary)).not.toContain("accessToken");expect(JSON.stringify(summary)).not.toContain("signatureData");
    signers[0].role="APPROVER";expect((await download()).status).toBe(409);signers[0].role="SIGNER";
    signers.push({id:"copy-one",name:"Copy",email:"copy@example.test",role:"CC",order:2,status:"PENDING"});expect((await download("cc-synthetic")).status).toBe(200);
    envelope.document={tenantId:"another-tenant",storageKey:"never-read"};expect((await download()).status).toBe(409);envelope.document=null;
    envelope.tenant={...tenant,status:"SUSPENDED"};expect((await download()).status).toBe(409);
  });
  test("empty template cannot create an envelope with an invisible contract", async () => {
    template.bodyMarkdown = "   "; expect((await send()).status).toBe(400); expect(creations).toBe(0);
  });
});
