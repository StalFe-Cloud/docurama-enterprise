/// <reference types="bun-types" />

/**
 * Evidence-layer E2E — evidence packs and the public-portal attestation
 * receiver, driven over real HTTP against the same server the Maestro flows
 * use, plus pure-function tests for the DNS posture parsers.
 *
 * Run: bun test e2e/evidence.test.ts   (run.sh does this after the api suite)
 *
 * The pack test does NOT trust the builder: it downloads the raw ZIP bytes,
 * parses the archive itself (STORE method, central directory), then
 * re-verifies the manifest signature with node crypto and re-hashes every
 * artifact — exactly what a third party would do with verify.html.
 *
 * The attestation tests run the full receiver loopback: a throwaway instance
 * key (openssl RSA-2048) signs a minimal fingerprint, pushes it to
 * /api/attestations, and the public verify engine must serve it as
 * VERIFIED_ATTESTED. Tampering paths assert the receiver refuses.
 */

import { describe, expect, test } from "bun:test";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from "crypto";
import { canonicalJson } from "../src/lib/canonical-json";
import { parseSpfRecord, spfPolicy, parseDmarcPolicy } from "../src/lib/dns-check";

const run = promisify(execFile);
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_API_KEY = "dk_e2e_0000000000000000000000000000000000000000";

/* ── helpers ───────────────────────────────────────────────────────────────── */

const get = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers });
  return res;
};

const getJson = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
};

const post = async (path: string, payload: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
};

/** Minimal STORE-method ZIP reader: EOCD → central directory → raw entries. */
function parseZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD not found — not a ZIP");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central directory record");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    if (method !== 0) throw new Error(`unexpected compression method ${method} for ${name}`);
    files.set(name, Buffer.from(buf.subarray(dataStart, dataStart + compSize)));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** A throwaway self-hosted-instance identity: real RSA-2048 key + self-signed cert. */
async function makeInstanceKey(label: string) {
  const dir = await mkdtemp(join(tmpdir(), "docurama-test-inst-"));
  try {
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    await run("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "30", "-nodes",
      "-keyout", keyPath, "-out", certPath,
      "-subj", `/CN=Docurama Evidence Key - ${label}/O=${label}/C=FR`,
    ]);
    const pub = await run("openssl", ["x509", "-in", certPath, "-pubkey", "-noout"]);
    const [privateKeyPem, certificatePem] = await Promise.all([
      readFile(keyPath, "utf8"),
      readFile(certPath, "utf8"),
    ]);
    const thumbprint = sha256(
      Buffer.from(certificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, ""), "base64"),
    );
    return { privateKeyPem: privateKeyPem.trim(), certificatePem: certificatePem.trim(), publicKeyPem: pub.stdout.trim(), thumbprint };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Build a signed attestation body exactly like a self-hosted instance would. */
function buildAttestation(
  key: Awaited<ReturnType<typeof makeInstanceKey>>,
  envelope: Record<string, unknown>,
  label: string,
) {
  const payload = {
    format: "docurama-attestation",
    version: 1,
    instance: { keyId: "ek_test_instance", label, verifiedDomain: null },
    envelope,
    publicKeyPem: key.publicKeyPem,
    certificatePem: key.certificatePem,
    keyThumbprint: key.thumbprint,
  };
  const signature = nodeSign(
    "sha256",
    Buffer.from(canonicalJson(payload), "utf8"),
    createPrivateKey(key.privateKeyPem),
  ).toString("base64");
  return { payload, signature };
}

const fingerprint = (code: string, sha: string) => ({
  code,
  sha256: sha,
  sealedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  conformance: "B-T",
  pages: 2,
  signerCount: 1,
});

/* ── evidence pack ─────────────────────────────────────────────────────────── */

describe("evidence pack export (v1)", () => {
  test("requires an API key (401 without)", async () => {
    const res = await get("/api/v1/envelopes/DOC-E2E0002/evidence-pack");
    expect(res.status).toBe(401);
  });

  test("sealed fixture exports a ZIP whose manifest signature and artifact hashes verify", async () => {
    const res = await get("/api/v1/envelopes/DOC-E2E0002/evidence-pack", { "X-API-Key": E2E_API_KEY });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("evidence-DOC-E2E0002.zip");

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const files = parseZip(zipBuf);

    // Required surfaces are all present.
    for (const path of [
      "manifest.json",
      "README.txt",
      "verify.html",
      "CERTIFICATE-OF-COMPLETION.html",
      "evidence/event-ledger.csv",
      "evidence/envelope.json",
      "certificate/evidence-key.pem",
      "certificate/evidence-key.pub.pem",
    ]) {
      expect(files.has(path)).toBe(true);
    }

    // The manifest is self-verifying: signature over canonical(payload).
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    expect(manifest.format).toBe("docurama-evidence-pack");
    expect(manifest.version).toBe(1);
    const canonical = canonicalJson(manifest.payload);
    const sigOk = nodeVerify(
      "sha256",
      Buffer.from(canonical, "utf8"),
      createPublicKey(manifest.payload.signing.publicKeyPem),
      Buffer.from(manifest.signature, "base64"),
    );
    expect(sigOk).toBe(true);

    // Every artifact's signed SHA-256 matches the actual bytes in the ZIP,
    // and the archive contains exactly the artifacts plus the manifest itself.
    expect(files.size).toBe((manifest.payload.artifacts as unknown[]).length + 1);
    for (const artifact of manifest.payload.artifacts as { path: string; sha256: string; bytes: number }[]) {
      const data = files.get(artifact.path);
      expect(data, `artifact ${artifact.path} missing from ZIP`).toBeDefined();
      expect(sha256(data!)).toBe(artifact.sha256);
      expect(data!.length).toBe(artifact.bytes);
    }

    // The envelope digest in the pack equals the digest the v1 API reports.
    const { body: detail } = await getJson("/api/v1/envelopes/DOC-E2E0002", { "X-API-Key": E2E_API_KEY });
    expect(manifest.payload.envelope.sha256).toBe(
      (detail.envelope as { sha256: string }).sha256,
    );
    expect(manifest.payload.envelope.code).toBe("DOC-E2E0002");

    // The offline verifier is self-contained (no network calls).
    const verifyHtml = files.get("verify.html")!.toString("utf8");
    expect(verifyHtml).toContain("canonicalJson");
    expect(verifyHtml).toContain("RSASSA-PKCS1-v1_5");
    expect(verifyHtml).not.toContain("fetch(");

    // The certificate embeds the public key's PEM in the manifest — consistency.
    const ledger = files.get("evidence/event-ledger.csv")!.toString("utf8");
    expect(ledger).toContain("at,actor,action,detail,ip_hash");
    expect(ledger).toContain("SEALED");
  });

  test("unsealed envelope refuses an evidence pack (honest 400)", async () => {
    const { status, body } = await getJson("/api/v1/envelopes/DOC-E2E0001/evidence-pack", { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(400);
    expect(String(body.error)).toContain("completed, sealed");
  });

  test("unknown envelope 404s", async () => {
    const { status } = await getJson("/api/v1/envelopes/DOC-NOPE1234/evidence-pack", { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(404);
  });
});

/* ── attestation receiver loopback ─────────────────────────────────────────── */

describe("public-portal attestation receiver (/api/attestations)", () => {
  const runStamp = String(Date.now()).slice(-6);
  const digestA = sha256("attestation-loopback-a");

  test("a valid signed fingerprint is accepted (TOFU registration) and served by the verify engine", async () => {
    const key = await makeInstanceKey("Loopback One");
    const code = `DOC-LA${runStamp}`;
    const att = buildAttestation(key, fingerprint(code, digestA), "Loopback One SA");

    const push = await post("/api/attestations", att);
    expect(push.status).toBe(201);
    expect(push.body.ok).toBe(true);
    expect(push.body.registered).toBe(true);

    const { status, body } = await getJson(`/api/v1/verify/${code}`);
    expect(status).toBe(200);
    expect(body.result).toBe("VERIFIED_ATTESTED");
    const a = body.attestation as { sha256: string; instance: { label: string } };
    expect(a.sha256).toBe(digestA);
    expect(a.instance.label).toBe("Loopback One SA");
  });

  test("re-pushing the same code is idempotent (registered=false, 200)", async () => {
    const key = await makeInstanceKey("Loopback Idem");
    const code = `DOC-LB${runStamp}`;
    const att = buildAttestation(key, fingerprint(code, digestA), "Loopback Idem SA");
    const first = await post("/api/attestations", att);
    expect(first.status).toBe(201);
    const second = await post("/api/attestations", att);
    expect(second.status).toBe(200);
    expect(second.body.registered).toBe(false);
  });

  test("a tampered signature is rejected", async () => {
    const key = await makeInstanceKey("Loopback Tamper");
    const att = buildAttestation(key, fingerprint(`DOC-LC${runStamp}`, digestA), "Loopback Tamper SA");
    const bad = { payload: att.payload, signature: Buffer.from("garbage-not-base64-signature").toString("base64") };
    const res = await post("/api/attestations", bad);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("Signature verification failed");
  });

  test("a thumbprint claim that does not match the certificate is rejected", async () => {
    const key = await makeInstanceKey("Loopback Stolen");
    const other = await makeInstanceKey("Loopback Victim");
    const payload = {
      format: "docurama-attestation", version: 1,
      instance: { keyId: "ek_test", label: "Loopback Stolen SA", verifiedDomain: null },
      envelope: fingerprint(`DOC-LD${runStamp}`, digestA),
      publicKeyPem: key.publicKeyPem,
      certificatePem: key.certificatePem,
      keyThumbprint: other.thumbprint, // claims someone else's identity
    };
    const signature = nodeSign(
      "sha256",
      Buffer.from(canonicalJson(payload), "utf8"),
      createPrivateKey(key.privateKeyPem),
    ).toString("base64");
    const res = await post("/api/attestations", { payload, signature });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("keyThumbprint");
  });

  test("a pinned instance key cannot be swapped", async () => {
    const key = await makeInstanceKey("Loopback Pinned");
    const code = `DOC-LE${runStamp}`;
    const att = buildAttestation(key, fingerprint(code, digestA), "Loopback Pinned SA");
    expect((await post("/api/attestations", att)).status).toBe(201);

    // Same thumbprint claim, DIFFERENT actual key material for the same label.
    const impostor = await makeInstanceKey("Loopback Pinned");
    const impostorPayload = {
      ...att.payload,
      envelope: fingerprint(`DOC-LF${runStamp}`, digestA),
      publicKeyPem: impostor.publicKeyPem,
      certificatePem: impostor.certificatePem,
      keyThumbprint: key.thumbprint, // claims the pinned thumbprint with a new key
    };
    const impostorSig = nodeSign(
      "sha256",
      Buffer.from(canonicalJson(impostorPayload), "utf8"),
      createPrivateKey(impostor.privateKeyPem),
    ).toString("base64");
    const res = await post("/api/attestations", { payload: impostorPayload, signature: impostorSig });
    expect(res.status).toBe(400);
  });

  test("a code already claimed by another instance is refused (409)", async () => {
    const keyA = await makeInstanceKey("Loopback Owner");
    const keyB = await makeInstanceKey("Loopback Other");
    const code = `DOC-LG${runStamp}`;
    const attA = buildAttestation(keyA, fingerprint(code, digestA), "Loopback Owner SA");
    expect((await post("/api/attestations", attA)).status).toBe(201);

    const attB = buildAttestation(keyB, fingerprint(code, sha256("different-digest")), "Loopback Other SA");
    const res = await post("/api/attestations", attB);
    expect(res.status).toBe(409);
  });

  test("attested fixture from the seed (DOC-E2EATST) is served by the public verify engine", async () => {
    const { status, body } = await getJson("/api/v1/verify/DOC-E2EATST");
    expect(status).toBe(200);
    expect(body.result).toBe("VERIFIED_ATTESTED");
    const a = body.attestation as { verifiedDomain: string | null; signerCount: number };
    expect(a.verifiedDomain).toBe("acme-corp.example");
    expect(a.signerCount).toBe(2);
  });

  test("an attested-shaped unknown code still reports NOT_FOUND honestly", async () => {
    const { status, body } = await getJson("/api/v1/verify/DOC-LZZZZZZ");
    expect(status).toBe(200);
    expect(body.result).toBe("NOT_FOUND");
  });
});

/* ── DNS posture parsers (pure functions) ──────────────────────────────────── */

describe("DNS email posture parsers", () => {
  test("SPF record is found and its policy classified", () => {
    expect(parseSpfRecord(["v=spf1 include:_spf.google.com ~all", "google-site-verification=abc"])).toBe("v=spf1 include:_spf.google.com ~all");
    expect(parseSpfRecord(["google-site-verification=abc"])).toBeNull();
    expect(spfPolicy("v=spf1 include:x -all")).toBe("strict");
    expect(spfPolicy("v=spf1 include:x ~all")).toBe("soft");
    expect(spfPolicy("v=spf1 include:x ?all")).toBe("neutral");
    expect(spfPolicy("v=spf1 include:x +all")).toBe("permissive");
    expect(spfPolicy("v=spf1 include:x")).toBe("none");
    expect(spfPolicy(null)).toBe("none");
  });

  test("DMARC policy is extracted", () => {
    expect(parseDmarcPolicy(["v=DMARC1; p=reject; rua=mailto:d@x"])).toBe("reject");
    expect(parseDmarcPolicy(["v=DMARC1; p=quarantine"])).toBe("quarantine");
    expect(parseDmarcPolicy(["v=DMARC1"])).toBeNull();
    expect(parseDmarcPolicy(["some-other-txt"])).toBeNull();
  });
});
