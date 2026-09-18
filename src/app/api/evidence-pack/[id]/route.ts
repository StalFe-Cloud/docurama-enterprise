import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildEvidencePack, recordEvidencePackExport, EvidencePackError } from "@/lib/evidence-pack";

/**
 * GET /api/evidence-pack/{envelopeIdOrCode} — workspace download of the signed
 * evidence pack (session cookie auth, tenant-scoped). The envelope detail
 * sheet links here for completed envelopes.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!me.tenantId) return NextResponse.json({ error: "No workspace membership for this account" }, { status: 403 });
    const { id } = await ctx.params;

    const pack = await buildEvidencePack(id, me.tenantId);
    await recordEvidencePackExport(id, me.tenantId, `${me.firstName} ${me.lastName}`);

    return new NextResponse(new Uint8Array(pack.bytes), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${pack.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err; // requireUser throws its own Response
    if (err instanceof EvidencePackError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[evidence-pack GET]", err);
    return NextResponse.json({ error: "Evidence pack export failed" }, { status: 500 });
  }
}
