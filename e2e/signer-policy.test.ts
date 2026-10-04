import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

// Own process, synthetic in-memory rows; no database, dotenv, network or renderer.
let recipient: any;
let writes = 0;
let reads = 0;
let completed: any;
const fixture = () => ({
  id: "signer-one", name: "Fixture Signer", email: "signer@example.test", role: "SIGNER", order: 1, status: "PENDING",
  envelope: {
    id: "envelope-one", documentId: "document-one", publicCode: "DOC-FIXTURE", title: "Synthetic agreement", pages: 1,
    tenantId: "tenant-one", status: "SENT", createdAt: new Date(0), sha256: "original-document-checksum",
    tenant: { name: "Fixture tenant", status: "ACTIVE", esignPrefs: null },
    recipients: [{ id: "signer-one", name: "Fixture Signer", email: "signer@example.test", role: "SIGNER", order: 1, status: "PENDING" }],
    createdBy: { email: "owner@example.test" }, fields: null, template: null,
    document: { id: "document-one", tenantId: "tenant-one", pageCount: 1, filename: "synthetic.pdf", sha256: "original-document-checksum" },
  },
});
const db = {
  recipient: {
    findUnique: async ({ include }: any) => {
      // Model the selected Prisma relationships: a missing policy projection
      // must not pass merely because the test fixture contains that property.
      const tenantSelect = include?.envelope?.include?.tenant?.select;
      return { ...recipient, envelope: { ...recipient.envelope,
        tenant: tenantSelect ? Object.fromEntries(Object.keys(tenantSelect).map((key) => [key, recipient.envelope.tenant[key]])) : undefined,
      } };
    },
    update: async () => { writes++; return {}; },
    findMany: async () => [{ ...recipient, status: "SIGNED", signedAt: new Date(0) }],
  },
  mailOutbox: { create: async () => {}, createMany: async () => {} },
  domain: { findFirst: async () => null },
  envelopeEvent: { create: async () => { writes++; return {}; }, findMany: async () => [], findFirst: async () => null },
  envelope: { update: async ({ data }: any) => { writes++; completed = data; return { ...recipient.envelope, ...data }; } },
};
mock.module("../src/lib/db", () => ({ db }));
mock.module("../src/lib/transaction", () => ({ serializableTransaction: async (fn: any) => fn(db) }));
mock.module("../src/lib/webhooks", () => ({ queueEnvelopeEvent: async () => {}, retryFailedDeliveries: async () => {} }));
mock.module("../src/lib/mail", () => ({ processOutbox: async () => {} }));
mock.module("../src/lib/attestation", () => ({ pushAttestationForEnvelope: async () => ({ pushed: false }) }));
mock.module("../src/lib/transparency", () => ({ appendSealCommitment: async () => {} }));
mock.module("../src/lib/document-store", () => ({ readDocumentBytes: async () => { reads++; return Buffer.from("synthetic"); } }));
mock.module("../src/lib/docintel/text-extract", () => ({ renderPage: async () => Buffer.from("png"), clampDpi: () => 150 }));
mock.module("../src/components/marketing/public-sign", () => ({ PublicSign: () => null }));
const signApi = await import("../src/app/api/sign/[token]/route");
const preview = await import("../src/app/api/sign/[token]/pages/[n]/route");
const { default: SignPage } = await import("../src/app/sign/[token]/page");
const post = (op = "sign") => signApi.POST(new NextRequest("http://localhost/api/sign/synthetic", {
  method: "POST", body: JSON.stringify({ op, consent: true, name: "Fixture Signer", font: "caveat" }),
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
      recipient.envelope.tenant.esignPrefs = { [preference]: true };
      const response = await post();
      expect(response.status).toBe(409);
      expect((await response.json()).error).toContain("reauthentication");
      expect(writes).toBe(0);
    });
    test(`${preference} portal explains unavailable supported authentication`, async () => {
      recipient.envelope.tenant.esignPrefs = { [preference]: true };
      const element = await SignPage({ params: Promise.resolve({ token: "synthetic" }) });
      expect(element.props.state.phase).toBe("unavailable");
      expect(element.props.state.reason).toContain("reauthentication");
    });
  }
  test("completion keeps original checksum and cannot claim unperformed PAdES/TSA conformance", async () => {
    recipient.envelope.conformanceLevel = "B-LTA"; // Even stale configured labels cannot certify an operation.
    expect((await post()).status).toBe(200);
    expect(completed.sha256).toBe("original-document-checksum");
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
});
