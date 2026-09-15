import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/serializers";

/**
 * Download the encrypted PKCS#12 (.p12) bundle for a signing certificate the
 * workspace owns. The bundle is encrypted with the user's own passphrase -
 * Docurama never stores the passphrase, so the file is safe at rest and only
 * the passphrase holder can use the certificate.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser();
    const { id } = await ctx.params;
    if (!me.tenantId) return jsonError("No workspace membership for this account", 403);
    const cert = await db.signingCertificate.findFirst({ where: { id, tenantId: me.tenantId } });
    if (!cert) return jsonError("Certificate not found", 404);
    if (!cert.pkcs12Base64) return jsonError("This certificate has no issued bundle yet - provision it first", 409);
    if (cert.status === "REVOKED") return jsonError("This certificate was revoked - the bundle is no longer available", 409);

    const filename = `docurama-${cert.purpose}-${cert.commonName.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40)}-${cert.serialNumber.slice(0, 8)}.p12`;
    const buf = Buffer.from(cert.pkcs12Base64, "base64");
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/x-pkcs12",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(buf.length),
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[certificate download]", err);
    return jsonError("Download failed", 500);
  }
}
