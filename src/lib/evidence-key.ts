/**
 * Per-tenant evidence key — the signing identity behind evidence packs and
 * public-portal attestations.
 *
 * Unlike workspace signing certificates (where the private key is exported and
 * never persisted), the evidence key is a server-held key: it must be able to
 * sign on demand, at export and at seal time. It is a real RSA-2048 key pair
 * with a self-signed X.509 certificate issued via the system OpenSSL, exactly
 * like src/lib/certificates.ts, with one deliberate extension: when the tenant
 * has a DNS-TXT-verified sending domain, that domain is embedded as a
 * subjectAltName. The certificate therefore carries the domain-control proof
 * (the TXT record was actually queried and matched before issuance) with every
 * signature it makes.
 *
 * Trust model, stated honestly: this is a self-signed certificate. What vouches
 * for it is (a) DNS — the SAN domain was proven controlled by the tenant at
 * issuance, and (b) TOFU pinning on the portal side — the first key an instance
 * registers is the key every later attestation must match. It is not a QTSP
 * chain and never claims to be.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign as nodeSign, verify as nodeVerify } from "crypto";
import { db } from "@/lib/db";
import { canonicalJson } from "@/lib/canonical-json";

const run = promisify(execFile);

export const EVIDENCE_KEY_VALIDITY_DAYS = 1825; // 5 years
export const EVIDENCE_SIGNATURE_ALGORITHM = "RSASSA-PKCS1-v1_5-SHA-256";

/** Strip characters that would break an OpenSSL -subj / -addext string. */
const subjSafe = (s: string, max = 64) =>
  s.replace(/[\/\\\n\r\0,]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export type EvidenceKeyRow = {
  keyId: string;
  thumbprint: string;
  certificatePem: string;
  publicKeyPem: string;
  privateKeyPem: string;
  sanDomain: string | null;
  createdAt: Date;
};

/** SHA-256 of a PEM certificate's DER bytes, lowercase hex — the thumbprint format used everywhere. */
export function certThumbprint(certificatePem: string): string {
  const der = Buffer.from(
    certificatePem
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
      .replace(/\s+/g, ""),
    "base64",
  );
  return createHash("sha256").update(der).digest("hex");
}

async function issueKeyCertificate(opts: {
  tenantName: string;
  sanDomain: string | null;
}): Promise<{ certificatePem: string; publicKeyPem: string; privateKeyPem: string }> {
  const dir = await mkdtemp(join(tmpdir(), "docurama-ekey-"));
  try {
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    const args = [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256",
      "-days", String(EVIDENCE_KEY_VALIDITY_DAYS),
      "-nodes", "-keyout", keyPath, "-out", certPath,
      "-subj", `/CN=${subjSafe(`Docurama Evidence Key - ${opts.tenantName}`)}/O=${subjSafe(opts.tenantName)}/C=FR`,
    ];
    if (opts.sanDomain) {
      args.push("-addext", `subjectAltName=DNS:${subjSafe(opts.sanDomain, 253)}`);
    }
    await run("openssl", args);

    // Extract the SPKI public key from the certificate so verifiers never
    // have to parse X.509 to check a signature.
    const pub = await run("openssl", ["x509", "-in", certPath, "-pubkey", "-noout"]);

    const [privateKeyPem, certificatePem] = await Promise.all([
      readFile(keyPath, "utf8"),
      readFile(certPath, "utf8"),
    ]);
    return { certificatePem: certificatePem.trim(), publicKeyPem: pub.stdout.trim(), privateKeyPem: privateKeyPem.trim() };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Get (or lazily create) the tenant's evidence key. The SAN domain is chosen
 * at issuance time: the most recently DNS-verified sending domain, if any.
 * Creation is raced-safe on the tenantId unique constraint.
 */
export async function getOrCreateEvidenceKey(tenantId: string): Promise<EvidenceKeyRow> {
  const existing = await db.evidenceKey.findUnique({ where: { tenantId } });
  if (existing) return existing;

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Tenant not found");
  const verifiedDomain = await db.domain.findFirst({
    where: { tenantId, purpose: "SENDING", status: "VERIFIED" },
    orderBy: { verifiedAt: "desc" },
  });

  const issued = await issueKeyCertificate({
    tenantName: tenant.name,
    sanDomain: verifiedDomain?.domain ?? null,
  });

  try {
    return await db.evidenceKey.create({
      data: {
        tenantId,
        keyId: `ek_${randomBytes(12).toString("hex")}`,
        certificatePem: issued.certificatePem,
        publicKeyPem: issued.publicKeyPem,
        privateKeyPem: issued.privateKeyPem,
        thumbprint: certThumbprint(issued.certificatePem),
        sanDomain: verifiedDomain?.domain ?? null,
      },
    });
  } catch {
    // Lost a creation race (or the row appeared meanwhile) — re-read.
    const winner = await db.evidenceKey.findUnique({ where: { tenantId } });
    if (!winner) throw new Error("Evidence key creation failed");
    return winner;
  }
}

/** Sign a canonical-JSON payload string. Returns base64. */
export function signCanonical(privateKeyPem: string, canonical: string): string {
  return nodeSign("sha256", Buffer.from(canonical, "utf8"), createPrivateKey(privateKeyPem)).toString("base64");
}

/** Verify a base64 signature over a canonical-JSON payload string. */
export function verifyCanonical(publicKeyPem: string, canonical: string, signatureB64: string): boolean {
  try {
    return nodeVerify(
      "sha256",
      Buffer.from(canonical, "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

/** Convenience: canonicalize + sign in one step. */
export function signPayload(privateKeyPem: string, payload: unknown): string {
  return signCanonical(privateKeyPem, canonicalJson(payload));
}

/** Convenience: canonicalize + verify in one step. */
export function verifyPayload(publicKeyPem: string, payload: unknown, signatureB64: string): boolean {
  return verifyCanonical(publicKeyPem, canonicalJson(payload), signatureB64);
}
