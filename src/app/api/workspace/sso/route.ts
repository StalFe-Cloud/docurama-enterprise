import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSsoDomain, ownsVerifiedSsoDomain, oidcDiscovery } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * Workspace SSO configuration (Settings → SSO).
 * GET  — list this tenant's connections (secrets redacted).
 * POST — ops: create | update | delete | toggle | test.
 */

function requireWorkspaceAdmin(me: Awaited<ReturnType<typeof requireUser>>): string | null {
  if (!me.tenantId) return "No workspace on this account";
  if (!["OWNER", "ADMIN"].includes(me.workspaceRole ?? "") && me.role !== "PLATFORM_ADMIN") {
    return "Only workspace owners and admins can manage SSO";
  }
  return null;
}

const PROTOCOLS = ["OIDC", "SAML"];

export async function GET() {
  try {
    const me = await requireUser();
    const denied = requireWorkspaceAdmin(me);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    const connections = await db.ssoConnection.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      connections: connections.map((c) => ({
        id: c.id,
        protocol: c.protocol,
        label: c.label,
        emailDomain: c.emailDomain,
        issuerUrl: c.issuerUrl,
        clientId: c.clientId,
        idpMetadataConfigured: Boolean(c.idpMetadataXml),
        clientSecretConfigured: Boolean(c.clientSecret),
        status: c.status,
        platformWide: c.tenantId === null,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("workspace/sso GET", err);
    return NextResponse.json({ error: "Failed to load SSO connections" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const denied = requireWorkspaceAdmin(me);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      op?: string; id?: string; data?: Record<string, unknown>;
    };
    const op = String(body.op ?? "");
    const data = body.data ?? {};

    if (op === "test") {
      // OIDC discovery probe: validates the issuer URL end-to-end before the
      // admin saves anything. SAML metadata is validated on save.
      const issuerUrl = String(data.issuerUrl ?? "").trim();
      if (!issuerUrl) return NextResponse.json({ error: "issuerUrl is required" }, { status: 400 });
      try {
        const doc = await oidcDiscovery(issuerUrl);
        return NextResponse.json({
          ok: true,
          message: `Discovery OK - authorize, token and JWKS endpoints found (issuer ${doc.issuer})`,
          endpoints: {
            authorization: doc.authorization_endpoint,
            token: doc.token_endpoint,
            jwks: doc.jwks_uri,
          },
        });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Discovery failed" }, { status: 400 });
      }
    }

    const protocol = String(data.protocol ?? "").toUpperCase();
    const label = String(data.label ?? "").trim();
    const emailDomain = normalizeSsoDomain(String(data.emailDomain ?? ""));

    if (op === "create" || op === "update") {
      if (!PROTOCOLS.includes(protocol)) return NextResponse.json({ error: "Protocol must be OIDC or SAML" }, { status: 400 });
      if (label.length < 2) return NextResponse.json({ error: "A display label is required (e.g. 'Microsoft Entra ID')" }, { status: 400 });
      if (!emailDomain) {
        return NextResponse.json({ error: "Email domain must look like company.com" }, { status: 400 });
      }
      if (!await ownsVerifiedSsoDomain(me.tenantId, emailDomain)) {
        return NextResponse.json({ error: "Verify ownership of this domain for your workspace before configuring SSO" }, { status: 403 });
      }

      const issuerUrl = protocol === "OIDC" ? String(data.issuerUrl ?? "").trim() : null;
      const clientId = protocol === "OIDC" ? String(data.clientId ?? "").trim() : null;
      const clientSecret = protocol === "OIDC" ? String(data.clientSecret ?? "").trim() : null;
      const idpMetadataXml = protocol === "SAML" ? String(data.idpMetadataXml ?? "").trim() : null;

      if (protocol === "OIDC") {
        if (!/^https?:\/\//.test(issuerUrl ?? "")) return NextResponse.json({ error: "Issuer URL must be an absolute http(s) URL" }, { status: 400 });
        if (!clientId) return NextResponse.json({ error: "clientId is required for OIDC" }, { status: 400 });
        if (op === "create" && !clientSecret) return NextResponse.json({ error: "clientSecret is required for OIDC" }, { status: 400 });
      }
      if (protocol === "SAML") {
        if (!idpMetadataXml?.startsWith("<")) return NextResponse.json({ error: "Paste the IdP's metadata XML" }, { status: 400 });
      }

      // An email domain can only have ONE active connection - enforce it.
      const clash = await db.ssoConnection.findFirst({
        where: { emailDomain, status: "ACTIVE", id: body.id ? { not: body.id } : undefined },
      });
      if (clash) {
        return NextResponse.json(
          { error: `Domain ${emailDomain} already has an active ${clash.protocol} connection (${clash.label})` },
          { status: 400 },
        );
      }

      if (op === "create") {
        const row = await db.ssoConnection.create({
          data: {
            tenantId: me.tenantId,
            protocol, label, emailDomain,
            issuerUrl, clientId,
            ...(clientSecret ? { clientSecret } : {}),
            idpMetadataXml,
          },
        });
        return NextResponse.json({ ok: true, message: `${label} connection created - users on ${emailDomain} can now sign in with it`, id: row.id });
      }

      const existing = await db.ssoConnection.findUnique({ where: { id: String(body.id ?? "") } });
      if (!existing || existing.tenantId !== me.tenantId) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      await db.ssoConnection.update({
        where: { id: existing.id },
        data: {
          protocol, label, emailDomain,
          issuerUrl, clientId,
          ...(clientSecret ? { clientSecret } : {}), // keep the stored secret when the field is blanked
          idpMetadataXml,
        },
      });
      return NextResponse.json({ ok: true, message: `${label} connection updated` });
    }

    if (op === "toggle" || op === "delete") {
      const existing = await db.ssoConnection.findUnique({ where: { id: String(body.id ?? "") } });
      if (!existing || existing.tenantId !== me.tenantId) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      if (op === "toggle") {
        const next = existing.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
        if (next === "ACTIVE") {
          if (!await ownsVerifiedSsoDomain(existing.tenantId, existing.emailDomain)) {
            return NextResponse.json({ error: "The workspace must own a verified domain before SSO can be enabled" }, { status: 403 });
          }
          const clash = await db.ssoConnection.findFirst({
            where: { emailDomain: existing.emailDomain, status: "ACTIVE", id: { not: existing.id } },
          });
          if (clash) return NextResponse.json({ error: `Domain ${existing.emailDomain} already has an active connection (${clash.label})` }, { status: 400 });
        }
        await db.ssoConnection.update({ where: { id: existing.id }, data: { status: next } });
        return NextResponse.json({ ok: true, message: `${existing.label} ${next === "ACTIVE" ? "enabled" : "disabled"}` });
      }
      await db.ssoConnection.delete({ where: { id: existing.id } });
      return NextResponse.json({ ok: true, message: `${existing.label} deleted - those users fall back to password sign-in` });
    }

    return NextResponse.json({ error: "Unsupported operation" }, { status: 400 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("workspace/sso POST", err);
    return NextResponse.json({ error: "SSO operation failed" }, { status: 500 });
  }
}
