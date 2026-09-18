import { NextResponse } from "next/server";
import { buildPortalCheckpoint, getPortalLogHead } from "@/lib/transparency";
import { getPortalKeyWitness, witnessPortalKeyLazily } from "@/lib/rekor";

/**
 * GET /api/transparency/checkpoint — the public, pollable checkpoint of the
 * verification portal's append-only attestation log.
 *
 * Anyone can run a monitor against this endpoint: pin the portal key on first
 * sight (keyFingerprint), then keep every checkpoint. A log that shrinks, or
 * whose head changes without new entries chaining from the old one, is proof
 * of a rewrite. Same gossip model as Certificate Transparency, scaled down.
 *
 * When the key has been witnessed in Sigstore Rekor, the response carries the
 * witness block (statement + signature + logIndex + inclusion proof): the
 * TOFU pin then has neutral third-party anchoring — a substituted key is
 * publicly contradicted by the Rekor entry. If the key is not yet witnessed,
 * the first checkpoint request after boot triggers a lazy attempt (rate
 * limited; firewalled deployments simply keep serving TOFU checkpoints).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fire-and-forget by design: the witness attempt (up to ~15s when Rekor
    // is slow to integrate an entry) must not gate the checkpoint itself.
    // The NEXT checkpoint serves the witness block once it exists.
    void witnessPortalKeyLazily().catch(() => undefined);

    const checkpoint = await buildPortalCheckpoint();
    const head = await getPortalLogHead();
    const witness = await getPortalKeyWitness();
    return NextResponse.json(
      {
        ok: true,
        endpoint: "docurama-transparency-checkpoint",
        log: { size: head.seq, head: head.head },
        checkpoint,
        ...(witness ? { witness } : {}),
        howToMonitor:
          "Poll this endpoint, pin keyFingerprint (TOFU), and keep every checkpoint — a shrinking log or a re-anchored head is proof of a rewrite. Inclusion proofs: /api/transparency/proof/{code}. When a `witness` block is present, verify the statement signature under the checkpoint key and check the entry in the Rekor log it cites: the key pin then has neutral third-party anchoring.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[transparency checkpoint GET]", err);
    return NextResponse.json({ error: "Checkpoint unavailable" }, { status: 500 });
  }
}
