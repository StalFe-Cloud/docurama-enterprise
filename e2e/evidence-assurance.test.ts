import { describe, expect, mock, test } from "bun:test";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalJson } from "../src/lib/canonical-json";
import { DEFAULT_CONSENT_TEXT } from "../src/lib/esign";

// Ephemeral in-memory test key only. This checks pack signature/artifact
// contracts, not X.509 trust, identity assurance, PAdES or legal compliance.
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const document = Buffer.from("synthetic original document bytes");
const checksum = createHash("sha256").update(document).digest("hex");
const row = {
  id: "envelope-one", tenantId: "tenant-one", publicCode: "DOC-SYNTHETIC", title: "Synthetic agreement",
  status: "COMPLETED", sha256: checksum, conformanceLevel: null, pages: 1,
  createdAt: new Date(0), sealedAt: new Date(1000), completedAt: new Date(1000), verifiedSenderDomain: null,
  tenant: { name: "Synthetic tenant" }, createdBy: { firstName: "Synthetic", lastName: "Owner", email: "owner@example.test" },
  recipients: [{ name: "Synthetic Signer", email: "signer@example.test", role: "SIGNER", status: "SIGNED", order: 1, signedAt: new Date(1000) }],
  events: [{ at: new Date(1000), actor: "Synthetic Signer", action: "SIGNED", detail: "Synthetic signature", ipHash: null }],
  documentId: "document-one", document: { tenantId: "tenant-one", filename: "synthetic.pdf", storageKey: "synthetic-only" }, template: null,
};
mock.module("../src/lib/db", () => ({ db: { envelope: { findFirst: async () => row } } }));
mock.module("../src/lib/document-store", () => ({ readStoredBytes: async () => document }));
mock.module("../src/lib/evidence-key", () => ({
  EVIDENCE_SIGNATURE_ALGORITHM: "RSASSA-PKCS1-v1_5-SHA-256",
  getOrCreateEvidenceKey: async () => ({ privateKeyPem, publicKeyPem, certificatePem: "synthetic-certificate-not-an-identity-assertion",
    keyId: "synthetic-key", thumbprint: "synthetic-thumbprint", sanDomain: null, createdAt: new Date(0) }),
  signPayload: (key: string, payload: unknown) => sign("RSA-SHA256", Buffer.from(canonicalJson(payload)), key).toString("base64"),
}));
mock.module("../src/lib/transparency", () => ({
  TRANSPARENCY_FORMAT: "synthetic-transparency",
  appendSealCommitment: async () => ({ seq: 1, payloadHash: "synthetic", prevHead: null, head: "synthetic", at: new Date(1000) }),
  getChainSegment: async () => ({ segment: [], truncated: false }), signCheckpoint: () => ({ synthetic: true }),
}));
const { buildEvidencePack } = await import("../src/lib/evidence-pack");

function filesInZip(bytes: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const path = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    files.set(path, bytes.subarray(start, start + size));
    offset = start + size;
  }
  return files;
}
describe("truthful completion evidence", () => {
  test("null conformance certificate never fabricates PAdES B-T", async () => {
    const files = filesInZip((await buildEvidencePack("DOC-SYNTHETIC", "tenant-one")).bytes);
    const html = files.get("CERTIFICATE-OF-COMPLETION.html")!.toString("utf8");
    expect(html).not.toContain("PAdES B-T");
    expect(html).toContain("PAdES conformance: not asserted");
    expect(html).toContain("original uploaded document");
  });
  test("consent records reviewed electronic-signature intent without compliance certification", () => {
    expect(DEFAULT_CONSENT_TEXT).toContain("reviewed");
    expect(DEFAULT_CONSENT_TEXT).not.toContain("in compliance");
    expect(DEFAULT_CONSENT_TEXT).not.toContain("21 CFR");
  });
  test("signed manifest still binds artifacts, original checksum and explicit null conformance", async () => {
    const files = filesInZip((await buildEvidencePack("DOC-SYNTHETIC", "tenant-one")).bytes);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    expect(manifest.payload.envelope.sha256).toBe(checksum);
    expect(manifest.payload.envelope.conformance).toBeNull();
    expect(verify("RSA-SHA256", Buffer.from(canonicalJson(manifest.payload)), publicKeyPem, Buffer.from(manifest.signature, "base64"))).toBe(true);
    expect(files.get("document/original.pdf")).toEqual(document);
    for (const artifact of manifest.payload.artifacts) {
      expect(createHash("sha256").update(files.get(artifact.path)!).digest("hex")).toBe(artifact.sha256);
    }
  });
});
