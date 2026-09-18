import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import net from "net";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { hashPassword, recordAudit } from "@/lib/auth";
import { jsonError, jsonOk, iso, isos } from "@/lib/serializers";
import { generateTotpSecret, verifyTotp, otpauthUri, generateRecoveryCodes } from "@/lib/totp";
import { issueSigningCertificate, shortThumbprint } from "@/lib/certificates";
import { validateFilenameFormat } from "@/lib/esign";
import { verifySendingDomain, checkEmailPosture } from "@/lib/dns-check";
import { providerByKey } from "@/lib/sms-providers";
import { MCP_DEFAULT_TOOLS, mcpToolsCatalogue } from "@/lib/mcp";
import { WEBHOOK_EVENTS } from "@/lib/api-reference";
import { createInvitation, requestOrigin } from "@/lib/onboarding";
import { seatCapacity } from "@/lib/billing";
import { planDef } from "@/lib/plans";

/**
 * Workspace Settings API - GET sections and POST operations behind
 * /api/workspace/settings* and the certificate download route.
 *
 * Secrets policy: SMTP passwords, SMS secrets, TOTP secrets and PKCS#12 blobs
 * are persisted but never echoed back - only masked previews / has* flags.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const mask = (v: string | null | undefined) => (v ? `••••••••${v.slice(-4)}` : null);

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const adminRoles = (me: SessionUser) => me.workspaceRole === "OWNER" || me.workspaceRole === "ADMIN" || me.role === "PLATFORM_ADMIN";

// ── Lazy per-tenant config rows (created with defaults on first read) ────────

async function ensureEsignPrefs(tenantId: string) {
  return db.esignPreferences.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
}
async function ensureNotificationSettings(tenantId: string) {
  return db.notificationSettings.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
}
async function ensureSmsGateway(tenantId: string) {
  return db.smsGateway.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
}
async function ensureMcpConfig(tenantId: string) {
  return db.mcpConfig.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId, allowedTools: MCP_DEFAULT_TOOLS },
  });
}

// ── GET sections ─────────────────────────────────────────────────────────────

export async function getSettingsSection(
  section: string,
  me: SessionUser,
): Promise<Response> {
  const tenantId = me.tenantId!;
  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user) return jsonError("Account not found", 404);

  switch (section) {
    case "settings": {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        include: { members: { include: { user: true, team: true } }, subscriptions: { take: 1 }, teams: { orderBy: { name: "asc" }, include: { members: { select: { id: true } } } } },
      });
      const [keys, signatures, invitations, capacity] = await Promise.all([
        db.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
        db.userSignature.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" } }),
        db.invitation.findMany({ where: { tenantId, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
        seatCapacity(tenantId),
      ]);
      const plan = await db.plan.findUnique({ where: { code: tenant!.planCode } });
      return jsonOk({
        profile: {
          firstName: user.firstName, lastName: user.lastName, email: user.email,
          // Truthful own-state: seeded demo flags without a real secret don't count.
          totpEnabled: user.totpEnabled && Boolean(user.totpSecret),
          signatureName: user.signatureName ?? `${user.firstName} ${user.lastName}`,
          signatureStyle: user.signatureStyle ?? "signature-font-caveat",
          passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
        },
        org: {
          name: tenant!.name, slug: tenant!.slug, planCode: tenant!.planCode,
          billingEmail: tenant!.billingEmail, createdAt: tenant!.createdAt.toISOString(),
          storageUsedMb: tenant!.storageUsedMb,
        },
        orgs: me.orgs,
        activeTenantId: me.tenantId,
        plan: plan ? iso(plan) : null,
        subscription: tenant!.subscriptions[0] ? iso(tenant!.subscriptions[0]) : null,
        signatures: signatures.map((s) => ({
          id: s.id, kind: s.kind, method: s.method, value: s.value, font: s.font,
          isDefault: s.isDefault, createdAt: s.createdAt.toISOString(),
        })),
        apiKeys: isos(keys).map((k) => ({ ...k, secretHash: undefined })),
        invitations: invitations.map((i) => ({
          id: i.id, email: i.email, role: i.role, invitedBy: i.invitedBy,
          createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString(),
        })),
        members: tenant!.members.map((m) => ({
          id: m.id, role: m.role, name: `${m.user.firstName} ${m.user.lastName}`,
          email: m.user.email, status: m.user.status, totpEnabled: m.user.totpEnabled,
          lastActiveAt: m.user.lastActiveAt?.toISOString() ?? null,
          teamId: m.teamId, teamName: m.team?.name ?? null,
        })),
        // Seat occupancy incl. pending invitations (cycle 10) — drives the
        // "invite your team to the remaining seats" guidance.
        seats: {
          used: capacity.used, limit: capacity.seatLimit, remaining: capacity.remaining,
          members: capacity.members, pendingInvites: capacity.pendingInvites, planName: planDef(capacity.planCode).name,
        },
        teams: tenant!.teams.map((t) => ({ id: t.id, name: t.name, memberCount: t.members.length })),
        isAdmin: adminRoles(me),
      });
    }

    case "settings-account": {
      const now = new Date();
      const [sessions, secEvents, auditTrail, tenant, domains, prefs] = await Promise.all([
        db.session.findMany({
          where: { userId: me.id, revokedAt: null, expiresAt: { gt: now } },
          orderBy: { lastSeenAt: "desc" }, take: 20,
        }),
        db.securityEvent.findMany({
          where: { OR: [{ actor: me.email }, { actor: `${user.firstName} ${user.lastName}` }] },
          orderBy: { at: "desc" }, take: 10,
        }),
        db.auditEvent.findMany({
          where: { OR: [{ resource: `user:${me.email}` }, { actor: `${user.firstName} ${user.lastName}` }] },
          orderBy: { at: "desc" }, take: 8,
        }),
        db.tenant.findUnique({ where: { id: tenantId } }),
        db.domain.findMany({ where: { tenantId, purpose: "SENDING" }, orderBy: { requestedAt: "desc" } }),
        ensureEsignPrefs(tenantId),
      ]);
      return jsonOk({
        sessions: sessions.map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.userAgent,
          createdAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          current: s.id === me.sessionId,
        })),
        securityEvents: isos(secEvents),
        auditTrail: isos(auditTrail),
        enforceTwoFactor: tenant!.enforceTwoFactor,
        domains: domains.map((d) => ({
          id: d.id, domain: d.domain, status: d.status, token: d.token, method: d.method,
          verifiedAt: d.verifiedAt?.toISOString() ?? null,
          lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
          lastCheckNote: d.lastCheckNote,
        })),
        part11: {
          part11Mode: prefs.part11Mode,
          requireReauth: prefs.requireReauth,
          signatureLevel: prefs.signatureLevel,
          consentVersion: prefs.consentVersion,
        },
        isAdmin: adminRoles(me),
      });
    }

    case "settings-esign": {
      const [certs, tsa, prefs] = await Promise.all([
        db.signingCertificate.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
        db.tsaConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } }),
        ensureEsignPrefs(tenantId),
      ]);
      const now = Date.now();
      return jsonOk({
        certificates: certs.map((c) => ({
          id: c.id,
          commonName: c.commonName, organization: c.organization, email: c.email,
          serialNumber: c.serialNumber, thumbprint: c.thumbprint, shortThumbprint: shortThumbprint(c.thumbprint),
          issuer: c.issuer, keyAlgorithm: c.keyAlgorithm, signatureAlgorithm: c.signatureAlgorithm,
          notBefore: c.notBefore.toISOString(), notAfter: c.notAfter.toISOString(),
          status: c.notAfter.getTime() < now && c.status === "ACTIVE" ? "EXPIRED" : c.status,
          purpose: c.purpose, validityDays: c.validityDays,
          revokedAt: c.revokedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          createdBy: c.userId === me.id ? "you" : "workspace",
          hasBundle: Boolean(c.pkcs12Base64),
        })),
        tsa: {
          url: tsa.url, hashAlgorithm: tsa.hashAlgorithm, authType: tsa.authType,
          username: tsa.username, enabled: tsa.enabled,
          lastTestAt: tsa.lastTestAt?.toISOString() ?? null,
          lastTestStatus: tsa.lastTestStatus, lastTestLatencyMs: tsa.lastTestLatencyMs,
        },
        prefs: {
          allowMultipleSignatures: prefs.allowMultipleSignatures,
          flattenFormFields: prefs.flattenFormFields,
          filenameFormat: prefs.filenameFormat,
          sealOnCompletion: prefs.sealOnCompletion,
          requireReauth: prefs.requireReauth,
          signatureLevel: prefs.signatureLevel,
          part11Mode: prefs.part11Mode,
          consentText: prefs.consentText,
          consentVersion: prefs.consentVersion,
        },
      });
    }

    case "settings-notifications": {
      const n = await ensureNotificationSettings(tenantId);
      return jsonOk({
        settings: {
          smtpHost: n.smtpHost, smtpPort: n.smtpPort, smtpUser: n.smtpUser,
          smtpPasswordMasked: mask(n.smtpPassword), smtpHasPassword: Boolean(n.smtpPassword),
          smtpFrom: n.smtpFrom, smtpSecure: n.smtpSecure,
          smtpLastTestAt: n.smtpLastTestAt?.toISOString() ?? null,
          smtpLastTestStatus: n.smtpLastTestStatus,
          alertOnSent: n.alertOnSent, alertOnViewed: n.alertOnViewed, alertOnSigned: n.alertOnSigned,
          alertOnCompleted: n.alertOnCompleted, alertOnDeclined: n.alertOnDeclined,
          dailyDigest: n.dailyDigest, digestTime: n.digestTime,
          reminderMode: n.reminderMode, reminderIntervalDays: n.reminderIntervalDays,
          reminderMaxCount: n.reminderMaxCount,
          quietHoursStart: n.quietHoursStart, quietHoursEnd: n.quietHoursEnd,
          skipWeekends: n.skipWeekends,
          escalateToSms: n.escalateToSms, escalateAfterDays: n.escalateAfterDays,
          reminderJobLastRunAt: n.reminderJobLastRunAt?.toISOString() ?? null,
        },
      });
    }

    case "settings-sms": {
      const g = await ensureSmsGateway(tenantId);
      return jsonOk({
        gateway: {
          provider: g.provider,
          apiKeyMasked: mask(g.apiKey), hasApiKey: Boolean(g.apiKey),
          apiSecretMasked: mask(g.apiSecret), hasApiSecret: Boolean(g.apiSecret),
          senderId: g.senderId, lowCostMode: g.lowCostMode,
          whatsappEnabled: g.whatsappEnabled, whatsappProvider: g.whatsappProvider,
          whatsappApiKeyMasked: mask(g.whatsappApiKey), hasWhatsappApiKey: Boolean(g.whatsappApiKey),
          status: g.status,
          lastTestAt: g.lastTestAt?.toISOString() ?? null,
          lastTestStatus: g.lastTestStatus, lastTestTo: g.lastTestTo,
        },
      });
    }

    case "settings-webhooks": {
      // Endpoint registry + recent deliveries. The signing secret is never
      // included — it is shown exactly once at creation time.
      const [endpoints, deliveries] = await Promise.all([
        db.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
        db.webhookDelivery.findMany({
          where: { endpoint: { tenantId } },
          orderBy: { at: "desc" },
          take: 20,
          include: { endpoint: { select: { url: true } } },
        }),
      ]);
      return jsonOk({
        endpoints: endpoints.map((e) => ({
          id: e.id, url: e.url, events: e.events, status: e.status,
          secretMasked: e.secretMasked, successRate: e.successRate,
          lastDeliveryAt: e.lastDeliveryAt?.toISOString() ?? null,
          createdAt: e.createdAt.toISOString(),
        })),
        deliveries: deliveries.map((d) => ({
          id: d.id, event: d.event, statusCode: d.statusCode,
          success: d.success, attempts: d.attempts,
          at: d.at.toISOString(), url: d.endpoint.url,
        })),
        catalogue: WEBHOOK_EVENTS,
      });
    }

    case "settings-mcp": {
      const m = await ensureMcpConfig(tenantId);
      return jsonOk({
        config: {
          enabled: m.enabled, transport: m.transport,
          allowedTools: m.allowedTools.split(",").filter(Boolean),
          rateLimitPerMin: m.rateLimitPerMin,
          updatedAt: m.updatedAt.toISOString(),
        },
        tools: mcpToolsCatalogue(),
        defaultTools: MCP_DEFAULT_TOOLS.split(","),
      });
    }

    default:
      return jsonError(`Unknown section: ${section}`, 404);
  }
}

// ── POST operations ──────────────────────────────────────────────────────────

export async function postSettingsOp(
  me: SessionUser,
  body: { op?: string; id?: string; data?: Record<string, unknown> },
  req: NextRequest,
): Promise<Response> {
  const op = body.op ?? "";
  const id = body.id ?? "";
  const data = body.data ?? {};
  const actor = `${me.firstName} ${me.lastName}`;
  const tenantId = me.tenantId!;
  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user) return jsonError("Account not found", 404);

  // ── Profile & signatures ──
  if (op === "save-profile") {
    const firstName = String(data.firstName ?? "").trim();
    const lastName = String(data.lastName ?? "").trim();
    if (!firstName || !lastName) return jsonError("First and last name are required");
    await db.user.update({ where: { id: me.id }, data: { firstName, lastName } });
    return jsonOk({ ok: true, message: "Profile updated" });
  }

  if (op === "save-signature") {
    const signatureName = String(data.signatureName ?? "").trim();
    if (!signatureName) return jsonError("Signature name is required");
    await db.user.update({
      where: { id: me.id },
      data: { signatureName, signatureStyle: String(data.signatureStyle ?? "signature-font-caveat") },
    });
    return jsonOk({ ok: true, message: "Signature saved - future signatures will use this exact stamp" });
  }

  if (op === "signature.add") {
    const kind = data.kind === "initial" ? "initial" : "signature";
    const method = ["draw", "type", "upload"].includes(String(data.method)) ? String(data.method) : "draw";
    const value = String(data.value ?? "");
    if (!value || value.length > 400_000) return jsonError("Signature data is missing or too large (max ~300 KB)");
    if (method === "type" && value.trim().length > 60) return jsonError("Typed signature must be under 60 characters");
    // Only one default per kind - unset others when this one becomes default.
    const isDefault = data.isDefault === true;
    if (isDefault) {
      await db.userSignature.updateMany({ where: { userId: me.id, kind }, data: { isDefault: false } });
    }
    const existing = await db.userSignature.count({ where: { userId: me.id, kind } });
    if (existing >= 6) return jsonError("You can save up to 6 signatures and 6 sets of initials");
    const sig = await db.userSignature.create({
      data: { userId: me.id, kind, method, value, font: data.font ? String(data.font) : null, isDefault: isDefault || existing === 0 },
    });
    return jsonOk({ ok: true, message: `${kind === "initial" ? "Initials" : "Signature"} saved`, id: sig.id });
  }

  if (op === "signature.delete") {
    const sig = await db.userSignature.findFirst({ where: { id, userId: me.id } });
    if (!sig) return jsonError("Saved signature not found", 404);
    await db.userSignature.delete({ where: { id } });
    return jsonOk({ ok: true, message: "Removed" });
  }

  if (op === "signature.default") {
    const sig = await db.userSignature.findFirst({ where: { id, userId: me.id } });
    if (!sig) return jsonError("Saved signature not found", 404);
    await db.userSignature.updateMany({ where: { userId: me.id, kind: sig.kind }, data: { isDefault: false } });
    await db.userSignature.update({ where: { id }, data: { isDefault: true } });
    return jsonOk({ ok: true, message: "Default signature updated" });
  }

  // ── Organizations & multiple companies ──
  if (op === "save-org") {
    const name = String(data.name ?? "").trim();
    const billingEmail = String(data.billingEmail ?? "").trim();
    if (!name) return jsonError("Organisation name is required");
    await db.tenant.update({ where: { id: tenantId }, data: { name, billingEmail: billingEmail || null } });
    return jsonOk({ ok: true, message: "Organisation updated" });
  }

  if (op === "org.switch") {
    const targetId = String(data.tenantId ?? "");
    const membership = await db.member.findFirst({ where: { userId: me.id, tenantId: targetId } });
    if (!membership) return jsonError("You are not a member of that organization", 403);
    await db.user.update({ where: { id: me.id }, data: { activeTenantId: targetId } });
    const tenant = await db.tenant.findUnique({ where: { id: targetId } });
    await recordAudit({
      actor, actorRole: me.role, action: "workspace.switched", resource: `tenant:${tenant?.slug ?? targetId}`,
      tenantName: tenant?.name, detail: `Active organization switched to ${tenant?.name ?? targetId}`,
    });
    return jsonOk({ ok: true, message: `Switched to ${tenant?.name ?? "workspace"}` });
  }

  if (op === "org.create") {
    const name = String(data.name ?? "").trim();
    if (name.length < 2) return jsonError("Organization name is required");
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "org";
    const slug = `${slugBase}-${randomBytes(2).toString("hex")}`;
    const tenant = await db.tenant.create({
      data: { name, slug, planCode: "STARTER", status: "TRIAL", trialEndsAt: new Date(Date.now() + 14 * 86400_000) },
    });
    await db.member.create({ data: { userId: me.id, tenantId: tenant.id, role: "OWNER", status: "ACTIVE" } });
    await db.user.update({ where: { id: me.id }, data: { activeTenantId: tenant.id } });
    await recordAudit({
      actor, actorRole: me.role, action: "organization.created", resource: `tenant:${slug}`,
      tenantName: name, detail: "New organization created from Settings → Account",
    });
    return jsonOk({ ok: true, message: `Organization “${name}” created - you are the owner. 14-day trial started.` });
  }

  // ── Access security ──
  if (op === "password.change") {
    const current = String(data.current ?? "");
    const next = String(data.next ?? "");
    if (user.passwordHash !== hashPassword(current)) {
      await db.securityEvent.create({
        data: { type: "PASSWORD_CHANGE_FAILED", severity: "MEDIUM", actor: me.email, ip: "10.42.0.7", blocked: true, detail: "Current password did not match" },
      });
      return jsonError("Current password is incorrect", 401);
    }
    if (next.length < 8) return jsonError("New password must be at least 8 characters");
    if (next === current) return jsonError("New password must be different from the current one");
    await db.user.update({
      where: { id: me.id },
      data: { passwordHash: hashPassword(next), passwordChangedAt: new Date() },
    });
    // Revoke every other session - standard post-credential-change hygiene.
    const others = await db.session.findMany({ where: { userId: me.id, revokedAt: null, NOT: { id: me.sessionId ?? "" } } });
    await db.session.updateMany({
      where: { id: { in: others.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
    await db.securityEvent.create({
      data: { type: "PASSWORD_CHANGED", severity: "INFO", actor: me.email, ip: "10.42.0.7", blocked: false, detail: `${others.length} other session(s) revoked` },
    });
    await recordAudit({ actor, actorRole: me.role, action: "password.changed", resource: `user:${me.email}`, severity: "WARNING", tenantName: me.tenantName });
    return jsonOk({ ok: true, message: `Password changed - ${others.length} other session${others.length === 1 ? "" : "s"} signed out` });
  }

  if (op === "session.revoke") {
    const session = await db.session.findFirst({ where: { id, userId: me.id } });
    if (!session) return jsonError("Session not found", 404);
    if (session.id === me.sessionId) return jsonError("Use Sign out to end the current session");
    await db.session.update({ where: { id }, data: { revokedAt: new Date() } });
    return jsonOk({ ok: true, message: "Session revoked" });
  }

  if (op === "session.revoke-others") {
    const result = await db.session.updateMany({
      where: { userId: me.id, revokedAt: null, NOT: { id: me.sessionId ?? "" } },
      data: { revokedAt: new Date() },
    });
    return jsonOk({ ok: true, message: `${result.count} other session${result.count === 1 ? "" : "s"} signed out` });
  }

  // ── Two-factor authentication (TOTP) ──
  if (op === "2fa.start") {
    if (user.totpEnabled && user.totpSecret) return jsonError("Two-factor authentication is already enabled");
    const secret = generateTotpSecret();
    await db.user.update({ where: { id: me.id }, data: { totpPendingSecret: secret } });
    const uri = otpauthUri(secret, user.email);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200, color: { dark: "#0a1530", light: "#ffffff" } });
    return jsonOk({ ok: true, secret, uri, qrSvg });
  }

  if (op === "2fa.enable") {
    const pending = user.totpPendingSecret;
    if (!pending) return jsonError("Start the enrolment first (no pending secret)");
    const code = String(data.code ?? "");
    if (!verifyTotp(pending, code)) {
      return jsonError("That code is not valid yet - make sure your authenticator app added the account and check its clock", 401);
    }
    const { codes, hashes } = generateRecoveryCodes();
    await db.user.update({
      where: { id: me.id },
      data: { totpSecret: pending, totpPendingSecret: null, totpEnabled: true, totpRecoveryCodes: JSON.stringify(hashes) },
    });
    await db.securityEvent.create({
      data: { type: "2FA_ENABLED", severity: "INFO", actor: me.email, ip: "10.42.0.7", blocked: false, detail: "TOTP enrolled from Settings → Profile" },
    });
    await recordAudit({ actor, actorRole: me.role, action: "2fa.enabled", resource: `user:${me.email}`, severity: "WARNING", tenantName: me.tenantName });
    // Shown exactly once - only the hashes are stored.
    return jsonOk({ ok: true, message: "Two-factor authentication enabled", recoveryCodes: codes });
  }

  if (op === "2fa.disable") {
    if (!user.totpEnabled) return jsonError("Two-factor authentication is not enabled");
    if (user.passwordHash !== hashPassword(String(data.password ?? ""))) {
      return jsonError("Password is incorrect", 401);
    }
    if (!verifyTotp(user.totpSecret ?? "", String(data.code ?? ""))) {
      return jsonError("Invalid verification code", 401);
    }
    await db.user.update({
      where: { id: me.id },
      data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: null, totpPendingSecret: null },
    });
    await recordAudit({ actor, actorRole: me.role, action: "2fa.disabled", resource: `user:${me.email}`, severity: "WARNING", tenantName: me.tenantName });
    return jsonOk({ ok: true, message: "Two-factor authentication disabled" });
  }

  if (op === "enforce-2fa") {
    if (!adminRoles(me)) return jsonError("Only workspace owners and admins can change the 2FA policy", 403);
    const enabled = data.enabled === true;
    await db.tenant.update({ where: { id: tenantId }, data: { enforceTwoFactor: enabled } });
    await recordAudit({
      actor, actorRole: me.role, action: "policy.two_factor", resource: `tenant:${me.tenantSlug}`,
      severity: "WARNING", tenantName: me.tenantName,
      detail: `2FA enforcement ${enabled ? "required for all members" : "optional"}`,
    });
    return jsonOk({ ok: true, message: enabled ? "Members must now enrol two-factor authentication at next sign-in" : "Two-factor authentication is optional again" });
  }

  // ── Enterprise DNS domain verification & authentication ──
  if (op === "domain.add") {
    const domain = String(data.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!HOSTNAME_RE.test(domain)) return jsonError("Enter a valid domain, e.g. mail.yourcompany.com");
    const existing = await db.domain.findFirst({ where: { tenantId, domain, purpose: "SENDING" } });
    if (existing) return jsonError("This domain has already been added");
    const token = randomBytes(16).toString("hex");
    const row = await db.domain.create({
      data: { tenantId, domain, purpose: "SENDING", token, status: "PENDING", method: "TXT" },
    });
    return jsonOk({ ok: true, message: `Domain ${domain} added - publish the TXT record below, then verify`, id: row.id, token });
  }

  // Email deliverability posture (SPF / DMARC / best-effort DKIM) for a
  // sending domain — read-only DNS queries, distinct from ownership
  // verification (domain.verify proves control; posture shows whether mail
  // from the domain will authenticate).
  if (op === "domain.posture") {
    const d = await db.domain.findFirst({ where: { id, tenantId, purpose: "SENDING" } });
    if (!d) return jsonError("Domain not found", 404);
    const posture = await checkEmailPosture(d.domain);
    const summary =
      `SPF ${posture.spf.found ? `present (${posture.spf.policy})` : "absent"} · ` +
      `DMARC ${posture.dmarc.found ? `present (p=${posture.dmarc.policy ?? "none"})` : "absent"}`;
    return jsonOk({ ok: true, message: `Email posture for ${d.domain}: ${summary}`, posture });
  }

  if (op === "domain.verify") {
    const d = await db.domain.findFirst({ where: { id, tenantId, purpose: "SENDING" } });
    if (!d) return jsonError("Domain not found", 404);
    const result = await verifySendingDomain(d.domain, d.token);
    await db.domain.update({
      where: { id },
      data: {
        status: result.verified ? "VERIFIED" : d.status === "VERIFIED" ? "VERIFIED" : "PENDING",
        lastCheckedAt: new Date(),
        lastCheckNote: result.note,
        verifiedAt: result.verified ? new Date() : d.verifiedAt,
      },
    });
    if (result.verified) {
      await recordAudit({
        actor, actorRole: me.role, action: "domain.verified", resource: `domain:${d.domain}`,
        severity: "WARNING", tenantName: me.tenantName, detail: "Sending domain authenticated via DNS TXT",
      });
    }
    return jsonOk({ ok: result.verified, message: result.note, records: result.records });
  }

  if (op === "domain.delete") {
    const d = await db.domain.findFirst({ where: { id, tenantId, purpose: "SENDING" } });
    if (!d) return jsonError("Domain not found", 404);
    await db.domain.delete({ where: { id } });
    return jsonOk({ ok: true, message: `Domain ${d.domain} removed` });
  }

  // ── Users & roles ──
  if (op === "member.role") {
    if (!adminRoles(me)) return jsonError("Only workspace owners and admins can change roles", 403);
    const role = String(data.role ?? "");
    if (!["ADMIN", "MEMBER"].includes(role)) return jsonError("Role must be ADMIN or MEMBER");
    const m = await db.member.findFirst({ where: { id, tenantId } });
    if (!m) return jsonError("Member not found", 404);
    if (m.role === "OWNER") return jsonError("The workspace owner's role cannot be changed");
    await db.member.update({ where: { id }, data: { role } });
    await recordAudit({
      actor, actorRole: me.role, action: "member.role_changed", resource: `member:${id}`,
      tenantName: me.tenantName, detail: `Role set to ${role}`,
    });
    return jsonOk({ ok: true, message: `Role updated to ${role === "ADMIN" ? "workspace admin" : "member"}` });
  }

  if (op === "invite-member") {
    const email = String(data.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return jsonError("A valid email is required");
    const exists = await db.user.findUnique({ where: { email } });
    if (exists) {
      const already = await db.member.findFirst({ where: { userId: exists.id, tenantId } });
      if (already) return jsonError("This person is already a member of the workspace");
    }
    // Seat capacity: pending invitations hold a seat until accepted/revoked.
    const cap = await seatCapacity(tenantId);
    if (cap.remaining <= 0) {
      return jsonError(
        `All ${cap.seatLimit} seats on the ${planDef(cap.planCode).name} plan are in use ` +
          `(${cap.members} member${cap.members === 1 ? "" : "s"} + ${cap.pendingInvites} pending invitation${cap.pendingInvites === 1 ? "" : "s"}). ` +
          "Revoke an unused invitation or upgrade the plan to invite more.",
        403,
      );
    }
    // Real invitations: a tokenized link is emailed (queued in the outbox);
    // the invited person creates their own password at /invite/<token> - the
    // workspace never fabricates accounts or credentials on their behalf.
    const role = ["ADMIN", "MEMBER"].includes(String(data.role)) ? String(data.role) : "MEMBER";
    await createInvitation({
      tenantId, email, role,
      invitedBy: `${user.firstName} ${user.lastName}`, invitedById: me.id,
      origin: requestOrigin(req),
    });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "invite.sent", resource: `invite:${email}`, tenantName: me.tenantName,
      detail: `Invitation queued for ${email} (${role})`,
    });
    return jsonOk({ ok: true, message: `Invitation sent to ${email} - they create their own password from the link` });
  }

  if (op === "invite-revoke") {
    const inv = await db.invitation.findFirst({ where: { id, tenantId, status: "PENDING" } });
    if (!inv) return jsonError("Invitation not found", 404);
    await db.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
    await recordAudit({
      actor: `${me.firstName} ${me.lastName}`, actorRole: me.role,
      action: "invite.revoked", resource: `invite:${inv.email}`, tenantName: me.tenantName,
    });
    return jsonOk({ ok: true, message: `Invitation for ${inv.email} revoked` });
  }

  if (op === "remove-member") {
    const m = await db.member.findFirst({ where: { id, tenantId } });
    if (!m) return jsonError("Member not found", 404);
    if (m.role === "OWNER") return jsonError("The workspace owner cannot be removed");
    await db.member.delete({ where: { id } });
    return jsonOk({ ok: true, message: "Member removed from workspace" });
  }

  // ── Small team groups (cycle 10) ──
  // Organisational grouping of members inside a company workspace ("Sales",
  // "HR", "Legal"). Purely additive: workspace visibility is unchanged.
  if (op === "team.create") {
    if (!adminRoles(me)) return jsonError("Only workspace owners and admins can create teams", 403);
    const name = String(data.name ?? "").trim();
    if (!name) return jsonError("Team name is required");
    if (name.length > 40) return jsonError("Team name must be 40 characters or fewer");
    const dupe = await db.team.findFirst({ where: { tenantId, name } });
    if (dupe) return jsonError(`A team called "${name}" already exists`);
    const team = await db.team.create({ data: { tenantId, name } });
    await recordAudit({
      actor, actorRole: me.role, action: "team.created", resource: `team:${name}`,
      tenantName: me.tenantName, detail: "Small team group created",
    });
    return jsonOk({ ok: true, id: team.id, message: `Team "${name}" created` });
  }

  if (op === "team.rename") {
    if (!adminRoles(me)) return jsonError("Only workspace owners and admins can rename teams", 403);
    const name = String(data.name ?? "").trim();
    if (!name) return jsonError("Team name is required");
    if (name.length > 40) return jsonError("Team name must be 40 characters or fewer");
    const team = await db.team.findFirst({ where: { id, tenantId } });
    if (!team) return jsonError("Team not found", 404);
    const dupe = await db.team.findFirst({ where: { tenantId, name, NOT: { id } } });
    if (dupe) return jsonError(`A team called "${name}" already exists`);
    await db.team.update({ where: { id }, data: { name } });
    await recordAudit({
      actor, actorRole: me.role, action: "team.renamed", resource: `team:${name}`,
      tenantName: me.tenantName, detail: `Team renamed from "${team.name}"`,
    });
    return jsonOk({ ok: true, message: `Team renamed to "${name}"` });
  }

  if (op === "team.delete") {
    if (!adminRoles(me)) return jsonError("Only workspace owners and admins can delete teams", 403);
    const team = await db.team.findFirst({ where: { id, tenantId } });
    if (!team) return jsonError("Team not found", 404);
    // Members fall back to no team (onDelete: SetNull in the schema).
    await db.team.delete({ where: { id } });
    await recordAudit({
      actor, actorRole: me.role, action: "team.deleted", resource: `team:${team.name}`,
      tenantName: me.tenantName, detail: "Small team group deleted; members unassigned",
    });
    return jsonOk({ ok: true, message: `Team "${team.name}" deleted` });
  }

  if (op === "member.team") {
    if (!adminRoles(me)) return jsonError("Only workspace owners and admins can assign team membership", 403);
    const m = await db.member.findFirst({ where: { id, tenantId } });
    if (!m) return jsonError("Member not found", 404);
    let teamId: string | null = null;
    if (data.teamId !== null && data.teamId !== undefined && data.teamId !== "") {
      const team = await db.team.findFirst({ where: { id: String(data.teamId), tenantId } });
      if (!team) return jsonError("Team not found in this workspace", 404);
      teamId = team.id;
    }
    await db.member.update({ where: { id }, data: { teamId } });
    const teamName = teamId ? (await db.team.findUnique({ where: { id: teamId } }))?.name : null;
    await recordAudit({
      actor, actorRole: me.role, action: "member.team_assigned", resource: `member:${id}`,
      tenantName: me.tenantName, detail: teamName ? `Assigned to team "${teamName}"` : "Removed from team",
    });
    return jsonOk({ ok: true, message: teamName ? `Moved to team "${teamName}"` : "Removed from team" });
  }

  // ── Signing certificates (X.509 / PKCS#12) ──
  if (op === "cert.create") {
    const commonName = String(data.commonName ?? "").trim();
    const organization = String(data.organization ?? "").trim() || null;
    const email = String(data.email ?? "").trim() || null;
    const purpose = data.purpose === "sealing" ? "sealing" : "signing";
    const days = Math.min(1095, Math.max(30, Number(data.days ?? 365)));
    if (commonName.length < 3) return jsonError("Certificate name (CN) is required - e.g. “StålFe Signing 2026”");
    if (email && !/.+@.+\..+/.test(email)) return jsonError("Enter a valid email or leave it empty");
    const pendingCount = await db.signingCertificate.count({ where: { tenantId, status: "PENDING" } });
    if (pendingCount >= 5) return jsonError("Too many pending certificates - provision or delete the existing ones first");
    const cert = await db.signingCertificate.create({
      data: {
        tenantId, userId: me.id, commonName, organization, email, purpose, validityDays: days,
        status: "PENDING",
        // Placeholder identity - replaced with real values when provisioned via OpenSSL.
        serialNumber: "PENDING", thumbprint: "PENDING", issuer: "Pending issuance",
        notBefore: new Date(), notAfter: new Date(Date.now() + days * 86400_000),
      },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "certificate.requested", resource: `certificate:${cert.id}`,
      tenantName: me.tenantName, detail: `CN=${commonName}, ${days} days, purpose=${purpose}`,
    });
    return jsonOk({ ok: true, message: `Certificate “${commonName}” requested - provision it in one click when ready`, id: cert.id });
  }

  if (op === "cert.provision") {
    const cert = await db.signingCertificate.findFirst({ where: { id, tenantId } });
    if (!cert) return jsonError("Certificate not found", 404);
    if (cert.status !== "PENDING") return jsonError("Only pending certificates can be provisioned");
    const passphrase = String(data.passphrase ?? "");
    try {
      const issued = await issueSigningCertificate({
        commonName: cert.commonName,
        organization: cert.organization ?? undefined,
        email: cert.email ?? undefined,
        days: cert.validityDays,
        purpose: cert.purpose,
        passphrase,
      });
      await db.signingCertificate.update({
        where: { id },
        data: {
          status: "ISSUED",
          pkcs12Base64: issued.pkcs12Base64,
          certificatePem: issued.certificatePem,
          serialNumber: issued.serialNumber,
          thumbprint: issued.thumbprint,
          issuer: issued.issuer,
          notBefore: issued.notBefore,
          notAfter: issued.notAfter,
        },
      });
      await recordAudit({
        actor, actorRole: me.role, action: "certificate.issued", resource: `certificate:${cert.id}`,
        severity: "WARNING", tenantName: me.tenantName,
        detail: `Serial ${issued.serialNumber.slice(0, 16)}…, RSA-2048/SHA-256, expires ${issued.notAfter.toISOString().slice(0, 10)}`,
      });
      return jsonOk({
        ok: true,
        message: `Certificate issued - serial ${issued.serialNumber.slice(0, 16)}… Download the .p12 bundle now`,
      });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Certificate issuance failed", 500);
    }
  }

  if (op === "cert.activate") {
    const cert = await db.signingCertificate.findFirst({ where: { id, tenantId } });
    if (!cert) return jsonError("Certificate not found", 404);
    if (cert.status !== "ISSUED") return jsonError("Only issued certificates can be activated");
    if (cert.notAfter.getTime() < Date.now()) return jsonError("This certificate has expired");
    if (cert.userId !== me.id && !adminRoles(me)) return jsonError("Only the certificate owner or a workspace admin can activate it", 403);
    // One active certificate per purpose - deactivate the others.
    await db.signingCertificate.updateMany({
      where: { tenantId, purpose: cert.purpose, status: "ACTIVE" },
      data: { status: "ISSUED" },
    });
    await db.signingCertificate.update({ where: { id }, data: { status: "ACTIVE" } });
    await recordAudit({
      actor, actorRole: me.role, action: "certificate.activated", resource: `certificate:${cert.id}`,
      severity: "WARNING", tenantName: me.tenantName, detail: `${cert.purpose} certificate is now live`,
    });
    return jsonOk({ ok: true, message: `“${cert.commonName}” is now the active ${cert.purpose} certificate` });
  }

  if (op === "cert.revoke") {
    const cert = await db.signingCertificate.findFirst({ where: { id, tenantId } });
    if (!cert) return jsonError("Certificate not found", 404);
    if (!["ISSUED", "ACTIVE"].includes(cert.status)) return jsonError("Only issued or active certificates can be revoked");
    await db.signingCertificate.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date(), pkcs12Base64: null } });
    await recordAudit({
      actor, actorRole: me.role, action: "certificate.revoked", resource: `certificate:${cert.id}`,
      severity: "CRITICAL", tenantName: me.tenantName, detail: `Serial ${cert.serialNumber.slice(0, 16)}… revoked`,
    });
    return jsonOk({ ok: true, message: `Certificate revoked - new signatures will no longer use it` });
  }

  if (op === "cert.delete") {
    const cert = await db.signingCertificate.findFirst({ where: { id, tenantId } });
    if (!cert) return jsonError("Certificate not found", 404);
    if (cert.status === "ACTIVE") return jsonError("Revoke the certificate before deleting it");
    await db.signingCertificate.delete({ where: { id } });
    return jsonOk({ ok: true, message: "Certificate deleted" });
  }

  // ── RFC 3161 Timestamp Authority ──
  if (op === "tsa.save") {
    const url = String(data.url ?? "").trim();
    if (!/^https?:\/\//.test(url)) return jsonError("TSA URL must start with http:// or https://");
    const hashAlgorithm = ["SHA-256", "SHA-384", "SHA-512"].includes(String(data.hashAlgorithm)) ? String(data.hashAlgorithm) : "SHA-256";
    const authType = data.authType === "basic" ? "basic" : "none";
    const username = authType === "basic" ? String(data.username ?? "").trim() || null : null;
    const enabled = data.enabled === true;
    if (enabled && authType === "basic" && !username) return jsonError("Username is required for basic authentication");
    await db.tsaConfig.upsert({
      where: { tenantId },
      update: { url, hashAlgorithm, authType, username, enabled, updatedAt: new Date() },
      create: { tenantId, url, hashAlgorithm, authType, username, enabled },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "tsa.configured", resource: `tenant:${me.tenantSlug}`,
      tenantName: me.tenantName, detail: `TSA ${url} (${hashAlgorithm}) ${enabled ? "enabled" : "saved disabled"}`,
    });
    return jsonOk({ ok: true, message: `TSA configuration saved - ${url}` });
  }

  if (op === "tsa.test") {
    const tsa = await db.tsaConfig.findUnique({ where: { tenantId } });
    if (!tsa) return jsonError("Save a TSA configuration first");
    const started = Date.now();
    let status: string;
    let note: string;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(tsa.url, { method: "GET", signal: ctrl.signal, redirect: "manual" });
        const latency = Date.now() - started;
        status = "OK";
        note = `Reachable - HTTP ${res.status} in ${latency} ms over ${tsa.url.startsWith("https") ? "TLS" : "plain HTTP"}. RFC 3161 token issuance runs in the sealing pipeline.`;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status = /abort/i.test(msg) ? "TIMEOUT" : /certificate|tls|ssl/i.test(msg) ? "TLS_ERROR" : "UNREACHABLE";
      note = status === "TIMEOUT" ? "No response within 6 seconds" : `Could not reach the TSA: ${msg}`;
    }
    await db.tsaConfig.update({
      where: { tenantId },
      data: { lastTestAt: new Date(), lastTestStatus: status, lastTestLatencyMs: Date.now() - started },
    });
    return jsonOk({ ok: status === "OK", message: note, status, latencyMs: Date.now() - started });
  }

  // ── eSign preferences ──
  if (op === "part11.save") {
    // 21 CFR Part 11 compliance mode - lives on the Account tab but shares
    // the EsignPreferences row with the eSign tab.
    const prefs = await ensureEsignPrefs(tenantId);
    const part11Mode = data.part11Mode === true;
    const requireReauth = data.requireReauth === true;
    const consentText = String(data.consentText ?? "").trim();
    if (part11Mode && consentText.length < 40) {
      return jsonError("Part 11 mode requires a signature agreement text of at least 40 characters");
    }
    await db.esignPreferences.update({
      where: { tenantId },
      data: { part11Mode, requireReauth, consentText: consentText || null, updatedAt: new Date() },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "part11_mode.updated", resource: `tenant:${me.tenantSlug}`,
      severity: "WARNING", tenantName: me.tenantName,
      detail: `21 CFR Part 11 mode ${part11Mode ? "enabled" : "disabled"}${part11Mode ? ` · re-auth ${requireReauth ? "required" : "optional"}` : ""}`,
    });
    return jsonOk({ ok: true, message: `Part 11 compliance mode ${part11Mode ? "enabled" : "disabled"} - ${prefs.consentVersion} agreement saved` });
  }

  if (op === "esign.save") {
    const format = String(data.filenameFormat ?? "");
    const check = validateFilenameFormat(format);
    if (!check.ok) return jsonError(check.error ?? "Invalid filename format");
    const signatureLevel = ["simple", "advanced", "qualified"].includes(String(data.signatureLevel)) ? String(data.signatureLevel) : "advanced";
    const part11Mode = data.part11Mode === true;
    const consentText = String(data.consentText ?? "").trim();
    if (part11Mode && consentText.length < 40) {
      return jsonError("Part 11 mode requires a signature agreement text of at least 40 characters");
    }
    await db.esignPreferences.upsert({
      where: { tenantId },
      update: {
        allowMultipleSignatures: data.allowMultipleSignatures !== false,
        flattenFormFields: data.flattenFormFields !== false,
        filenameFormat: format,
        sealOnCompletion: data.sealOnCompletion !== false,
        requireReauth: data.requireReauth === true,
        signatureLevel,
        part11Mode,
        consentText: consentText || null,
        updatedAt: new Date(),
      },
      create: { tenantId, filenameFormat: format, signatureLevel, part11Mode, consentText: consentText || null },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "esign_settings.updated", resource: `tenant:${me.tenantSlug}`,
      tenantName: me.tenantName,
      detail: `filename=${format} · level=${signatureLevel} · Part 11 ${part11Mode ? "on" : "off"}`,
    });
    return jsonOk({ ok: true, message: "Digital signature preferences saved" });
  }

  // ── Notifications: SMTP, alerts, reminder jobs ──
  if (op === "notifications.save") {
    const n = await ensureNotificationSettings(tenantId);
    const smtpHost = String(data.smtpHost ?? "").trim() || null;
    const smtpPort = Math.min(65535, Math.max(1, Number(data.smtpPort ?? 587)));
    const smtpFrom = String(data.smtpFrom ?? "").trim();
    const smtpPassword = String(data.smtpPassword ?? "");
    const digestTime = String(data.digestTime ?? "09:00");
    const quietHoursStart = String(data.quietHoursStart ?? "21:00");
    const quietHoursEnd = String(data.quietHoursEnd ?? "08:00");
    const reminderMode = ["manual", "user_job", "platform_job"].includes(String(data.reminderMode)) ? String(data.reminderMode) : "manual";
    const reminderIntervalDays = Math.min(30, Math.max(1, Number(data.reminderIntervalDays ?? 3)));
    const reminderMaxCount = Math.min(20, Math.max(0, Number(data.reminderMaxCount ?? 5)));
    const escalateAfterDays = Math.min(60, Math.max(1, Number(data.escalateAfterDays ?? 7)));
    if (smtpHost && !HOSTNAME_RE.test(smtpHost) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(smtpHost)) {
      return jsonError("SMTP host must be a hostname or IP address");
    }
    if (!TIME_RE.test(digestTime) || !TIME_RE.test(quietHoursStart) || !TIME_RE.test(quietHoursEnd)) {
      return jsonError("Times must use the 24h HH:MM format");
    }
    if (!smtpFrom.includes("@")) return jsonError("From address must be a valid email");
    await db.notificationSettings.update({
      where: { tenantId },
      data: {
        smtpHost, smtpPort,
        smtpUser: String(data.smtpUser ?? "").trim() || null,
        smtpPassword: smtpPassword ? smtpPassword : n.smtpPassword, // empty = keep existing
        smtpFrom, smtpSecure: data.smtpSecure !== false,
        alertOnSent: data.alertOnSent !== false,
        alertOnViewed: data.alertOnViewed === true,
        alertOnSigned: data.alertOnSigned !== false,
        alertOnCompleted: data.alertOnCompleted !== false,
        alertOnDeclined: data.alertOnDeclined === true,
        dailyDigest: data.dailyDigest === true,
        digestTime,
        reminderMode, reminderIntervalDays, reminderMaxCount,
        quietHoursStart, quietHoursEnd,
        skipWeekends: data.skipWeekends !== false,
        escalateToSms: data.escalateToSms === true,
        escalateAfterDays,
        updatedAt: new Date(),
      },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "notification_settings.updated", resource: `tenant:${me.tenantSlug}`,
      tenantName: me.tenantName,
      detail: `SMTP ${smtpHost ? `override (${smtpHost})` : "platform default"} · reminders=${reminderMode} every ${reminderIntervalDays}d (max ${reminderMaxCount})`,
    });
    return jsonOk({ ok: true, message: "Notification settings saved - including the reminder policy" });
  }

  if (op === "smtp.test") {
    const n = await db.notificationSettings.findUnique({ where: { tenantId } });
    const host = n?.smtpHost;
    if (!host) {
      // No per-org override: report the platform default state honestly.
      const platform = await db.platformSetting.findUnique({ where: { id: "singleton" } });
      return jsonOk({
        ok: true,
        message: `No per-organization SMTP override - using the platform relay ${platform?.smtpHost ?? "smtp.eu.mailprovider.io"}:${platform?.smtpPort ?? 587} (${platform?.smtpFrom ?? "Docurama Sign"})`,
      });
    }
    const port = n!.smtpPort;
    const started = Date.now();
    const result = await new Promise<{ ok: boolean; note: string }>((resolve) => {
      const socket = new net.Socket();
      const finish = (ok: boolean, note: string) => { socket.destroy(); resolve({ ok, note }); };
      socket.setTimeout(5000);
      socket.once("connect", () => finish(true, `Connected to ${host}:${port} in ${Date.now() - started} ms - relay reachable`));
      socket.once("timeout", () => finish(false, `Connection to ${host}:${port} timed out after 5 s`));
      socket.once("error", (err) => finish(false, `Could not connect to ${host}:${port} - ${err.message}`));
      socket.connect(port, host);
    });
    await db.notificationSettings.update({
      where: { tenantId },
      data: { smtpLastTestAt: new Date(), smtpLastTestStatus: result.ok ? "OK" : "FAILED" },
    });
    return jsonOk({ ok: result.ok, message: result.note });
  }

  if (op === "reminders.run") {
    const n = await ensureNotificationSettings(tenantId);
    const now = new Date();
    const hour = now.getHours();
    const inQuietHours =
      n.quietHoursStart > n.quietHoursEnd
        ? hour >= Number(n.quietHoursStart.slice(0, 2)) || hour < Number(n.quietHoursEnd.slice(0, 2))
        : hour >= Number(n.quietHoursStart.slice(0, 2)) && hour < Number(n.quietHoursEnd.slice(0, 2));
    const weekend = now.getDay() === 0 || now.getDay() === 6;

    const active = await db.envelope.findMany({
      where: { tenantId, status: { in: ["SENT", "PARTIALLY_SIGNED"] } },
      include: { recipients: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const due: { code: string; title: string; ageDays: number; reminders: number; reason: string }[] = [];
    let skippedQuiet = 0, skippedWeekend = 0, skippedThrottle = 0, skippedMax = 0, manualOnly = 0;
    for (const e of active) {
      const last = e.lastRemindedAt ?? e.createdAt;
      const ageDays = Math.floor((now.getTime() - e.createdAt.getTime()) / 86400_000);
      if (n.reminderMode === "manual" && !e.autoRemind) { manualOnly++; continue; }
      if (e.reminderCount >= n.reminderMaxCount) { skippedMax++; continue; }
      const since = (now.getTime() - last.getTime()) / 86400_000;
      if (since < n.reminderIntervalDays) { skippedThrottle++; continue; }
      if (n.skipWeekends && weekend) { skippedWeekend++; continue; }
      if (inQuietHours) { skippedQuiet++; continue; }
      due.push({
        code: e.publicCode, title: e.title, ageDays, reminders: e.reminderCount,
        reason: e.autoRemind ? "per-envelope auto-remind enabled" : "platform job policy",
      });
    }
    await db.notificationSettings.update({
      where: { tenantId },
      data: { reminderJobLastRunAt: now },
    });
    return jsonOk({
      ok: true,
      dryRun: true,
      message: `Reminder job (dry run): ${due.length} envelope${due.length === 1 ? "" : "s"} due · ${skippedThrottle} throttled · ${skippedMax} at max reminders · ${manualOnly} manual-only`,
      due,
      stats: { active: active.length, due: due.length, skippedQuiet, skippedWeekend, skippedThrottle, skippedMax, manualOnly, inQuietHours, weekend },
    });
  }

  if (op === "envelope.auto-remind") {
    const e = await db.envelope.findFirst({ where: { id, tenantId } });
    if (!e) return jsonError("Envelope not found", 404);
    if (!["SENT", "PARTIALLY_SIGNED"].includes(e.status)) return jsonError("Auto-remind applies to active envelopes only");
    const enabled = data.enabled === true;
    await db.envelope.update({ where: { id }, data: { autoRemind: enabled } });
    return jsonOk({ ok: true, message: enabled ? "Auto-remind enabled for this envelope" : "Auto-remind disabled" });
  }

  // ── SMS gateway ──
  if (op === "sms.save") {
    const provider = String(data.provider ?? "twilio");
    const meta = providerByKey(provider);
    if (!meta) return jsonError("Unknown SMS provider");
    const g = await ensureSmsGateway(tenantId);
    const apiKey = String(data.apiKey ?? "").trim();
    const apiSecret = String(data.apiSecret ?? "");
    const whatsappApiKey = String(data.whatsappApiKey ?? "");
    const whatsappProvider = data.whatsappProvider ? String(data.whatsappProvider) : null;
    const whatsappEnabled = data.whatsappEnabled === true;
    if (whatsappEnabled && !whatsappProvider) return jsonError("Choose a WhatsApp provider or disable the WhatsApp channel");
    const hasCreds = apiKey.length > 0;
    await db.smsGateway.update({
      where: { tenantId },
      data: {
        provider,
        apiKey: apiKey || g.apiKey,
        apiSecret: apiSecret || g.apiSecret,
        senderId: String(data.senderId ?? g.senderId ?? "DOCURAMA").slice(0, 11),
        lowCostMode: data.lowCostMode === true,
        whatsappEnabled, whatsappProvider,
        whatsappApiKey: whatsappApiKey || g.whatsappApiKey,
        status: hasCreds || (g.apiKey && provider === g.provider) ? "configured" : "not_configured",
        updatedAt: new Date(),
      },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "sms_gateway.updated", resource: `tenant:${me.tenantSlug}`,
      tenantName: me.tenantName, detail: `Provider ${meta.name}${whatsappEnabled ? ` + WhatsApp (${whatsappProvider})` : ""}`,
    });
    return jsonOk({ ok: true, message: `${meta.name} gateway saved${whatsappEnabled ? " with the WhatsApp channel" : ""}` });
  }

  if (op === "sms.test") {
    const g = await db.smsGateway.findUnique({ where: { tenantId } });
    if (!g || !(g.apiKey || g.whatsappApiKey)) return jsonError("Save the gateway credentials first (Settings → SMS)");
    const to = String(data.to ?? "").trim();
    if (!/^\+?[1-9]\d{6,14}$/.test(to.replace(/[\s-]/g, ""))) {
      return jsonError("Enter the destination in international format, e.g. +33612345678");
    }
    const meta = providerByKey(g.provider);
    let status = "OK";
    let note = `Configuration accepted for ${meta?.name ?? g.provider} → ${to}. QA sandbox: no live message dispatched; the production job uses these credentials.`;

    // WhatsApp Cloud API tokens can be validated for real against Meta's graph API.
    if (g.whatsappEnabled && g.whatsappProvider === "whatsapp-cloud" && g.whatsappApiKey) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(g.whatsappApiKey)}`,
          { signal: AbortSignal.timeout(6000) },
        );
        if (res.ok) {
          note = `WhatsApp Cloud API token validated live against Meta (HTTP ${res.status}) - the channel is production-ready. SMS config accepted → ${to}.`;
        } else {
          status = "ERROR";
          note = `Meta rejected the WhatsApp token (HTTP ${res.status}) - check Settings → SMS credentials.`;
        }
      } catch {
        note = `Could not reach Meta to validate the WhatsApp token (network) - SMS config accepted → ${to}.`;
      }
    }

    await db.smsGateway.update({
      where: { tenantId },
      data: { lastTestAt: new Date(), lastTestStatus: status, lastTestTo: to, status: status === "OK" ? "tested" : "error" },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "sms_gateway.tested", resource: `tenant:${me.tenantSlug}`,
      tenantName: me.tenantName, detail: `${g.provider} → ${to.replace(/.(?=.{4})/g, "•")}`,
    });
    return jsonOk({ ok: status === "OK", message: note, status });
  }

  // ── API keys ──
  if (op === "create-key") {
    const name = String(data.name ?? "").trim();
    const scope = ["READONLY", "ENVELOPES", "TEMPLATES", "FULL"].includes(String(data.scope)) ? String(data.scope) : "READONLY";
    if (!name) return jsonError("Key name is required");
    const suffix = randomBytes(4).toString("hex");
    const prefix = `dk_live_${suffix.slice(0, 4)}`;
    const fullKey = `${prefix}${suffix}${randomBytes(6).toString("hex")}`;
    await db.apiKey.create({
      data: { tenantId, name, prefix, secretHash: sha(fullKey), scope, createdBy: actor },
    });
    await recordAudit({ actor, actorRole: me.role, action: "api_key.created", resource: `api_key:${prefix}`, severity: "WARNING", tenantName: me.tenantName });
    // The full key is returned exactly once - only its hash is stored.
    return jsonOk({ ok: true, message: `Key created - copy it now, it will not be shown again`, key: fullKey, prefix });
  }

  if (op === "revoke-key") {
    const k = await db.apiKey.findFirst({ where: { id, tenantId } });
    if (!k) return jsonError("Key not found", 404);
    await db.apiKey.update({ where: { id }, data: { status: "REVOKED" } });
    await recordAudit({ actor, actorRole: me.role, action: "api_key.revoked", resource: `api_key:${k.prefix}`, severity: "WARNING", tenantName: me.tenantName });
    return jsonOk({ ok: true, message: `Key ${k.prefix} revoked` });
  }

  // ── Webhooks ──
  if (op === "webhook.create") {
    const url = String(data.url ?? "").trim();
    const events = Array.isArray(data.events) ? (data.events as unknown[]).map(String).filter((e) => WEBHOOK_EVENTS.some((w) => w.event === e) || e === "*") : [];
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return jsonError("Endpoint URL is not a valid URL");
    }
    // https only, except loopback hosts (local testing / internal networks).
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.hostname.endsWith(".local") || parsed.hostname.endsWith(".internal");
    if (parsed.protocol !== "https:" && !loopback) {
      return jsonError("Endpoint URL must use https (http is allowed for localhost only)");
    }
    if (events.length === 0) return jsonError("Subscribe to at least one event");
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const endpoint = await db.webhookEndpoint.create({
      data: {
        tenantId,
        url,
        events: events.join("|"),
        secret,
        secretMasked: `••••••${secret.slice(-4)}`,
      },
    });
    await recordAudit({ actor, actorRole: me.role, action: "webhook.created", resource: `webhook:${endpoint.id}`, severity: "WARNING", tenantName: me.tenantName, detail: url });
    // The signing secret is returned exactly once — stored retrievable (the
    // dispatcher HMACs with it) but never echoed again by any API.
    return jsonOk({ ok: true, message: `Endpoint registered - copy the signing secret now, it will not be shown again`, secret, endpointId: endpoint.id });
  }

  if (op === "webhook.delete") {
    const h = await db.webhookEndpoint.findFirst({ where: { id, tenantId } });
    if (!h) return jsonError("Endpoint not found", 404);
    await db.webhookEndpoint.delete({ where: { id } });
    await recordAudit({ actor, actorRole: me.role, action: "webhook.deleted", resource: `webhook:${id}`, severity: "WARNING", tenantName: me.tenantName, detail: h.url });
    return jsonOk({ ok: true, message: "Endpoint deleted" });
  }

  if (op === "webhook.toggle") {
    const h = await db.webhookEndpoint.findFirst({ where: { id, tenantId } });
    if (!h) return jsonError("Endpoint not found", 404);
    const next = h.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    await db.webhookEndpoint.update({ where: { id }, data: { status: next } });
    await recordAudit({ actor, actorRole: me.role, action: `webhook.${next.toLowerCase()}`, resource: `webhook:${id}`, severity: "INFO", tenantName: me.tenantName });
    return jsonOk({ ok: true, message: `Endpoint ${next === "PAUSED" ? "paused" : "resumed"}` });
  }

  // ── MCP server ──
  if (op === "mcp.save") {
    const enabled = data.enabled === true;
    const transport = data.transport === "sse" ? "sse" : "streamable-http";
    const tools = Array.isArray(data.allowedTools) ? (data.allowedTools as unknown[]).map(String) : [];
    if (enabled && tools.length === 0) return jsonError("Enable at least one tool or keep the MCP server off");
    const rateLimitPerMin = Math.min(600, Math.max(10, Number(data.rateLimitPerMin ?? 60)));
    await db.mcpConfig.upsert({
      where: { tenantId },
      update: { enabled, transport, allowedTools: tools.join(","), rateLimitPerMin, updatedAt: new Date() },
      create: { tenantId, enabled, transport, allowedTools: tools.join(",") || MCP_DEFAULT_TOOLS, rateLimitPerMin },
    });
    await recordAudit({
      actor, actorRole: me.role, action: "mcp_server.updated", resource: `tenant:${me.tenantSlug}`,
      severity: "WARNING", tenantName: me.tenantName,
      detail: `MCP ${enabled ? "enabled" : "disabled"} (${transport}, ${tools.length} tools, ${rateLimitPerMin}/min)`,
    });
    return jsonOk({ ok: true, message: `MCP server ${enabled ? "enabled" : "disabled"} - ${tools.length} tool${tools.length === 1 ? "" : "s"} exposed at /api/mcp` });
  }

  return jsonError(`Unsupported operation: ${op}`);
}
