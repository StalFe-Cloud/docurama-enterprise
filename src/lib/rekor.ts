/**
 * Sigstore Rekor witnessing of the portal transparency key — neutral
 * third-party proof that the key the verification portal asks monitors to
 * pin (TOFU) existed at a point in time and committed to its own
 * fingerprint.
 *
 * Why: the transparency registry's checkpoints are signed by the PORTAL's
 * own key. Monitors pin it on first sight, but a portal operator could hand
 * a new monitor a different key and rewrite history against it. A
 * `hashedrekord` in Rekor — the public, OpenSSF-operated, append-only
 * transparency log — is signed BY the portal key and timestamps its
 * fingerprint in a log the portal operator cannot edit. A substituted key
 * is then publicly provable: the pinned fingerprint is in Rekor (or the
 * claimed one is not), independent of anything this portal serves.
 *
 * Cost: the public instance (rekor.sigstore.dev) is free — no account, no
 * key, no billing — with no SLA and rate limits. That fits the trust model:
 * one entry per portal key (a handful of bytes), not per envelope.
 *
 * Degradation is a feature: behind a firewall, offline, or with
 * REKOR_WITNESS=off, nothing here blocks anything. The witness row simply
 * stays absent and the portal keeps serving TOFU checkpoints.
 *
 * Environment:
 *   REKOR_API_URL  base URL of the log (default https://rekor.sigstore.dev;
 *                  self-hosters can point at a private Rekor or a mirror)
 *   REKOR_WITNESS  "off" disables witnessing entirely
 */

import { createHash, sign as nodeSign, verify as nodeVerify } from "crypto";
import { db } from "@/lib/db";
import { canonicalJson } from "@/lib/canonical-json";
import { getOrCreatePortalKey, portalKeyFingerprint } from "@/lib/transparency";

export const WITNESS_STATEMENT_FORMAT = "docurama-portal-key-witness-v1";

export function rekorApiUrl(): string {
  const raw = (process.env.REKOR_API_URL ?? "https://rekor.sigstore.dev").trim();
  return raw.replace(/\/+$/, ""); // trailing slashes break path joins
}

export function rekorWitnessingEnabled(): boolean {
  return (process.env.REKOR_WITNESS ?? "").trim().toLowerCase() !== "off";
}

/** Per-request timeout — a firewalled egress must fail fast, never hang a checkpoint. */
const FETCH_TIMEOUT_MS = 8000;
/** How long to poll for the inclusion proof (the public log integrates in seconds). */
const PROOF_POLL_ATTEMPTS = 5;
const PROOF_POLL_INTERVAL_MS = 1500;
/** In-process cooldown for lazy attempts, so a public checkpoint endpoint cannot be used to spam Rekor. */
const LAZY_COOLDOWN_MS = 5 * 60 * 1000;
const lazyLastAttempt = new Map<string, number>();

export type WitnessStatement = {
  format: string;
  keyId: string;
  keyFingerprint: string;
  createdAt: string; // ISO
};

export type WitnessResult =
  | { pushed: true; witness: WitnessRowPublic }
  | { pushed: false; reason: string };

/** The public shape stored on the row and served by the checkpoint endpoint. */
export type WitnessRowPublic = {
  subject: string;
  keyFingerprint: string;
  rekorUrl: string;
  entryUUID: string;
  entryUrl: string;
  logIndex: number;
  treeSize: number | null;
  integratedTime: string;
  statement: WitnessStatement;
  statementHash: string;
  signature: string;
  inclusionProof: Record<string, unknown> | null;
};

type WitnessRow = {
  subject: string; keyFingerprint: string; rekorUrl: string; entryUUID: string;
  logIndex: number; treeSize: number | null; integratedTime: Date;
  statement: string; statementHash: string; signature: string;
  inclusionProof: string | null;
};

function toPublic(row: WitnessRow): WitnessRowPublic {
  return {
    subject: row.subject,
    keyFingerprint: row.keyFingerprint,
    rekorUrl: row.rekorUrl,
    entryUUID: row.entryUUID,
    entryUrl: `${row.rekorUrl}/api/v1/log/entries?logIndex=${row.logIndex}`,
    logIndex: row.logIndex,
    treeSize: row.treeSize,
    integratedTime: row.integratedTime.toISOString(),
    statement: JSON.parse(row.statement) as WitnessStatement,
    statementHash: row.statementHash,
    signature: row.signature,
    inclusionProof: row.inclusionProof ? (JSON.parse(row.inclusionProof) as Record<string, unknown>) : null,
  };
}

/** The stored witness for the portal key, if any (public shape, or null). */
export async function getPortalKeyWitness(): Promise<WitnessRowPublic | null> {
  const row = await db.rekorWitness.findUnique({ where: { id: "portal-key" } });
  return row ? toPublic(row) : null;
}

/**
 * Witness the portal key in Rekor. Never throws: a neutral log is an
 * enhancement on top of TOFU, and every failure mode (offline, firewalled,
 * rate-limited, misconfigured) degrades to "not witnessed yet".
 */
export async function witnessPortalKey(opts: { force?: boolean } = {}): Promise<WitnessResult> {
  try {
    if (!rekorWitnessingEnabled()) return { pushed: false, reason: "witnessing disabled (REKOR_WITNESS=off)" };

    const existing = await db.rekorWitness.findUnique({ where: { id: "portal-key" } });

    const key = await getOrCreatePortalKey();
    const fingerprint = portalKeyFingerprint(key.publicKeyPem);

    // Already witnessed for this key generation: idempotent.
    if (existing && existing.keyFingerprint === fingerprint) {
      return { pushed: true, witness: toPublic(existing) };
    }

    // The statement is exactly the bytes signed AND hashed — a monitor can
    // re-derive both from this row alone, without trusting this portal.
    const statement: WitnessStatement = {
      format: WITNESS_STATEMENT_FORMAT,
      keyId: "portal",
      keyFingerprint: fingerprint,
      createdAt: new Date().toISOString(),
    };
    const statementJson = canonicalJson(statement);
    const statementBytes = Buffer.from(statementJson, "utf8");
    const statementHash = createHash("sha256").update(statementBytes).digest("hex");
    const signature = nodeSign("sha256", statementBytes, key.privateKeyPem).toString("base64");

    const rekorUrl = rekorApiUrl();
    const entry = {
      apiVersion: "0.0.1",
      kind: "hashedrekord",
      spec: {
        data: { hash: { algorithm: "sha256", value: statementHash } },
        signature: {
          content: signature,
          publicKey: { content: Buffer.from(key.publicKeyPem, "utf8").toString("base64") },
        },
      },
    };

    const res = await fetch(`${rekorUrl}/api/v1/log/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 201 && typeof body === "object" && body !== null) {
      const first = Object.values(body)[0] as
        | { logIndex?: number; integratedTime?: number; verification?: { inclusionProof?: Record<string, unknown> } }
        | undefined;
      const entryUUID = Object.keys(body)[0] ?? "";
      if (!first || typeof first.logIndex !== "number" || typeof first.integratedTime !== "number" || !entryUUID) {
        return { pushed: false, reason: `rekor returned an unexpected 201 body (status ${res.status})` };
      }

      // The create response usually carries the inclusion proof already;
      // when it lags, poll by logIndex — the public log integrates in seconds.
      let inclusionProof = first.verification?.inclusionProof ?? null;
      for (let attempt = 0; !inclusionProof && attempt < PROOF_POLL_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, PROOF_POLL_INTERVAL_MS));
        const got = await fetchInclusionProof(rekorUrl, first.logIndex);
        if (got) inclusionProof = got;
      }

      const treeSize = readTreeSize(inclusionProof);

      const row = await db.rekorWitness.upsert({
        where: { id: "portal-key" },
        create: {
          id: "portal-key", subject: "portal-key", keyFingerprint: fingerprint,
          rekorUrl, entryUUID, logIndex: first.logIndex, treeSize,
          integratedTime: new Date(first.integratedTime * 1000),
          statement: statementJson, statementHash, signature,
          inclusionProof: inclusionProof ? JSON.stringify(inclusionProof) : null,
        },
        update: {
          subject: "portal-key", keyFingerprint: fingerprint,
          rekorUrl, entryUUID, logIndex: first.logIndex, treeSize,
          integratedTime: new Date(first.integratedTime * 1000),
          statement: statementJson, statementHash, signature,
          inclusionProof: inclusionProof ? JSON.stringify(inclusionProof) : null,
        },
      });
      return { pushed: true, witness: toPublic(row) };
    }

    // A duplicate submission for the same statement returns 409 with the
    // existing UUID — treat as already witnessed by re-reading the row.
    if (res.status === 409 && existing) return { pushed: true, witness: toPublic(existing) };
    return { pushed: false, reason: `rekor rejected the entry (HTTP ${res.status})` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return { pushed: false, reason: `rekor unreachable: ${reason}` };
  }
}

/**
 * Lazy witnessing for the public checkpoint endpoint: try once per process
 * per cooldown window while the key is unwitnessed, never blocking and never
 * spamming the neutral log. Self-hosters behind firewalls pay one timed-out
 * attempt per window at most.
 */
export async function witnessPortalKeyLazily(): Promise<void> {
  if (!rekorWitnessingEnabled()) return;
  const last = lazyLastAttempt.get("portal-key") ?? 0;
  if (Date.now() - last < LAZY_COOLDOWN_MS) return;
  lazyLastAttempt.set("portal-key", Date.now());

  const existing = await db.rekorWitness.findUnique({ where: { id: "portal-key" } });
  if (existing) return;

  const result = await witnessPortalKey();
  if (!result.pushed) {
    // Informational only — TOFU checkpoints keep flowing.
    console.warn(`[rekor] portal-key witness not recorded: ${result.reason}`);
  }
}

async function fetchInclusionProof(rekorUrl: string, logIndex: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${rekorUrl}/api/v1/log/entries?logIndex=${logIndex}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    const first = Object.values(body)[0] as { verification?: { inclusionProof?: Record<string, unknown> } } | undefined;
    return first?.verification?.inclusionProof ?? null;
  } catch {
    return null;
  }
}

function readTreeSize(proof: Record<string, unknown> | null): number | null {
  const v = proof?.treeSize;
  return typeof v === "number" ? v : null;
}

/**
 * Verify a witness end-to-end from public data alone — what a monitor runs:
 *   1. the statement hashes to statementHash (what the hashedrekord commits to)
 *   2. the signature verifies under the portal key
 *   3. the statement commits to that key's own fingerprint
 */
export function verifyWitness(
  witness: WitnessRowPublic,
  publicKeyPem: string,
): { ok: boolean; reason?: string } {
  try {
    const statement = witness.statement;
    if (statement.format !== WITNESS_STATEMENT_FORMAT) return { ok: false, reason: "unknown witness statement format" };
    const bytes = Buffer.from(canonicalJson(statement), "utf8");
    if (createHash("sha256").update(bytes).digest("hex") !== witness.statementHash) {
      return { ok: false, reason: "statement hash mismatch" };
    }
    if (!nodeVerify("sha256", bytes, publicKeyPem, Buffer.from(witness.signature, "base64"))) {
      return { ok: false, reason: "statement signature invalid" };
    }
    if (statement.keyFingerprint !== portalKeyFingerprint(publicKeyPem)) {
      return { ok: false, reason: "statement commits to a different key fingerprint" };
    }
    if (statement.keyFingerprint !== witness.keyFingerprint) {
      return { ok: false, reason: "witness row fingerprint mismatch" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "witness verification threw" };
  }
}
