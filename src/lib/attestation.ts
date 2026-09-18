/**
 * Public-portal attestation — how a self-hosted / on-prem Docurama instance
 * makes its sealed envelopes verifiable on the public verification portal
 * without ever sending the document or personal data.
 *
 * When an envelope is sealed, the instance (if EVIDENCE_PORTAL_URL is
 * configured) pushes a signed MINIMAL fingerprint to the portal:
 *
 *   { format, version, instance{keyId,label,verifiedDomain},
 *     envelope{code,sha256,sealedAt,completedAt,conformance,pages,signerCount},
 *     publicKeyPem, certificatePem, keyThumbprint }
 *   + RSA-SHA-256 signature over the canonical JSON of that payload
 *
 * GDPR posture: the fingerprint is deliberately free of personal data — no
 * signer names, no emails, no document bytes, no title. The portal can answer
 * "does a sealed envelope with this code and this digest exist, signed by an
 * instance whose key was first seen on date X?" and nothing else.
 *
 * Trust model: trust-on-first-use key registration (see /api/attestations).
 * The first key that presents a thumbprint is pinned to that instance; any
 * later push with the same thumbprint but a different key is rejected. See
 * docs/SELF-HOSTED-ATTESTATION.md for the honest limits and the upgrade path
 * (license-signed keys / transparency registry).
 */

import { db } from "@/lib/db";
import { canonicalJson } from "@/lib/canonical-json";
import { getOrCreateEvidenceKey, signPayload, certThumbprint } from "@/lib/evidence-key";
import { appendSealCommitment, claimFromEntry, type SealCommitment, type TransparencyClaim } from "@/lib/transparency";

export const ATTESTATION_FORMAT = "docurama-attestation";
export const ATTESTATION_VERSION = 1;

export type AttestationPayload = {
  format: string;
  version: number;
  instance: { keyId: string; label: string; verifiedDomain: string | null };
  envelope: {
    code: string;
    sha256: string;
    sealedAt: string;
    completedAt: string | null;
    conformance: string | null;
    pages: number;
    signerCount: number;
  };
  publicKeyPem: string;
  certificatePem: string;
  keyThumbprint: string;
  /** Chain position of this seal in the tenant's append-only transparency log.
   *  Null only for pre-registry envelopes pushed before the feature existed —
   *  today every push carries one (lazily appended if the seal predates it). */
  transparency: TransparencyClaim | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Build the signed attestation body for a sealed envelope (no I/O to the portal). */
export async function buildAttestation(envelopeId: string): Promise<{ payload: AttestationPayload; signature: string } | null> {
  const e = await db.envelope.findUnique({
    where: { id: envelopeId },
    include: { tenant: { select: { name: true } }, recipients: true },
  });
  if (!e || e.status !== "COMPLETED" || !e.sealedAt || !e.sha256) return null;

  const signerCount = e.recipients.filter((r) => r.role === "SIGNER" && r.status === "SIGNED").length;

  // Append-only transparency chain: the seal commitment is chained (idempotently —
  // same envelope + same fingerprint reuses its entry) BEFORE the payload is
  // signed, so the signature is bound to the chain position and cannot be
  // replayed at a different one.
  const commitment: SealCommitment = {
    code: e.publicCode,
    sha256: e.sha256,
    sealedAt: e.sealedAt.toISOString(),
    conformance: e.conformanceLevel,
    pages: e.pages,
    signerCount,
  };
  const entry = await appendSealCommitment({ tenantId: e.tenantId, envelopeId: e.id, commitment });

  const key = await getOrCreateEvidenceKey(e.tenantId);
  const payload: AttestationPayload = {
    format: ATTESTATION_FORMAT,
    version: ATTESTATION_VERSION,
    instance: { keyId: key.keyId, label: e.tenant.name, verifiedDomain: key.sanDomain },
    envelope: {
      code: e.publicCode,
      sha256: e.sha256,
      sealedAt: e.sealedAt.toISOString(),
      completedAt: iso(e.completedAt),
      conformance: e.conformanceLevel,
      pages: e.pages,
      signerCount,
    },
    publicKeyPem: key.publicKeyPem,
    certificatePem: key.certificatePem,
    keyThumbprint: certThumbprint(key.certificatePem),
    transparency: claimFromEntry(entry),
  };
  return { payload, signature: signPayload(key.privateKeyPem, payload) };
}

/**
 * Push the attestation for a sealed envelope to the configured public portal.
 * Called after sealing; failures are recorded on the envelope (attestStatus)
 * but NEVER claimed in the event ledger — the ledger only states what actually
 * happened.
 */
export async function pushAttestationForEnvelope(
  envelopeId: string,
): Promise<{ pushed: boolean; note: string }> {
  const portalUrl = process.env.EVIDENCE_PORTAL_URL?.trim();
  if (!portalUrl) return { pushed: false, note: "no portal configured (EVIDENCE_PORTAL_URL unset)" };

  const built = await buildAttestation(envelopeId);
  if (!built) return { pushed: false, note: "envelope is not sealed" };

  const envelope = await db.envelope.findUnique({ where: { id: envelopeId }, select: { publicCode: true } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${portalUrl.replace(/\/+$/, "")}/api/attestations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: built.payload, signature: built.signature }),
      signal: controller.signal,
    });
    if (res.ok) {
      await db.envelope.update({ where: { id: envelopeId }, data: { attestedAt: new Date(), attestStatus: "PUSHED" } });
      await db.envelopeEvent.create({
        data: {
          envelopeId,
          actor: "Docurama",
          action: "ATTESTED",
          detail: `Evidence fingerprint (code + SHA-256, no personal data) published to the public verification portal`,
        },
      });
      return { pushed: true, note: `attested ${envelope?.publicCode ?? ""}` };
    }
    const errText = (await res.text().catch(() => "")).slice(0, 200);
    await db.envelope.update({ where: { id: envelopeId }, data: { attestStatus: "FAILED" } }).catch(() => undefined);
    return { pushed: false, note: `portal responded HTTP ${res.status}: ${errText}` };
  } catch (err) {
    await db.envelope.update({ where: { id: envelopeId }, data: { attestStatus: "FAILED" } }).catch(() => undefined);
    return { pushed: false, note: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Canonical form of a payload — shared with the receiver so both sides agree. */
export const attestationCanonical = canonicalJson;
