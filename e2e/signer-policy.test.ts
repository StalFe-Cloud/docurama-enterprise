import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { freezeTemplateContract } from "../src/lib/contract-snapshot";
import { freezeConsentTerms, readConsentSnapshot } from "../src/lib/consent";

// Own process, synthetic in-memory rows and real generated PDFs; no database, dotenv or network.
let recipient: any;
let writes = 0;
let reads = 0;
let completed: any;
const template = { id: "synthetic-template", name: "Synthetic agreement", version: "1", bodyMarkdown: "Synthetic contract terms reviewed before signing.", pages: 1 };
const uploadedPdf = await PDFDocument.create(); uploadedPdf.addPage([612, 792]);
const uploadedBytes = Buffer.from(await uploadedPdf.save());
const uploadedSha256 = createHash("sha256").update(uploadedBytes).digest("hex");
const fixture = () => ({
  id: "signer-one", name: "Fixture Signer", email: "signer@example.test", role: "SIGNER", order: 1, status: "PENDING",
  envelope: {
    id: "envelope-one", documentId: null, templateId: template.id, contractSnapshot: freezeTemplateContract(template),
    consentSnapshot: freezeConsentTerms({ consentText: "Reviewed synthetic consent for this contract.", consentVersion: "fixture-v7" }), publicCode: "DOC-FIXTURE", title: "Synthetic agreement", pages: 1,
    tenantId: "tenant-one", status: "SENT", createdAt: new Date(0), sha256: "original-document-checksum",
    tenant: { name: "Fixture tenant", status: "ACTIVE", esignPrefs: { signatureLevel: "simple", requireReauth: false, part11Mode: false } },
    recipients: [{ id: "signer-one", name: "Fixture Signer", email: "signer@example.test", role: "SIGNER", order: 1, status: "PENDING" }],
    createdBy: { email: "owner@example.test" }, fields: null, template: null, events: [], sealedAt: null,
    document: null,
  },
});
const db = {
  recipient: {
    findUnique: async ({ include }: any) => {
      // Model the selected Prisma relationships: a missing policy projection
      // must not pass merely because the test fixture contains that property.
      const tenantSelect = include?.envelope?.include?.tenant?.select;
      const tenant = recipient.envelope.tenant;
      const projectedTenant = tenantSelect ? Object.fromEntries(Object.keys(tenantSelect).map((key) => {
        const nested = tenantSelect[key]?.select;
        return [key, nested && tenant[key] ? Object.fromEntries(Object.keys(nested).map(field => [field, tenant[key][field]])) : tenant[key]];
      })) : undefined;
      return { ...recipient, envelope: { ...recipient.envelope, tenant: projectedTenant } };
    },
    update: async ({ data }: any) => { writes++; recipient = { ...recipient, ...data }; return recipient; },
    findMany: async () => [{ ...recipient, status: "SIGNED" }],
  },
  mailOutbox: { create: async () => {}, createMany: async () => {} },
  domain: { findFirst: async () => null },
  esignPreferences: { findUnique: async () => recipient.envelope.tenant.esignPrefs },
  notificationSettings: { findUnique: async () => null },
  platformSetting: { findUnique: async () => ({ smtpHost: "smtp.fixture.invalid", smtpFrom: "Fixture <notifications@example.test>" }) },
  envelopeEvent: { create: async () => { writes++; return {}; }, findMany: async () => [], findFirst: async () => null },
  envelope: { update: async ({ data }: any) => { writes++; completed = data; return { ...recipient.envelope, ...data }; } },
};
mock.module("../src/lib/db", () => ({ db }));
mock.module("../src/lib/transaction", () => ({ serializableTransaction: async (fn: any) => fn(db) }));
mock.module("../src/lib/webhooks", () => ({ queueEnvelopeEvent: async () => {}, retryFailedDeliveries: async () => {} }));
mock.module("../src/lib/mail", () => ({ processOutbox: async () => {} }));
mock.module("../src/lib/attestation", () => ({ pushAttestationForEnvelope: async () => ({ pushed: false }) }));
mock.module("../src/lib/transparency", () => ({ appendSealCommitment: async () => {} }));
const realDocumentStore = await import("../src/lib/document-store");
mock.module("../src/lib/document-store", () => ({ ...realDocumentStore, readStoredBytes: async () => { reads++; return uploadedBytes; }, readDocumentBytes: async () => { reads++; return uploadedBytes; } }));
mock.module("../src/lib/docintel/text-extract", () => ({ renderPage: async () => Buffer.from("png"), clampDpi: () => 150 }));
mock.module("../src/components/marketing/public-sign", () => ({ PublicSign: () => null }));
const signApi = await import("../src/app/api/sign/[token]/route");
const preview = await import("../src/app/api/sign/[token]/pages/[n]/route");
const { default: SignPage } = await import("../src/app/sign/[token]/page");
const post = (op = "sign") => signApi.POST(new NextRequest("http://localhost/api/sign/synthetic", {
  method: "POST", body: JSON.stringify({ op, consent: true, consentDigest: readConsentSnapshot(recipient.envelope.consentSnapshot).digest,
    consentVersion: readConsentSnapshot(recipient.envelope.consentSnapshot).version, name: "Fixture Signer", font: "caveat" }),
}), { params: Promise.resolve({ token: "synthetic" }) });

beforeEach(() => { recipient = fixture(); writes = 0; reads = 0; completed = null; });

describe("signer policy boundaries", () => {
  test("suspended tenant cannot render document bytes", async () => {
    recipient.envelope.tenant.status = "SUSPENDED";
    const response = await preview.GET(new NextRequest("http://localhost/api/sign/synthetic/pages/1"), { params: Promise.resolve({ token: "synthetic", n: "1" }) });
    expect(response.status).toBe(409);
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });
  test("suspended signer portal exposes no document or recipient snapshot", async () => {
    recipient.envelope.tenant.status = "SUSPENDED";
    const element = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
    expect(element.props.state.phase).toBe("unavailable");
    expect(element.props.state.document).toBeUndefined();
    expect(element.props.state.recipientEmail).toBeUndefined();
  });
  for (const preference of ["requireReauth", "part11Mode"]) {
    test(`${preference} rejects token-only signing without mutation`, async () => {
      recipient.envelope.tenant.esignPrefs = { signatureLevel: "simple", requireReauth: false, part11Mode: false, [preference]: true };
      const response = await post();
      expect(response.status).toBe(409);
      expect((await response.json()).error).toContain("reauthentication");
      expect(writes).toBe(0);
    });
    test(`${preference} portal explains unavailable supported authentication`, async () => {
      recipient.envelope.tenant.esignPrefs = { signatureLevel: "simple", requireReauth: false, part11Mode: false, [preference]: true };
      const element = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
      expect(element.props.state.phase).toBe("unavailable");
      expect(element.props.state.reason).toContain("reauthentication");
    });
  }
  for (const signatureLevel of ["advanced", "qualified", "unknown", null, undefined]) {
    test(`unsupported assurance ${String(signatureLevel)} denies signing and portal without mutation`, async () => {
      recipient.envelope.tenant.esignPrefs = { signatureLevel, requireReauth: false, part11Mode: false };
      const response = await post();
      expect(response.status).toBe(409); expect((await response.json()).error).toContain("unsupported");
      expect(writes).toBe(0); expect(reads).toBe(0);
      const element = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
      expect(element.props.state.phase).toBe("unavailable");
      expect(element.props.state.reason).toContain("unsupported");
      expect(element.props.state.document).toBeUndefined();
    });
  }
  test("completion keeps original checksum and cannot claim unperformed PAdES/TSA conformance", async () => {
    recipient.envelope.conformanceLevel = "B-LTA"; // Even stale configured labels cannot certify an operation.
    Object.assign(recipient.envelope, { documentId: "document-one", templateId: null, contractSnapshot: null, sha256: uploadedSha256,
      document: { id: "document-one", tenantId: "tenant-one", pageCount: 1, filename: "synthetic.pdf", storageKey: "synthetic-upload.pdf", sha256: uploadedSha256 } });
    expect((await post()).status).toBe(200);
    expect(completed.sha256).toBe(uploadedSha256);
    expect(completed.conformanceLevel).toBeNull();
  });
  test("ordinary token signing still completes", async () => {
    expect((await post()).status).toBe(200);
    expect(completed.status).toBe("COMPLETED");
  });
  test("CC links cannot sign", async () => {
    recipient.role = "CC";
    expect((await post()).status).toBe(409);
    expect(writes).toBe(0);
  });
  for (const fields of ["not-json", JSON.stringify([{ id: "legacy-text", type: "text", required: true }])]) {
    test(`legacy unsupported fields cannot bypass signing (${fields.slice(0, 15)})`, async () => {
      recipient.envelope.fields = fields;
      Object.assign(recipient.envelope, { documentId: "document-one", templateId: null, contractSnapshot: null });
      expect((await post()).status).toBe(409);
      expect(writes).toBe(0);
      const element = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
      expect(element.props.state.phase).toBe("unavailable");
    });
  }
  test("valid stored signature hints still permit the typed document signature", async () => {
    const fields = [{ id: "field-1", type: "signature", pageNumber: 1,
      x: 10, y: 10, width: 25, height: 7, recipientIndex: 0, recipientEmail: recipient.email, required: true }];
    recipient.envelope.fields = JSON.stringify(fields);
    recipient.envelope.contractSnapshot = freezeTemplateContract(template, fields);
    expect((await post()).status).toBe(200);
  });
});
