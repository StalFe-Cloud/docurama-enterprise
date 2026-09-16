import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk } from "@/lib/serializers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let domain = (url.searchParams.get("domain") ?? "").trim().toLowerCase();
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();

  if (!domain && email.includes("@")) {
    domain = email.split("@")[1]?.trim() ?? "";
  }
  domain = domain.replace(/^@+/, "").trim();

  // Exclude common public free webmail providers
  const publicWebmail = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com",
    "hotmail.fr", "outlook.com", "outlook.fr", "icloud.com", "proton.me",
    "protonmail.com", "laposte.net", "orange.fr", "free.fr", "sfr.fr",
  ]);

  if (!domain || publicWebmail.has(domain) || !domain.includes(".")) {
    return jsonOk({ autoJoin: false });
  }

  const match = await db.domain.findFirst({
    where: {
      domain,
      status: "VERIFIED",
      purpose: { in: ["AUTO_JOIN", "JOIN"] },
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          planCode: true,
        },
      },
    },
  });

  if (!match) {
    return jsonOk({ autoJoin: false });
  }

  return jsonOk({
    autoJoin: true,
    domain: match.domain,
    tenantId: match.tenant.id,
    tenantName: match.tenant.name,
    tenantSlug: match.tenant.slug,
  });
}
