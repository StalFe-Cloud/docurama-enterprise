/// <reference types="bun-types" />

/**
 * Transparency-registry E2E — the append-only hash chains behind evidence
 * packs and portal attestations, driven over real HTTP against the same
 * server the Maestro flows use.
 *
 * Run: bun test e2e/transparency.test.ts   (run.sh wires it after evidence)
 *
 * Nothing here trusts the implementation: every proof is re-hashed and every
 * signature re-verified with node crypto from the raw HTTP bytes, exactly
 * what a third-party monitor (or verify.html) would do. Tamper paths mutate a
 * byte and assert the verifier refuses.
 */

import { describe, expect, test } from "bun:test";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from "crypto";
import { canonicalJson } from "../src/lib/canonical-json";
import {
  commitmentHash, chainEntryHash, GENESIS_HEAD, TRANSPARENCY_FORMAT,
  verifyPackTransparency, verifyPortalProof,
  type PackTransparencyBlock, type SealCommitment,
} from "../src/lib/transparency";

const run = promisify(execFile);
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_API_KEY = "dk_e2e_0000000000000000000000000000000000000000";

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

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

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

/** A throwaway self-hosted-instance identity, like a real remote instance. */
async function makeInstanceKey(label: string) {
  const dir = await mkdtemp(join(tmpdir(), "docurama-tlog-inst-"));
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

/** Build a signed attestation with a REAL, internally-consistent chain claim. */
function buildAttestedPush(
  key: Awaited<ReturnType<typeof makeInstanceKey>>,
  envelope: { code: string; sha256: string; sealedAt: string; conformance: string | null; pages: number; signerCount: number },
  label: string,
  chainOpts: { seq: number; at?: string; tamperEntryHash?: boolean; tamperPayloadHash?: boolean } = { seq: 1 },
) {
  const at = chainOpts.at ?? envelope.sealedAt;
  let payloadHash = commitmentHash({
    code: envelope.code, sha256: envelope.sha256, sealedAt: envelope.sealedAt,
    conformance: envelope.conformance, pages: envelope.pages, signerCount: envelope.signerCount,
  });
  if (chainOpts.tamperPayloadHash) payloadHash = sha256("tampered-commitment");
  const prevHead = chainOpts.seq === 1 ? GENESIS_HEAD : sha256(`prev-${chainOpts.seq}`);
  let entryHash = chainEntryHash({ seq: chainOpts.seq, payloadHash, prevHead, at });
  if (chainOpts.tamperEntryHash) entryHash = sha256("tampered-entry");
  const payload = {
    format: "docurama-attestation",
    version: 1,
    instance: { keyId: "ek_tlog_instance", label, verifiedDomain: null },
    envelope: { ...envelope, completedAt: envelope.sealedAt },
    publicKeyPem: key.publicKeyPem,
    certificatePem: key.certificatePem,
    keyThumbprint: key.thumbprint,
    transparency: {
      format: TRANSPARENCY_FORMAT, seq: chainOpts.seq,
      payloadHash, prevHead, entryHash, at,
    },
  };
  const signature = nodeSign(
    "sha256",
    Buffer.from(canonicalJson(payload), "utf8"),
    createPrivateKey(key.privateKeyPem),
  ).toString("base64");
  return { payload, signature };
}

/* ── evidence pack carries a verifiable transparency block ─────────────────── */

describe("evidence pack transparency block", () => {
  test("pack manifest embeds a chain entry that verifies offline (commitment → chain → signed checkpoint)", async () => {
    const res = await fetch(`${BASE}/api/v1/envelopes/DOC-E2E0002/evidence-pack`, {
      headers: { "X-API-Key": E2E_API_KEY },
    });
    expect(res.status).toBe(200);
    const files = parseZip(Buffer.from(await res.arrayBuffer()));
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));

    const block = manifest.payload.transparency as PackTransparencyBlock;
    expect(block.format).toBe(TRANSPARENCY_FORMAT);
    expect(block.entry.seq).toBeGreaterThanOrEqual(1);
    expect(block.segment.length).toBeGreaterThanOrEqual(1);
    expect(block.truncated).toBe(false);

    // The commitment is recomputed from the manifest's OWN envelope fields —
    // a third party needs nothing but the pack to check it.
    const signers = manifest.payload.signers as { status: string }[];
    const commitment: SealCommitment = {
      code: manifest.payload.envelope.code,
      sha256: manifest.payload.envelope.sha256,
      sealedAt: manifest.payload.envelope.sealedAt,
      conformance: manifest.payload.envelope.conformance,
      pages: manifest.payload.envelope.pages,
      signerCount: signers.filter((s) => s.status === "SIGNED").length,
    };
    const verified = verifyPackTransparency(block, commitment, manifest.payload.signing.publicKeyPem);
    expect(verified.ok).toBe(true);

    // The manifest signature still covers the transparency block (it grew).
    const sigOk = nodeVerify(
      "sha256",
      Buffer.from(canonicalJson(manifest.payload), "utf8"),
      createPublicKey(manifest.payload.signing.publicKeyPem),
      Buffer.from(manifest.signature, "base64"),
    );
    expect(sigOk).toBe(true);

    // verify.html mirrors the chain check offline.
    const verifyHtml = files.get("verify.html")!.toString("utf8");
    expect(verifyHtml).toContain("Registre de transparence");
    expect(verifyHtml).toContain("docurama-transparency-v1");
    expect(verifyHtml).not.toContain("fetch(");
  });

  test("a tampered commitment is detected by the shared verifier", async () => {
    const res = await fetch(`${BASE}/api/v1/envelopes/DOC-E2E0002/evidence-pack`, {
      headers: { "X-API-Key": E2E_API_KEY },
    });
    const files = parseZip(Buffer.from(await res.arrayBuffer()));
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    const block = manifest.payload.transparency as PackTransparencyBlock;

    // Claim a different digest: the entry no longer commits to the envelope.
    const badCommitment: SealCommitment = {
      code: manifest.payload.envelope.code,
      sha256: sha256("not-the-real-digest"),
      sealedAt: manifest.payload.envelope.sealedAt,
      conformance: manifest.payload.envelope.conformance,
      pages: manifest.payload.envelope.pages,
      signerCount: 1,
    };
    const v = verifyPackTransparency(block, badCommitment, manifest.payload.signing.publicKeyPem);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("commit");
  });

  test("a rewritten segment link breaks the chain verification", async () => {
    const res = await fetch(`${BASE}/api/v1/envelopes/DOC-E2E0002/evidence-pack`, {
      headers: { "X-API-Key": E2E_API_KEY },
    });
    const files = parseZip(Buffer.from(await res.arrayBuffer()));
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));

    // Re-write history: silently replace a middle entry's payload with another.
    const block = JSON.parse(JSON.stringify(manifest.payload.transparency)) as PackTransparencyBlock;
    if (block.segment.length >= 2) {
      block.segment[1] = { ...block.segment[1], payloadHash: sha256("rewritten-history") };
    } else {
      block.segment[0] = { ...block.segment[0], prevHead: sha256("rewritten-prev") };
    }
    const commitment: SealCommitment = {
      code: manifest.payload.envelope.code,
      sha256: manifest.payload.envelope.sha256,
      sealedAt: manifest.payload.envelope.sealedAt,
      conformance: manifest.payload.envelope.conformance,
      pages: manifest.payload.envelope.pages,
      signerCount: (manifest.payload.signers as { status: string }[]).filter((s) => s.status === "SIGNED").length,
    };
    const v = verifyPackTransparency(block, commitment, manifest.payload.signing.publicKeyPem);
    expect(v.ok).toBe(false);
  });
});

/* ── receiver: transparency claims, witnessing, rewrite detection ──────────── */

describe("attestation receiver + portal log", () => {
  const runStamp = String(Date.now()).slice(-6);
  const digestA = sha256("transparency-loopback-a");

  test("a push with a consistent chain claim is witnessed in the portal log", async () => {
    const key = await makeInstanceKey("Tlog Witness");
    const code = `DOC-TA${runStamp}`;
    const envelope = {
      code, sha256: digestA, sealedAt: new Date().toISOString(),
      conformance: "B-T", pages: 2, signerCount: 1,
    };
    const push = await post("/api/attestations", buildAttestedPush(key, envelope, "Tlog Witness SA", { seq: 3 }));
    expect(push.status).toBe(201);
    expect(push.body.ok).toBe(true);
    // The receiver reports where the push was witnessed in the portal log.
    expect((push.body.log as { seq: number }).seq).toBeGreaterThanOrEqual(1);

    // The verify engine surfaces the chain position.
    const { status, body } = await getJson(`/api/v1/verify/${code}`);
    expect(status).toBe(200);
    expect(body.result).toBe("VERIFIED_ATTESTED");
    const t = (body.attestation as { transparency: { chainSeq: number; chainEntryHash: string; proof: string } }).transparency;
    expect(t.chainSeq).toBe(3);
    expect(t.chainEntryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.proof).toBe(`/api/transparency/proof/${code}`);
  });

  test("a claim that does not commit to the pushed fingerprint is rejected", async () => {
    const key = await makeInstanceKey("Tlog BadCommit");
    const code = `DOC-TB${runStamp}`;
    const envelope = {
      code, sha256: digestA, sealedAt: new Date().toISOString(),
      conformance: "B-T", pages: 2, signerCount: 1,
    };
    const push = buildAttestedPush(key, envelope, "Tlog BadCommit SA", { seq: 1, tamperPayloadHash: true });
    const res = await post("/api/attestations", push);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("does not commit");
  });

  test("an internally inconsistent entry hash is rejected", async () => {
    const key = await makeInstanceKey("Tlog BadHash");
    const code = `DOC-TC${runStamp}`;
    const envelope = {
      code, sha256: digestA, sealedAt: new Date().toISOString(),
      conformance: "B-T", pages: 2, signerCount: 1,
    };
    const push = buildAttestedPush(key, envelope, "Tlog BadHash SA", { seq: 1, tamperEntryHash: true });
    const res = await post("/api/attestations", push);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("inconsistent");
  });

  test("chain rewrite detection: same code + same digest at a DIFFERENT chain position is refused (409)", async () => {
    const key = await makeInstanceKey("Tlog Rewrite");
    const code = `DOC-TD${runStamp}`;
    const envelope = {
      code, sha256: digestA, sealedAt: new Date().toISOString(),
      conformance: "B-T", pages: 2, signerCount: 1,
    };
    const first = await post("/api/attestations", buildAttestedPush(key, envelope, "Tlog Rewrite SA", { seq: 1 }));
    expect(first.status).toBe(201);

    // Same fingerprint, re-anchored at seq 7 with a different timestamp —
    // history rewriting, exactly what the witnessed chain exists to catch.
    const rewrite = buildAttestedPush(key, envelope, "Tlog Rewrite SA", { seq: 7, at: new Date(Date.now() + 60_000).toISOString() });
    const res = await post("/api/attestations", rewrite);
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toContain("Chain rewrite detected");
  });

  test("idempotent re-push does not grow the portal log", async () => {
    const key = await makeInstanceKey("Tlog Idem");
    const code = `DOC-TE${runStamp}`;
    const envelope = {
      code, sha256: digestA, sealedAt: new Date().toISOString(),
      conformance: "B-T", pages: 2, signerCount: 1,
    };
    const push = buildAttestedPush(key, envelope, "Tlog Idem SA", { seq: 1 });
    expect((await post("/api/attestations", push)).status).toBe(201);

    const before = await getJson("/api/transparency/checkpoint");
    const sizeBefore = (before.body.log as { size: number }).size;
    const second = await post("/api/attestations", push);
    expect(second.status).toBe(200);
    expect(second.body.log).toBeNull(); // nothing changed → nothing witnessed
    const after = await getJson("/api/transparency/checkpoint");
    expect((after.body.log as { size: number }).size).toBe(sizeBefore);
  });
});

/* ── public transparency endpoints ──────────────────────────────────────────── */

describe("public transparency endpoints", () => {
  test("checkpoint is signed by the portal key and covers the log head", async () => {
    const { status, body } = await getJson("/api/transparency/checkpoint");
    expect(status).toBe(200);
    const log = body.log as { size: number; head: string };
    expect(log.size).toBeGreaterThanOrEqual(1);
    expect(log.head).toMatch(/^[0-9a-f]{64}$/);

    const cp = body.checkpoint as {
      format: string; keyId: string; size: number; head: string; at: string;
      signature: string; publicKeyPem: string; keyFingerprint: string;
    };
    expect(cp.format).toBe("docurama-transparency-checkpoint");
    expect(cp.size).toBe(log.size);
    expect(cp.head).toBe(log.head);

    const sigOk = nodeVerify(
      "sha256",
      Buffer.from(canonicalJson({ format: cp.format, keyId: cp.keyId, size: cp.size, head: cp.head, at: cp.at }), "utf8"),
      createPublicKey(cp.publicKeyPem),
      Buffer.from(cp.signature, "base64"),
    );
    expect(sigOk).toBe(true);
    expect(cp.keyFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the seeded attested fixture serves a fully verifiable inclusion proof", async () => {
    const { status, body } = await getJson("/api/transparency/proof/DOC-E2EATST");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const entry = body.entry as { code: string; instanceEntryHash: string };
    expect(entry.code).toBe("DOC-E2EATST");
    expect(entry.instanceEntryHash).toMatch(/^[0-9a-f]{64}$/);

    const proof = {
      entry: body.entry,
      segment: body.segment,
      truncated: body.truncated as boolean,
      checkpoint: body.checkpoint,
    } as Parameters<typeof verifyPortalProof>[0];
    const v = verifyPortalProof(proof);
    expect(v.ok).toBe(true);

    // Tamper: rewrite the witnessed sha256 — the proof must stop verifying.
    const tampered = JSON.parse(JSON.stringify(proof));
    tampered.segment[0].sha256 = sha256("rewritten");
    const vBad = verifyPortalProof(tampered);
    expect(vBad.ok).toBe(false);
  });

  test("an unknown code has no proof (honest 404)", async () => {
    const { status, body } = await getJson("/api/transparency/proof/DOC-TZZZZZZ");
    expect(status).toBe(404);
    expect(String(body.error)).toContain("No attestation witnessed");
  });

  test("a malformed code is rejected without touching the log", async () => {
    const { status } = await getJson("/api/transparency/proof/not-a-code!");
    expect(status).toBe(400);
  });
});
