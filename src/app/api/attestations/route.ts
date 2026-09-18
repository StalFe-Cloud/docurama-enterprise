import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canonicalJson } from "@/lib/canonical-json";
import { verifyCanonical, certThumbprint } from "@/lib/evidence-key";
import { commitmentHash, chainEntryHash, appendPortalLogEntry, TRANSPARENCY_FORMAT } from "@/lib/transparency";
import type { AttestationPayload } from "@/lib/attestation";

/**
 * POST /api/attestations — the public verification portal's receiver.
 *
 * A Docurama instance (usually self-hosted / on-prem) pushes a signed minimal
 * fingerprint for a sealed envelope. Registration is trust-on-first-use: the
 * first public key that claims a thumbprint is pinned to that instance, and a
 * different key presenting the same thumbprint is rejected (a stolen thumbprint
 * cannot be used to publish forgeries). A verification code belongs to the
 * first instance that attested it.
 *
 * Idempotent: re-pushing the same code updates the fingerprint (a re-seal
 * produces a new digest) and refreshes the instance's last-seen stamp.
 */

export const dynamic = "force-dynamic";

const CODE_RE = /^DOC-[A-Z0-9]{6,12}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 16 * 1024;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return bad("Payload too large");

    let body: { payload?: unknown; signature?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return bad("Body must be JSON");
    }
    const payload = body.payload as AttestationPayload | undefined;
    const signature = typeof body.signature === "string" ? body.signature : undefined;
    if (!payload || !signature) return bad("Expected { payload, signature }");

    /* ── Shape validation (never trust the network) ── */
    if (payload.format !== "docurama-attestation" || payload.version !== 1) {
      return bad("Unsupported attestation format");
    }
    const env = payload.envelope;
    if (
      !env || typeof env.code !== "string" || !CODE_RE.test(env.code) ||
      typeof env.sha256 !== "string" || !SHA256_RE.test(env.sha256) ||
      typeof env.sealedAt !== "string" || Number.isNaN(Date.parse(env.sealedAt)) ||
      (env.completedAt !== null && typeof env.completedAt !== "string") ||
      (env.conformance !== null && typeof env.conformance !== "string") ||
      !Number.isInteger(env.pages) || env.pages < 1 || env.pages > 10000 ||
      !Number.isInteger(env.signerCount) || env.signerCount < 0 || env.signerCount > 50
    ) {
      return bad("Invalid envelope fingerprint");
    }
    const inst = payload.instance;
    if (
      !inst || typeof inst.keyId !== "string" || inst.keyId.length > 64 ||
      typeof inst.label !== "string" || inst.label.length > 120 ||
      (inst.verifiedDomain !== null && (typeof inst.verifiedDomain !== "string" || inst.verifiedDomain.length > 253))
    ) {
      return bad("Invalid instance identity");
    }
    if (
      typeof payload.publicKeyPem !== "string" || !payload.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----") ||
      typeof payload.certificatePem !== "string" || !payload.certificatePem.startsWith("-----BEGIN CERTIFICATE-----") ||
      typeof payload.keyThumbprint !== "string" || !/^[0-9a-f]{64}$/.test(payload.keyThumbprint)
    ) {
      return bad("Invalid key material");
    }

    /* ── Transparency claim (optional — absent only for legacy pushes) ── */
    // The claim is inside the signed payload, so it cannot be stripped or
    // altered without breaking the signature above. Two independent checks:
    //   a. the chain entry commits to the exact fingerprint being pushed
    //   b. the entry's own hash is internally consistent
    const claim = payload.transparency as AttestationPayload["transparency"];
    if (claim !== null && claim !== undefined) {
      if (
        claim.format !== TRANSPARENCY_FORMAT ||
        !Number.isInteger(claim.seq) || claim.seq < 1 || claim.seq > 1_000_000_000 ||
        !/^[0-9a-f]{64}$/.test(claim.payloadHash ?? "") ||
        !/^[0-9a-f]{64}$/.test(claim.prevHead ?? "") ||
        !/^[0-9a-f]{64}$/.test(claim.entryHash ?? "") ||
        typeof claim.at !== "string" || Number.isNaN(Date.parse(claim.at))
      ) {
        return bad("Invalid transparency claim");
      }
      const expectedCommitment = commitmentHash({
        code: env.code, sha256: env.sha256, sealedAt: env.sealedAt,
        conformance: env.conformance, pages: env.pages, signerCount: env.signerCount,
      });
      if (claim.payloadHash !== expectedCommitment) {
        return bad("Transparency claim does not commit to the pushed fingerprint");
      }
      if (chainEntryHash({ seq: claim.seq, payloadHash: claim.payloadHash, prevHead: claim.prevHead, at: claim.at }) !== claim.entryHash) {
        return bad("Transparency chain entry hash is inconsistent");
      }
    }

    /* ── Cryptographic checks ── */
    // 1. The certificate must actually be the thing the thumbprint claims.
    if (certThumbprint(payload.certificatePem) !== payload.keyThumbprint) {
      return bad("keyThumbprint does not match certificatePem");
    }
    // 2. The signature must verify with the presented public key.
    if (!verifyCanonical(payload.publicKeyPem, canonicalJson(payload), signature)) {
      return bad("Signature verification failed");
    }

    /* ── TOFU registration / pinning ── */
    let instance = await db.portalInstance.findUnique({ where: { keyThumbprint: payload.keyThumbprint } });
    let registered = false;
    if (!instance) {
      instance = await db.portalInstance.create({
        data: {
          keyThumbprint: payload.keyThumbprint,
          label: inst.label.slice(0, 120),
          verifiedDomain: inst.verifiedDomain ?? null,
          certificatePem: payload.certificatePem,
          publicKeyPem: payload.publicKeyPem,
          attestationCount: 0,
        },
      });
      registered = true;
    } else {
      // Pinning: a registered thumbprint must keep presenting the SAME key.
      if (instance.publicKeyPem !== payload.publicKeyPem) {
        return bad("Key mismatch for a registered instance — refusing to update");
      }
      if (instance.certificatePem !== payload.certificatePem) {
        return bad("Certificate changed for a pinned key");
      }
    }

    /* ── Code ownership: first attester wins ── */
    const existing = await db.portalAttestation.findUnique({ where: { code: env.code } });
    if (existing && existing.instanceThumbprint !== payload.keyThumbprint) {
      return bad("This verification code is already claimed by another instance", 409);
    }

    // Rewrite detection — the whole point of the witnessed chain: the SAME
    // fingerprint for the SAME code must keep claiming the SAME chain entry.
    // A different entryHash for an identical digest means someone is trying to
    // re-anchor history (or hide a previous commitment): refuse.
    const claimedEntryHash = claim ? claim.entryHash : null;
    if (
      existing && existing.sha256 === env.sha256 &&
      existing.tEntryHash && claimedEntryHash &&
      existing.tEntryHash !== claimedEntryHash
    ) {
      return bad("Chain rewrite detected: this fingerprint was already witnessed at a different chain position", 409);
    }

    // Witness in the portal's own append-only log — but only when something
    // actually changed (idempotent re-pushes must not bloat the log).
    const stateChanged = !existing || existing.sha256 !== env.sha256 || (existing.tEntryHash ?? null) !== claimedEntryHash;
    let logInfo: { seq: number; head: string } | null = null;
    if (stateChanged) {
      logInfo = await appendPortalLogEntry({
        code: env.code,
        instanceThumbprint: payload.keyThumbprint,
        sha256: env.sha256,
        instanceEntryHash: claimedEntryHash,
      });
    }

    if (existing) {
      await db.portalAttestation.update({
        where: { code: env.code },
        data: {
          sha256: env.sha256,
          sealedAt: new Date(env.sealedAt),
          completedAt: env.completedAt ? new Date(env.completedAt) : null,
          conformance: env.conformance ?? null,
          pages: env.pages,
          signerCount: env.signerCount,
          verifiedDomain: inst.verifiedDomain ?? null,
          instanceThumbprint: payload.keyThumbprint,
          rawPayload: canonicalJson(payload),
          receivedAt: new Date(),
          tSeq: claim ? claim.seq : null,
          tEntryHash: claimedEntryHash,
        },
      });
    } else {
      await db.portalAttestation.create({
        data: {
          code: env.code,
          sha256: env.sha256,
          sealedAt: new Date(env.sealedAt),
          completedAt: env.completedAt ? new Date(env.completedAt) : null,
          conformance: env.conformance ?? null,
          pages: env.pages,
          signerCount: env.signerCount,
          verifiedDomain: inst.verifiedDomain ?? null,
          instanceThumbprint: payload.keyThumbprint,
          rawPayload: canonicalJson(payload),
          tSeq: claim ? claim.seq : null,
          tEntryHash: claimedEntryHash,
        },
      });
    }
    await db.portalInstance.update({
      where: { keyThumbprint: payload.keyThumbprint },
      data: { lastSeenAt: new Date(), attestationCount: { increment: 1 }, label: inst.label.slice(0, 120) },
    });

    return NextResponse.json({ ok: true, registered, log: logInfo ? { seq: logInfo.seq, head: logInfo.head } : null }, { status: registered ? 201 : 200 });
  } catch (err) {
    console.error("[attestations POST]", err);
    return bad("Attestation processing failed", 500);
  }
}

export async function GET() {
  // Discovery surface: what this receiver is, without exposing any data.
  return NextResponse.json({
    ok: true,
    endpoint: "docurama-portal-attestations",
    version: 1,
    method: "POST",
    body: "{ payload, signature } — see docs/SELF-HOSTED-ATTESTATION.md",
    transparency: "/api/transparency/checkpoint, /api/transparency/proof/{code}",
  });
}
