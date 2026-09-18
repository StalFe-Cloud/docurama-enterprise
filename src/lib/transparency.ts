/**
 * Transparency registry — a miniature Certificate Transparency log for
 * Docurama evidence, free of any external service.
 *
 * Two chained logs, same gossip model as CT, scaled down:
 *
 *   1. INSTANCE SIDE (per tenant): every sealed envelope appends one entry to
 *      an append-only hash chain. The entry commits to the seal fingerprint
 *      (code, SHA-256, sealed-at, conformance, pages, signer count). Entries
 *      link backward (prevHead); rewriting any entry changes every subsequent
 *      head, which contradicts the heads the portal witnessed.
 *
 *   2. PORTAL SIDE (global): every attestation the public portal accepts
 *      appends one entry to the portal's own append-only chain, witnessing the
 *      instance's claimed chain position. GET /api/transparency/checkpoint
 *      signs the current head — monitors poll it, pin the portal key (TOFU),
 *      and can then prove a rewritten or shrunk log.
 *
 * An evidence pack embeds: the envelope's chain entry, the segment of entries
 * up to the current head, and a checkpoint signed by the tenant evidence key.
 * verify.html inside the pack re-hashes the whole chain offline (WebCrypto),
 * so inclusion is provable with zero Docurama infrastructure and zero network.
 *
 * Honest limits: the instance chain is anchored by the SAME key that signs the
 * pack — its value is that the PORTAL witnesses its heads per code, and that
 * any rewrite is detectable against a previously exported pack/checkpoint.
 * This is tamper-evidence, not third-party identity assurance; the paid
 * upgrade paths (license-signed keys, Sigstore Rekor witnessing, AATL, eIDAS
 * QTSP) are documented in docs/TRANSPARENCY-LOG.md.
 */

import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from "crypto";
import { db } from "@/lib/db";
import { canonicalJson } from "@/lib/canonical-json";

export const TRANSPARENCY_FORMAT = "docurama-transparency-v1";
export const CHECKPOINT_FORMAT = "docurama-transparency-checkpoint";
export const GENESIS_HEAD = "0".repeat(64);

/** Cap on chain segments embedded in evidence packs / served as proofs. */
export const MAX_PACK_SEGMENT = 4096;
export const MAX_PROOF_SEGMENT = 1024;

/* ── Hashing primitives (mirrored byte-for-byte in verify.html) ─────────────── */

/** The seal commitment — the exact fields a chain entry vouches for. */
export type SealCommitment = {
  code: string;
  sha256: string;
  sealedAt: string; // ISO
  conformance: string | null;
  pages: number;
  signerCount: number;
};

export function commitmentHash(c: SealCommitment): string {
  return createHash("sha256").update(canonicalJson(c), "utf8").digest("hex");
}

/** entryHash = SHA-256 over canonical {seq, payloadHash, prevHead, at}. */
export function chainEntryHash(input: { seq: number; payloadHash: string; prevHead: string; at: string }): string {
  return createHash("sha256")
    .update(canonicalJson({ seq: input.seq, payloadHash: input.payloadHash, prevHead: input.prevHead, at: input.at }), "utf8")
    .digest("hex");
}

/** Portal log entry hash (mirrors the field set of PortalLogEntry). */
export function portalEntryHash(input: {
  seq: number; code: string; instanceThumbprint: string; sha256: string;
  instanceEntryHash: string | null; prevHead: string; at: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        seq: input.seq, code: input.code, instanceThumbprint: input.instanceThumbprint,
        sha256: input.sha256, instanceEntryHash: input.instanceEntryHash,
        prevHead: input.prevHead, at: input.at,
      }),
      "utf8",
    )
    .digest("hex");
}

/* ── Instance-side chain ────────────────────────────────────────────────────── */

/** The transparency claim carried inside a signed attestation payload. */
export type TransparencyClaim = {
  format: string;
  seq: number;
  payloadHash: string;
  prevHead: string;
  entryHash: string;
  at: string; // ISO
};

export function claimFromEntry(e: {
  seq: number; payloadHash: string; prevHead: string; head: string; at: Date;
}): TransparencyClaim {
  return {
    format: TRANSPARENCY_FORMAT,
    seq: e.seq,
    payloadHash: e.payloadHash,
    prevHead: e.prevHead,
    entryHash: e.head,
    at: e.at.toISOString(),
  };
}

/**
 * Append the envelope's seal commitment to the tenant's append-only chain.
 * Idempotent: the same envelope + same commitment reuses its existing entry
 * (unique on tenantId+envelopeId+payloadHash). A re-seal (new digest) appends
 * a NEW entry — history is never rewritten, only extended.
 */
export async function appendSealCommitment(input: {
  tenantId: string;
  envelopeId: string;
  commitment: SealCommitment;
}): Promise<{ seq: number; payloadHash: string; prevHead: string; head: string; at: Date }> {
  const payloadHash = commitmentHash(input.commitment);

  const existing = await db.transparencyEntry.findFirst({
    where: { tenantId: input.tenantId, envelopeId: input.envelopeId, payloadHash },
    orderBy: { seq: "desc" },
  });
  if (existing) return existing;

  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.transparencyEntry.findFirst({
      where: { tenantId: input.tenantId },
      orderBy: { seq: "desc" },
      select: { seq: true, head: true },
    });
    const seq = (last?.seq ?? 0) + 1;
    const prevHead = last?.head ?? GENESIS_HEAD;
    const at = new Date();
    const head = chainEntryHash({ seq, payloadHash, prevHead, at: at.toISOString() });
    try {
      return await db.transparencyEntry.create({
        data: {
          tenantId: input.tenantId,
          seq,
          envelopeId: input.envelopeId,
          publicCode: input.commitment.code,
          payloadHash,
          prevHead,
          head,
          at,
        },
      });
    } catch {
      // Lost a sequence race (unique tenantId+seq) — retry with a fresh max.
      if (attempt === 2) throw new Error("transparency chain append failed after 3 attempts");
    }
  }
  throw new Error("unreachable");
}

/** Current chain head for a tenant (seq 0 / GENESIS when empty). */
export async function getChainHead(tenantId: string): Promise<{ seq: number; head: string }> {
  const last = await db.transparencyEntry.findFirst({
    where: { tenantId },
    orderBy: { seq: "desc" },
    select: { seq: true, head: true },
  });
  return last ? { seq: last.seq, head: last.head } : { seq: 0, head: GENESIS_HEAD };
}

export type ChainEntryPublic = {
  seq: number;
  payloadHash: string;
  prevHead: string;
  head: string;
  at: string;
};

const toPublic = (e: { seq: number; payloadHash: string; prevHead: string; head: string; at: Date }): ChainEntryPublic => ({
  seq: e.seq, payloadHash: e.payloadHash, prevHead: e.prevHead, head: e.head, at: e.at.toISOString(),
});

/** Entries [fromSeq .. head] ascending for a tenant. */
export async function getChainSegment(tenantId: string, fromSeq: number): Promise<{ segment: ChainEntryPublic[]; truncated: boolean }> {
  const head = await getChainHead(tenantId);
  if (head.seq === 0 || fromSeq > head.seq) return { segment: [], truncated: false };
  const rows = await db.transparencyEntry.findMany({
    where: { tenantId, seq: { gte: fromSeq } },
    orderBy: { seq: "asc" },
    take: MAX_PACK_SEGMENT + 1,
  });
  const truncated = rows.length > MAX_PACK_SEGMENT;
  return { segment: (truncated ? rows.slice(0, MAX_PACK_SEGMENT) : rows).map(toPublic), truncated };
}

/** The latest chain entry for an envelope (its current commitment). */
export async function getEntryForEnvelope(tenantId: string, envelopeId: string): Promise<ChainEntryPublic | null> {
  const row = await db.transparencyEntry.findFirst({
    where: { tenantId, envelopeId },
    orderBy: { seq: "desc" },
  });
  return row ? toPublic(row) : null;
}

/* ── Signed checkpoints ─────────────────────────────────────────────────────── */

export type SignedCheckpoint = {
  format: string;
  keyId: string;
  size: number;
  head: string;
  at: string; // ISO
  signature: string; // base64 RSA-SHA-256 over canonical {format, keyId, size, head, at}
};

/** Sign a checkpoint of the tenant chain with the evidence key. */
export function signCheckpoint(
  key: { keyId: string; privateKeyPem: string },
  head: { seq: number; head: string },
): SignedCheckpoint {
  const at = new Date().toISOString();
  const body = { format: CHECKPOINT_FORMAT, keyId: key.keyId, size: head.seq, head: head.head, at };
  const signature = nodeSign("sha256", Buffer.from(canonicalJson(body), "utf8"), createPrivateKey(key.privateKeyPem)).toString("base64");
  return { ...body, signature };
}

/** Verify a checkpoint signature (mirror of what verify.html does). */
export function verifyCheckpoint(checkpoint: SignedCheckpoint, publicKeyPem: string): boolean {
  const body = {
    format: checkpoint.format, keyId: checkpoint.keyId, size: checkpoint.size,
    head: checkpoint.head, at: checkpoint.at,
  };
  try {
    return nodeVerify("sha256", Buffer.from(canonicalJson(body), "utf8"), createPublicKey(publicKeyPem), Buffer.from(checkpoint.signature, "base64"));
  } catch {
    return false;
  }
}

/* ── Pack transparency block (embedded in evidence-pack manifests) ──────────── */

export type PackTransparencyBlock = {
  format: string;
  entry: ChainEntryPublic;
  head: { seq: number; head: string };
  segment: ChainEntryPublic[];
  truncated: boolean;
  checkpoint: SignedCheckpoint;
};

/**
 * Verify a pack transparency block end-to-end, exactly like verify.html:
 *   1. the entry commits to the given seal commitment (payloadHash)
 *   2. the entry's own hash is internally consistent
 *   3. the segment chains forward from the entry to the head, link by link
 *   4. the checkpoint covers exactly that head
 *   5. the checkpoint signature verifies under the pack key
 */
export function verifyPackTransparency(
  block: PackTransparencyBlock,
  commitment: SealCommitment,
  publicKeyPem: string,
): { ok: boolean; reason?: string } {
  if (block.format !== TRANSPARENCY_FORMAT) return { ok: false, reason: "unknown transparency format" };
  const entry = block.entry;
  if (commitmentHash(commitment) !== entry.payloadHash) return { ok: false, reason: "entry does not commit to this envelope's fingerprint" };
  if (chainEntryHash({ seq: entry.seq, payloadHash: entry.payloadHash, prevHead: entry.prevHead, at: entry.at }) !== entry.head) {
    return { ok: false, reason: "entry hash inconsistent" };
  }
  if (block.head.seq < entry.seq) return { ok: false, reason: "head precedes entry" };
  const segment = block.segment;
  if (segment.length === 0 || segment[0].seq !== entry.seq) return { ok: false, reason: "segment does not start at the entry" };
  if (segment[0].payloadHash !== entry.payloadHash || segment[0].head !== entry.head) {
    return { ok: false, reason: "segment entry differs from the pack entry" };
  }
  // Every segment entry — including the first — must re-hash from its own
  // fields; a rewritten prevHead on the first entry would otherwise smuggle in
  // a different history before it.
  let prev = segment[0];
  for (let i = 0; i < segment.length; i++) {
    const cur = segment[i];
    if (chainEntryHash({ seq: cur.seq, payloadHash: cur.payloadHash, prevHead: cur.prevHead, at: cur.at }) !== cur.head) {
      return { ok: false, reason: `segment hash inconsistent at seq ${cur.seq}` };
    }
    if (i > 0) {
      if (cur.seq !== prev.seq + 1) return { ok: false, reason: `segment gap at seq ${cur.seq}` };
      if (cur.prevHead !== prev.head) return { ok: false, reason: `broken chain link at seq ${cur.seq}` };
    }
    prev = cur;
  }
  if (block.truncated) return { ok: true }; // chain verified up to the truncation point
  if (prev.seq !== block.head.seq || prev.head !== block.head.head) return { ok: false, reason: "segment does not reach the stated head" };
  const cp = block.checkpoint;
  if (cp.format !== CHECKPOINT_FORMAT || cp.size !== block.head.seq || cp.head !== block.head.head) {
    return { ok: false, reason: "checkpoint does not cover the stated head" };
  }
  if (!verifyCheckpoint(cp, publicKeyPem)) return { ok: false, reason: "checkpoint signature invalid" };
  return { ok: true };
}

/* ── Portal-side log ────────────────────────────────────────────────────────── */

/** The portal's TOFU-pinned checkpoint-signing key. Generated once per deployment. */
export async function getOrCreatePortalKey(): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
  const existing = await db.portalKey.findUnique({ where: { id: "portal" } });
  if (existing) return { publicKeyPem: existing.publicKeyPem, privateKeyPem: existing.privateKeyPem };
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  try {
    await db.portalKey.create({ data: { id: "portal", publicKeyPem, privateKeyPem } });
  } catch {
    // Lost a creation race — re-read the winner.
    const winner = await db.portalKey.findUnique({ where: { id: "portal" } });
    if (!winner) throw new Error("portal key creation failed");
    return { publicKeyPem: winner.publicKeyPem, privateKeyPem: winner.privateKeyPem };
  }
  return { publicKeyPem, privateKeyPem };
}

/** SHA-256 of the portal key's SPKI DER — what monitors pin. */
export function portalKeyFingerprint(publicKeyPem: string): string {
  const der = Buffer.from(publicKeyPem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, ""), "base64");
  return createHash("sha256").update(der).digest("hex");
}

/** Append an entry to the portal's global append-only log (witnessing an attestation). */
export async function appendPortalLogEntry(input: {
  code: string;
  instanceThumbprint: string;
  sha256: string;
  instanceEntryHash: string | null;
}): Promise<{ seq: number; head: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.portalLogEntry.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, head: true } });
    const seq = (last?.seq ?? 0) + 1;
    const prevHead = last?.head ?? GENESIS_HEAD;
    const at = new Date();
    const head = portalEntryHash({
      seq, code: input.code, instanceThumbprint: input.instanceThumbprint, sha256: input.sha256,
      instanceEntryHash: input.instanceEntryHash, prevHead, at: at.toISOString(),
    });
    try {
      await db.portalLogEntry.create({
        data: { seq, code: input.code, instanceThumbprint: input.instanceThumbprint, sha256: input.sha256, instanceEntryHash: input.instanceEntryHash, prevHead, head, at },
      });
      return { seq, head };
    } catch {
      if (attempt === 2) throw new Error("portal log append failed after 3 attempts");
    }
  }
  throw new Error("unreachable");
}

export async function getPortalLogHead(): Promise<{ seq: number; head: string }> {
  const last = await db.portalLogEntry.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, head: true } });
  return last ? { seq: last.seq, head: last.head } : { seq: 0, head: GENESIS_HEAD };
}

export type PortalCheckpoint = SignedCheckpoint & { publicKeyPem: string; keyFingerprint: string };

/** Sign the current portal log head — the public, pollable checkpoint. */
export async function buildPortalCheckpoint(): Promise<PortalCheckpoint> {
  const key = await getOrCreatePortalKey();
  const head = await getPortalLogHead();
  const at = new Date().toISOString();
  const body = { format: CHECKPOINT_FORMAT, keyId: "portal", size: head.seq, head: head.head, at };
  const signature = nodeSign("sha256", Buffer.from(canonicalJson(body), "utf8"), createPrivateKey(key.privateKeyPem)).toString("base64");
  return { ...body, signature, publicKeyPem: key.publicKeyPem, keyFingerprint: portalKeyFingerprint(key.publicKeyPem) };
}

export type PortalLogEntryPublic = {
  seq: number; code: string; instanceThumbprint: string; sha256: string;
  instanceEntryHash: string | null; prevHead: string; head: string; at: string;
};

export async function getPortalProof(code: string): Promise<{
  code: string;
  entry: PortalLogEntryPublic;
  segment: PortalLogEntryPublic[];
  truncated: boolean;
  checkpoint: PortalCheckpoint;
} | null> {
  const latest = await db.portalLogEntry.findFirst({ where: { code }, orderBy: { seq: "desc" } });
  if (!latest) return null;
  const rows = await db.portalLogEntry.findMany({
    where: { seq: { gte: latest.seq } },
    orderBy: { seq: "asc" },
    take: MAX_PROOF_SEGMENT + 1,
  });
  const truncated = rows.length > MAX_PROOF_SEGMENT;
  const segment = (truncated ? rows.slice(0, MAX_PROOF_SEGMENT) : rows).map((r) => ({
    seq: r.seq, code: r.code, instanceThumbprint: r.instanceThumbprint, sha256: r.sha256,
    instanceEntryHash: r.instanceEntryHash, prevHead: r.prevHead, head: r.head, at: r.at.toISOString(),
  }));
  return {
    code,
    entry: segment[0],
    segment,
    truncated,
    checkpoint: await buildPortalCheckpoint(),
  };
}

/**
 * Verify a portal inclusion proof: the entry hashes consistently, the segment
 * chains forward link-by-link, and the signed checkpoint covers the head the
 * segment reaches. This is what a third-party monitor runs.
 */
export function verifyPortalProof(proof: {
  entry: PortalLogEntryPublic;
  segment: PortalLogEntryPublic[];
  truncated: boolean;
  checkpoint: PortalCheckpoint;
}): { ok: boolean; reason?: string } {
  const { entry, segment } = proof;
  if (segment.length === 0 || segment[0].seq !== entry.seq) return { ok: false, reason: "segment does not start at the entry" };
  let prev = segment[0];
  for (let i = 0; i < segment.length; i++) {
    const cur = segment[i];
    const recomputed = portalEntryHash({
      seq: cur.seq, code: cur.code, instanceThumbprint: cur.instanceThumbprint, sha256: cur.sha256,
      instanceEntryHash: cur.instanceEntryHash, prevHead: cur.prevHead, at: cur.at,
    });
    if (recomputed !== cur.head) return { ok: false, reason: `entry hash inconsistent at seq ${cur.seq}` };
    if (i > 0) {
      if (cur.seq !== prev.seq + 1) return { ok: false, reason: `segment gap at seq ${cur.seq}` };
      if (cur.prevHead !== prev.head) return { ok: false, reason: `broken chain link at seq ${cur.seq}` };
    }
    prev = cur;
  }
  if (proof.truncated) return { ok: true };
  const cp = proof.checkpoint;
  if (cp.format !== CHECKPOINT_FORMAT || cp.size !== prev.seq || cp.head !== prev.head) {
    return { ok: false, reason: "checkpoint does not cover the segment head" };
  }
  if (!verifyCheckpoint(cp, cp.publicKeyPem)) return { ok: false, reason: "checkpoint signature invalid" };
  return { ok: true };
}
