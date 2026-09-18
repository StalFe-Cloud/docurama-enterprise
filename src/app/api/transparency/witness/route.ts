import { NextRequest } from "next/server";
import { requirePlatformAdmin, recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { getPortalKeyWitness, witnessPortalKey } from "@/lib/rekor";

/**
 * POST /api/transparency/witness — witness (or re-read) the portal
 * transparency key's Rekor entry. Platform-admin only: this op talks to the
 * outside world on purpose, and an operator behind a firewall may prefer to
 * keep it manual rather than lazy (the public checkpoint endpoint attempts
 * it automatically, rate-limited, when no witness exists).
 *
 *   {}   → witness now if needed; returns the current witness state either way
 */

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();

    const result = await witnessPortalKey();
    if (!result.pushed) {
      // Not an error state — the portal stays fully functional on TOFU. The
      // admin gets the reason so a firewall problem is diagnosable.
      return jsonOk({
        ok: true,
        witnessed: false,
        reason: result.reason,
        note: "The portal keeps serving TOFU checkpoints; retry once egress to the Rekor log is possible.",
      });
    }

    await recordAudit({
      actor: `${admin.firstName} ${admin.lastName}`,
      actorRole: "PLATFORM_ADMIN",
      action: "transparency.key_witnessed",
      resource: `rekor:${result.witness.entryUUID}`,
      severity: "INFO",
      detail: `Portal key witnessed in ${result.witness.rekorUrl} (logIndex ${result.witness.logIndex})`,
    });

    return jsonOk({ ok: true, witnessed: true, witness: result.witness });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[transparency witness POST]", err);
    return jsonError("Witness attempt failed", 500);
  }
}

/** GET for convenience: the current witness state without triggering anything. */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const witness = await getPortalKeyWitness();
    return jsonOk({ ok: true, witnessed: !!witness, witness });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[transparency witness GET]", err);
    return jsonError("Witness read failed", 500);
  }
}
