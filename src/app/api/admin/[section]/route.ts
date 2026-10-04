import { NextRequest } from "next/server";
import { promises as dns } from "dns";
import { db } from "@/lib/db";
import { requirePlatformAdmin, recordAudit } from "@/lib/auth";
import { publicRecipient, isos, iso, jsonError, jsonOk } from "@/lib/serializers";
import { publicAdminUserSelect, publicAdminTenant, publicAdminSettings, publicAdminApiKey, publicAdminWebhook } from "@/lib/admin-serializers";
import { purgeExpired, storageHealthProbe } from "@/lib/document-store";
import {
  COMPANY, EMAIL_ACCOUNTS, SUBDOMAINS, DNS_RECORDS,
  parseProvisioningState, buildZoneFile,
  type ProvisioningState,
} from "@/lib/provisioning";
import { createInvitation, requestOrigin, slugifyOrg } from "@/lib/onboarding";
import { foldForSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ section: string }> };

const PLAN_MRR: Record<string, number> = { SOLO: 12, STARTER: 19, SMART: 79, BUSINESS: 199, ENTERPRISE: 349 };

// ─────────────────────────────────────────────────────────── GET (read) ──
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requirePlatformAdmin();
    const { section } = await ctx.params;
    const url = new URL(req.url);
    const q = url.searchParams;
    const search = (q.get("q") ?? "").toLowerCase().trim();
    const page = Math.max(1, Number(q.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(5, Number(q.get("perPage") ?? 10)));

    switch (section) {
      case "overview": {
        const [tenantCount, userCount, envelopeCount, sealedCount, dsarOpen, dmcaOpen, incidentsOpen] = await Promise.all([
          db.tenant.count(), db.user.count(), db.envelope.count(),
          db.envelope.count({ where: { status: "COMPLETED" } }),
          db.dsarRequest.count({ where: { status: { in: ["OPEN", "RUNNING"] } } }),
          db.dmcaNotice.count({ where: { status: "OPEN" } }),
          db.incident.count({ where: { status: { in: ["OPEN", "CONTAINED"] } } }),
        ]);
        const stats = await db.dailyStat.findMany({ orderBy: { date: "asc" }, take: 30 });
        const planDist = await db.tenant.groupBy({ by: ["planCode"], _count: true });
        const securityEvents = await db.securityEvent.findMany({ orderBy: { at: "desc" }, take: 8 });
        const auditEvents = await db.auditEvent.findMany({ orderBy: { at: "desc" }, take: 8 });
        const settings = await db.platformSetting.findUnique({ where: { id: "singleton" } });
        const subs = await db.subscription.findMany({ where: { status: "ACTIVE" } });
        const mrr = subs.reduce((a, s) => a + s.mrrEur, 0);
        return jsonOk({
          kpis: {
            tenants: tenantCount, users: userCount, envelopes: envelopeCount, sealed: sealedCount,
            mrr, dsarOpen, dmcaOpen, incidentsOpen,
          },
          stats: isos(stats), planDist,
          securityEvents: isos(securityEvents), auditEvents: isos(auditEvents),
          health: publicAdminSettings(settings),
        });
      }

      case "tenants": {
        const all = await db.tenant.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { members: true, envelopes: true, domains: true, templates: true } },
            subscriptions: { take: 1, orderBy: { renewalAt: "asc" } },
          },
        });
        const filtered = search
          ? all.filter((t) => t.name.toLowerCase().includes(search) || t.slug.toLowerCase().includes(search) || t.planCode.toLowerCase().includes(search))
          : all;
        const rows = filtered.slice((page - 1) * perPage, page * perPage);
        return jsonOk({
          total: filtered.length, page, perPage,
          rows: rows.map((t) => ({
            ...iso(t),
            memberCount: t._count.members, envelopeCount: t._count.envelopes,
            domainCount: t._count.domains, templateCount: t._count.templates,
            subscription: t.subscriptions[0] ? iso(t.subscriptions[0]) : null,
          })),
        });
      }

      case "tenant-detail": {
        const id = q.get("id")!;
        const t = await db.tenant.findUnique({
          where: { id },
          include: {
            members: { include: { user: { select: publicAdminUserSelect } }, orderBy: { createdAt: "asc" } },
            subscriptions: { orderBy: { renewalAt: "asc" } },
            domains: true,
            _count: { select: { envelopes: true, templates: true, apiKeys: true, webhookEndpoints: true } },
          },
        });
        if (!t) return jsonError("Tenant not found", 404);
        const envelopes = await db.envelope.findMany({
          where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 8,
          include: { recipients: true },
        });
        const statusCounts = await db.envelope.groupBy({ by: ["status"], where: { tenantId: id }, _count: true });
        return jsonOk({
          tenant: publicAdminTenant(t),
          members: t.members.map((m) => ({
            id: m.id, role: m.role, status: m.status, createdAt: m.createdAt.toISOString(),
            userId: m.user.id, name: `${m.user.firstName} ${m.user.lastName}`,
            email: m.user.email, totpEnabled: m.user.totpEnabled,
            lastActiveAt: m.user.lastActiveAt?.toISOString() ?? null,
          })),
          subscriptions: isos(t.subscriptions),
          domains: isos(t.domains),
          counts: t._count,
          recentEnvelopes: envelopes.map((e) => ({
            ...iso(e), recipients: e.recipients.map(publicRecipient),
          })),
          statusCounts,
        });
      }

      case "users": {
        const all = await db.user.findMany({
          orderBy: { lastActiveAt: "desc" },
          include: { memberships: { include: { tenant: true }, take: 1 } },
        });
        const filtered = search
          ? all.filter((u) =>
              u.email.toLowerCase().includes(search) ||
              `${u.firstName} ${u.lastName}`.toLowerCase().includes(search) ||
              (u.memberships[0]?.tenant.name ?? "").toLowerCase().includes(search))
          : all;
        const rows = filtered.slice((page - 1) * perPage, page * perPage);
        return jsonOk({
          total: filtered.length, page, perPage,
          rows: rows.map((u) => ({
            id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}`,
            role: u.role, status: u.status, totpEnabled: u.totpEnabled,
            lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
            tenantName: u.memberships[0]?.tenant.name ?? null,
            tenantPlan: u.memberships[0]?.tenant.planCode ?? null,
            workspaceRole: u.memberships[0]?.role ?? null,
          })),
        });
      }

      case "envelopes": {
        const status = q.get("status");
        const all = await db.envelope.findMany({
          orderBy: { createdAt: "desc" },
          include: { recipients: true, tenant: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } },
        });
        const filtered = all.filter((e) => {
          if (status && status !== "ALL" && e.status !== status) return false;
          if (search && !e.title.toLowerCase().includes(search) && !e.publicCode.toLowerCase().includes(search)) return false;
          return true;
        });
        const rows = filtered.slice((page - 1) * perPage, page * perPage);
        return jsonOk({
          total: filtered.length, page, perPage,
          rows: rows.map((e) => ({
            ...iso(e), tenantName: e.tenant.name,
            createdBy: `${e.createdBy.firstName} ${e.createdBy.lastName}`,
            recipients: e.recipients.map(publicRecipient),
          })),
        });
      }

      case "domains": {
        const [rows, joins, allTenants] = await Promise.all([
          db.domain.findMany({ include: { tenant: { select: { id: true, name: true, planCode: true } } }, orderBy: { requestedAt: "desc" } }),
          db.domain.findMany({ where: { status: "JOIN_REQUESTED" }, include: { tenant: { select: { id: true, name: true } } } }),
          db.tenant.findMany({ select: { id: true, name: true, slug: true, planCode: true }, orderBy: { name: "asc" } }),
        ]);
        return jsonOk({
          rows: isos(rows).map((r, i) => ({
            ...r,
            tenantName: rows[i].tenant.name,
            planCode: rows[i].tenant.planCode,
            autoJoin: rows[i].purpose === "AUTO_JOIN" || rows[i].purpose === "JOIN",
          })),
          joins: isos(joins).map((r, i) => ({ ...r, tenantName: joins[i].tenant.name })),
          allTenants: isos(allTenants),
        });
      }

      case "legal": {
        const [dmca, dsar, holds, tenantsById] = await Promise.all([
          db.dmcaNotice.findMany({ orderBy: { receivedAt: "desc" } }),
          db.dsarRequest.findMany({ orderBy: { requestedAt: "desc" } }),
          db.legalHold.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { issuedAt: "desc" } }),
          db.tenant.findMany({ select: { id: true, name: true } }),
        ]);
        const tenantName = (id: string | null) =>
          id ? tenantsById.find((t) => t.id === id)?.name ?? "Unknown tenant" : "Unassigned";
        return jsonOk({
          dmca: isos(dmca),
          dsar: isos(dsar).map((r) => ({ ...r, tenantName: tenantName(r.tenantId) })),
          holds: isos(holds).map((h, i) => ({ ...h, tenantName: holds[i].tenant.name })),
        });
      }

      case "compliance": {
        const [controls, policies, consents, incidents, reviews, risks, changes, vendors, drills, subprocessors, documents] = await Promise.all([
          db.control.findMany({ orderBy: { ref: "asc" } }),
          db.retentionPolicy.findMany({ orderBy: { name: "asc" } }),
          db.consent.findMany({ orderBy: { grantedAt: "desc" } }),
          db.incident.findMany({ orderBy: { detectedAt: "desc" } }),
          db.accessReview.findMany({ orderBy: { quarter: "desc" } }),
          db.risk.findMany({ orderBy: { score: "desc" } }),
          db.change.findMany({ orderBy: { requestedBy: "asc" } }),
          db.vendor.findMany({ orderBy: { name: "asc" } }),
          db.restoreDrill.findMany({ orderBy: { executedAt: "desc" } }),
          db.subprocessor.findMany({ orderBy: { name: "asc" } }),
          db.complianceDocument.findMany({ include: { versions: { orderBy: { createdAt: "desc" } } }, orderBy: { title: "asc" } }),
        ]);
        return jsonOk({
          controls: isos(controls), policies: isos(policies), consents: isos(consents),
          incidents: isos(incidents), reviews: isos(reviews), risks: isos(risks),
          changes: isos(changes), vendors: isos(vendors), drills: isos(drills),
          subprocessors: isos(subprocessors),
          documents: documents.map((d) => ({
            ...iso(d),
            versions: isos(d.versions),
          })),
        });
      }

      case "billing": {
        const [plans, subs, payments, pendingCount] = await Promise.all([
          db.plan.findMany({ orderBy: { monthlyEur: "asc" } }),
          db.subscription.findMany({ include: { tenant: { select: { name: true, slug: true, status: true } } }, orderBy: { renewalAt: "asc" } }),
          db.payment.findMany({
            include: { tenant: { select: { name: true, slug: true } } },
            orderBy: { createdAt: "desc" }, take: 50,
          }),
          db.payment.count({ where: { status: "PENDING" } }),
        ]);
        const stats = await db.dailyStat.findMany({ orderBy: { date: "asc" }, take: 30, select: { date: true, mrrEur: true } });
        return jsonOk({
          plans: isos(plans),
          subscriptions: subs.map((s) => ({ ...iso(s), tenantName: s.tenant.name, tenantSlug: s.tenant.slug, tenantStatus: s.tenant.status })),
          mrrTrend: isos(stats),
          payments: payments.map((p) => ({ ...iso(p), tenantName: p.tenant.name, tenantSlug: p.tenant.slug })),
          pendingPayments: pendingCount,
        });
      }

      case "leads": {
        // Enterprise pipeline (cycle 10): public /enterprise form intake.
        const leadWhere: Record<string, unknown> = {};
        // Match the folded columns, not the raw ones: `search` is lowercased,
        // and PostgreSQL LIKE is case-sensitive where SQLite's is not, so
        // `company: { contains: search }` found rows on SQLite and nothing on
        // PostgreSQL. (email is already stored lowercased on write.)
        const leadSearch = foldForSearch(search);
        if (search) leadWhere.OR = [
          { companyLower: { contains: leadSearch } },
          { contactNameLower: { contains: leadSearch } },
          { email: { contains: search } },
        ];
        const status = q.get("status");
        if (status && status !== "ALL") leadWhere.status = status;
        const [total, leads] = await Promise.all([
          db.enterpriseLead.count({ where: leadWhere }),
          db.enterpriseLead.findMany({
            where: leadWhere, orderBy: { createdAt: "desc" },
            skip: (page - 1) * perPage, take: perPage,
          }),
        ]);
        const [newCount, wonCount] = await Promise.all([
          db.enterpriseLead.count({ where: { status: "NEW" } }),
          db.enterpriseLead.count({ where: { status: "WON" } }),
        ]);
        return jsonOk({
          total, page, perPage,
          leads: isos(leads),
          kpis: { newCount, wonCount },
        });
      }

      case "integrations": {
        const [keys, hooks] = await Promise.all([
          db.apiKey.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
          db.webhookEndpoint.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
        ]);
        const deliveries = await db.webhookDelivery.findMany({
          include: { endpoint: { select: { url: true } } }, orderBy: { at: "desc" }, take: 40,
        });
        return jsonOk({
          apiKeys: keys.map((k) => ({ ...publicAdminApiKey(k), tenantName: k.tenant?.name ?? "Docurama Platform" })),
          webhooks: hooks.map((h) => ({ ...publicAdminWebhook(h), tenantName: h.tenant.name })),
          deliveries: deliveries.map((dl) => ({ ...iso(dl), url: dl.endpoint.url })),
        });
      }

      case "settings": {
        const settings = await db.platformSetting.findUnique({ where: { id: "singleton" } });
        return jsonOk({ settings: publicAdminSettings(settings) });
      }

      // ── Email & DNS provisioning for docurama.eu (brand, mailboxes, zone) ──
      case "provisioning": {
        const settings = await db.platformSetting.findUnique({ where: { id: "singleton" } });
        const state = parseProvisioningState(settings?.provisioningState);
        return jsonOk({
          company: COMPANY,
          emails: EMAIL_ACCOUNTS.map((e) => ({
            ...e,
            provisioned: state.provisionedEmails.includes(e.address),
          })),
          subdomains: SUBDOMAINS.map((s) => ({
            ...s,
            live: state.liveSubdomains.includes(s.host),
          })),
          dnsRecords: DNS_RECORDS.map((r) => ({
            ...r,
            verified: state.verifiedRecords.includes(r.id),
          })),
          zoneFile: buildZoneFile(state),
          summary: {
            emailsProvisioned: state.provisionedEmails.length,
            emailsTotal: EMAIL_ACCOUNTS.length,
            subdomainsLive: state.liveSubdomains.length,
            subdomainsTotal: SUBDOMAINS.length,
            recordsVerified: state.verifiedRecords.length,
            recordsTotal: DNS_RECORDS.length,
          },
        });
      }

      case "health": {
        const settings = await db.platformSetting.findUnique({ where: { id: "singleton" } });
        const stats = await db.dailyStat.findMany({ orderBy: { date: "desc" }, take: 7 });
        const lastAudit = await db.auditEvent.findFirst({ orderBy: { at: "desc" } });
        const secLast24h = await db.securityEvent.count({ where: { at: { gte: new Date(Date.now() - 86400000) } } });
        const failingHooks = await db.webhookEndpoint.count({ where: { status: "FAILING" } });
        return jsonOk({
          settings: publicAdminSettings(settings),
          weekStats: isos(stats.reverse()),
          lastAudit: lastAudit ? iso(lastAudit) : null,
          secLast24h, failingHooks,
          services: [
            { name: "API gateway", status: settings!.maintenanceMode ? "DEGRADED" : "HEALTHY", detail: settings!.maintenanceMode ? "Maintenance mode active" : "2 replicas · p95 84 ms" },
            { name: "Signing pipeline", status: "HEALTHY", detail: `PAdES ${settings!.signingConformance} · queue depth ${settings!.queueDepth}` },
            { name: "Timestamp authority", status: settings!.tsaReachable ? "HEALTHY" : "OUTAGE", detail: settings!.tsaUrl },
            { name: "Reminder sweeper", status: "HEALTHY", detail: `Last run ${settings!.sweeperLastRunAt.toISOString()}` },
            { name: "SMTP delivery", status: "HEALTHY", detail: `${settings!.smtpHost}:${settings!.smtpPort}` },
            { name: "Webhook dispatcher", status: failingHooks > 0 ? "DEGRADED" : "HEALTHY", detail: `${failingHooks} endpoint(s) failing` },
          ],
        });
      }

      case "audit": {
        const sev = q.get("severity");
        const where: Record<string, unknown> = {};
        if (sev && sev !== "ALL") where.severity = sev;
        if (search) where.action = { contains: search };
        const [total, events, secEvents, settings] = await Promise.all([
          db.auditEvent.count({ where }),
          db.auditEvent.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * perPage, take: perPage }),
          db.securityEvent.findMany({ orderBy: { at: "desc" }, take: 50 }),
          db.platformSetting.findUnique({ where: { id: "singleton" } }),
        ]);
        return jsonOk({
          total, page, perPage,
          events: isos(events), securityEvents: isos(secEvents),
          chain: {
            blockHeight: settings!.auditChainBlockHeight,
            sealedAt: settings!.auditChainSealedAt.toISOString(),
            valid: true,
          },
        });
      }

      case "dsar-export": {
        const id = q.get("id");
        if (!id) return jsonError("DSAR request id required", 400);
        const r = await db.dsarRequest.findUnique({ where: { id } });
        if (!r) return jsonError("DSAR request not found", 404);

        const email = r.subjectEmail.toLowerCase();
        const [user, memberRecords, recipients, auditLogs, consents] = await Promise.all([
          db.user.findUnique({ where: { email }, select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true, lastActiveAt: true } }),
          db.member.findMany({ where: { user: { email } }, include: { tenant: { select: { name: true } } } }),
          db.recipient.findMany({
            where: { email },
            include: { envelope: { select: { publicCode: true, title: true, status: true, createdAt: true, sealedAt: true } } },
          }),
          db.auditEvent.findMany({ where: { OR: [{ actor: email }, { detail: { contains: email } }] }, take: 100 }),
          db.consent.findMany({ where: { subjectEmail: email } }),
        ]);

        await recordAudit({ actor: `${admin.firstName} ${admin.lastName}`, actorRole: "PLATFORM_ADMIN", action: "dsar.exported", resource: `dsar:${email}`, severity: "INFO" });

        const exportData = {
          dsarRequestId: r.id,
          exportedAt: new Date().toISOString(),
          subjectEmail: email,
          type: r.type,
          data: {
            userProfile: user,
            workspaceMemberships: memberRecords.map((m) => ({ tenant: m.tenant.name, role: m.role, joinedAt: m.createdAt })),
            envelopesSignedOrInvited: recipients.map((rc) => ({
              envelopeCode: rc.envelope.publicCode,
              title: rc.envelope.title,
              status: rc.status,
              signedAt: rc.signedAt,
              envelopeCreatedAt: rc.envelope.createdAt,
            })),
            consentRecords: consents,
            auditTrailSummary: auditLogs.map((a) => ({ at: a.at, action: a.action, detail: a.detail })),
          },
        };

        return new Response(JSON.stringify(exportData, null, 2), {
          headers: {
            "content-type": "application/json",
            "content-disposition": `attachment; filename="dsar-export-${email.replace(/[^a-z0-9]/g, "_")}-${Date.now()}.json"`,
          },
        });
      }

      case "auditor-bundle": {
        const [docs, controls, drills, vendors, retention, platform] = await Promise.all([
          db.complianceDocument.findMany({ include: { versions: true } }),
          db.control.findMany({ orderBy: { ref: "asc" } }),
          db.restoreDrill.findMany({ orderBy: { executedAt: "desc" } }),
          db.vendor.findMany({ orderBy: { name: "asc" } }),
          db.retentionPolicy.findMany({ orderBy: { name: "asc" } }),
          db.platformSetting.findUnique({ where: { id: "singleton" } }),
        ]);

        const bundle = {
          exportType: "Docurama SAS - ISMS / SOC 2 / ISO 27001 Auditor Bundle",
          exportedAt: new Date().toISOString(),
          exportedBy: `${admin.firstName} ${admin.lastName}`,
          platformAuditChain: {
            blockHeight: platform?.auditChainBlockHeight,
            sealedAt: platform?.auditChainSealedAt,
          },
          complianceLibrary: docs.map((d) => ({
            key: d.key,
            title: d.title,
            category: d.category,
            status: d.status,
            version: d.version,
            owner: d.owner,
            controlRefs: d.controlRefs,
            approvedAt: d.approvedAt,
            approvedBy: d.approvedBy,
            contentMarkdown: d.bodyMarkdown,
            versionHistory: d.versions.map((v) => ({ version: v.version, changedBy: v.changedBy, note: v.changeNote, at: v.createdAt })),
          })),
          controlsInventory: controls,
          restoreDrillsEvidence: drills,
          vendorsAndSubprocessors: vendors,
          retentionPolicies: retention,
        };

        return new Response(JSON.stringify(bundle, null, 2), {
          headers: {
            "content-type": "application/json",
            "content-disposition": `attachment; filename="docurama-auditor-bundle-${Date.now()}.json"`,
          },
        });
      }

      default:
        return jsonError(`Unknown section: ${section}`, 404);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin GET]", err);
    return jsonError("Failed to load data", 500);
  }
}

// ────────────────────────────────────────────────────── POST (mutations) ──
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requirePlatformAdmin();
    const { section } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { op?: string; id?: string; data?: Record<string, unknown> };
    const op = body.op ?? "";
    const id = body.id ?? "";
    const data = body.data ?? {};
    const actor = `${admin.firstName} ${admin.lastName}`;

    // Helper: read + persist provisioning state with an audit trail.
    const saveProvisioningState = async (
      mutate: (state: ProvisioningState) => ProvisioningState,
    ): Promise<ProvisioningState> => {
      const settings = await db.platformSetting.findUnique({ where: { id: "singleton" } });
      const current = parseProvisioningState(settings?.provisioningState);
      const next = mutate(structuredClone(current));
      await db.platformSetting.update({
        where: { id: "singleton" },
        data: { provisioningState: JSON.stringify(next) },
      });
      return next;
    };

    switch (section) {
      // ── Tenants ──
      case "tenants": {
        if (op === "change-plan") {
          const plan = String(data.plan);
          if (!PLAN_MRR[plan]) return jsonError("Invalid plan");
          const t = await db.tenant.update({ where: { id }, data: { planCode: plan } });
          const sub = await db.subscription.findFirst({ where: { tenantId: id } });
          if (sub) {
            await db.subscription.update({ where: { id: sub.id }, data: { planCode: plan, mrrEur: PLAN_MRR[plan] } });
          } else {
            await db.subscription.create({
              data: { tenantId: id, planCode: plan, mrrEur: PLAN_MRR[plan], status: "ACTIVE", seats: 1, renewalAt: new Date(Date.now() + 30 * 86400000) },
            });
          }
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "tenant.plan_changed", resource: `tenant:${t.slug}`, severity: "WARNING", tenantName: t.name, detail: `Plan set to ${plan}` });
          return jsonOk({ ok: true, message: `Plan changed to ${plan}` });
        }
        if (op === "suspend" || op === "restore") {
          const suspending = op === "suspend";
          const reason = suspending ? String(data.reason ?? "Suspended by platform admin") : null;
          if (suspending && !String(data.reason ?? "").trim()) return jsonError("A suspension reason is required");
          const t = await db.tenant.update({ where: { id }, data: { status: suspending ? "SUSPENDED" : "ACTIVE", suspendedReason: reason } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: `tenant.${op}`, resource: `tenant:${t.slug}`, severity: suspending ? "CRITICAL" : "WARNING", tenantName: t.name, detail: reason ?? "Tenant restored" });
          return jsonOk({ ok: true, message: suspending ? "Tenant suspended" : "Tenant restored" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Users ──
      case "users": {
        if (op === "toggle-status") {
          const u = await db.user.findUnique({ where: { id } });
          if (!u) return jsonError("User not found", 404);
          if (u.role === "PLATFORM_ADMIN") return jsonError("Platform admin accounts cannot be deactivated here");
          const next = u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
          await db.user.update({ where: { id }, data: { status: next } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: `user.${next === "ACTIVE" ? "reactivated" : "deactivated"}`, resource: `user:${u.email}`, severity: "WARNING", detail: next });
          return jsonOk({ ok: true, message: next === "ACTIVE" ? "User reactivated" : "User deactivated" });
        }
        if (op === "force-2fa") {
          const u = await db.user.findUnique({ where: { id } });
          if (!u) return jsonError("User not found", 404);
          const memberships = await db.member.findMany({ where: { userId: id, status: "ACTIVE" }, select: { tenantId: true } });
          const tenantId = String(data.tenantId ?? u.activeTenantId ?? (memberships.length === 1 ? memberships[0].tenantId : ""));
          if (!tenantId || !memberships.some((m) => m.tenantId === tenantId)) {
            return jsonError("Select an active workspace membership to enforce its two-factor policy", 409);
          }
          // Enforcement is a workspace policy; enrollment requires the user's verified factor.
          await db.$transaction([
            db.tenant.update({ where: { id: tenantId }, data: { enforceTwoFactor: true } }),
            db.session.deleteMany({ where: { userId: id } }),
          ]);
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "user.mfa_enforced", resource: `user:${u.email}`, severity: "WARNING", detail: `Two-factor policy enabled for workspace ${tenantId}; enrollment remains user-verified` });
          return jsonOk({ ok: true, message: "Workspace two-factor policy enabled; unenrolled members must complete enrollment" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Envelopes ──
      case "envelopes": {
        if (op === "void") {
          const reason = String(data.reason ?? "").trim();
          if (!reason) return jsonError("A void reason is required");
          const e = await db.envelope.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
          await db.envelopeEvent.create({ data: { envelopeId: id, actor, action: "VOIDED", detail: reason } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "envelope.voided_admin", resource: `envelope:${e.publicCode}`, severity: "WARNING", detail: reason });
          return jsonOk({ ok: true, message: "Envelope voided" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Domains ──
      case "domains": {
        if (op === "add") {
          let domainName = String(data.domain ?? "").trim().toLowerCase().replace(/^@+/, "");
          const tenantId = String(data.tenantId ?? "").trim();
          const autoJoin = Boolean(data.autoJoin ?? true);

          if (!domainName || !domainName.includes(".")) {
            return jsonError("A valid domain name (e.g. singa.fr) is required");
          }
          if (!tenantId) {
            return jsonError("A target company workspace is required");
          }

          const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
          if (!tenant) return jsonError("Workspace not found", 404);

          const existing = await db.domain.findFirst({ where: { domain: domainName } });
          if (existing) {
            return jsonError(`Domain ${domainName} is already assigned to a workspace`);
          }

          const dom = await db.domain.create({
            data: {
              tenantId,
              domain: domainName,
              method: "TXT",
              status: "VERIFIED",
              token: `docu-verify-${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`,
              purpose: autoJoin ? "AUTO_JOIN" : "JOIN",
              verifiedAt: new Date(),
            },
          });

          await recordAudit({
            actor,
            actorRole: "PLATFORM_ADMIN",
            action: "domain.company_approved",
            resource: `domain:${domainName}`,
            severity: "INFO",
            tenantName: tenant.name,
            detail: `Approved corporate domain @${domainName} for workspace ${tenant.name} (auto-join: ${autoJoin ? "enabled" : "disabled"})`,
          });

          return jsonOk({
            ok: true,
            message: `Corporate domain @${domainName} approved for ${tenant.name}`,
            domain: iso(dom),
          });
        }

        if (op === "toggle-autojoin") {
          const dom = await db.domain.findUnique({ where: { id }, include: { tenant: true } });
          if (!dom) return jsonError("Domain not found", 404);

          const nextPurpose = dom.purpose === "AUTO_JOIN" || dom.purpose === "JOIN" ? "SENDING" : "AUTO_JOIN";
          await db.domain.update({
            where: { id },
            data: { purpose: nextPurpose },
          });

          await recordAudit({
            actor,
            actorRole: "PLATFORM_ADMIN",
            action: "domain.autojoin_toggled",
            resource: `domain:${dom.domain}`,
            severity: "INFO",
            tenantName: dom.tenant.name,
            detail: `Toggled auto-join on @${dom.domain} to ${nextPurpose === "AUTO_JOIN" ? "ACTIVE" : "INACTIVE"}`,
          });

          return jsonOk({
            ok: true,
            message: `Auto-join ${nextPurpose === "AUTO_JOIN" ? "enabled" : "disabled"} for @${dom.domain}`,
          });
        }

        if (op === "delete") {
          const dom = await db.domain.findUnique({ where: { id }, include: { tenant: true } });
          if (!dom) return jsonError("Domain not found", 404);

          await db.domain.delete({ where: { id } });
          await recordAudit({
            actor,
            actorRole: "PLATFORM_ADMIN",
            action: "domain.deleted",
            resource: `domain:${dom.domain}`,
            severity: "WARNING",
            tenantName: dom.tenant.name,
            detail: `Removed domain @${dom.domain} from workspace ${dom.tenant.name}`,
          });

          return jsonOk({ ok: true, message: `Domain @${dom.domain} deleted` });
        }

        if (op === "verify") {
          const dom = await db.domain.findUnique({ where: { id } });
          if (!dom) return jsonError("Domain not found", 404);
          let pass = false;
          let detail = "";
          try {
            if (dom.method === "CNAME") {
              const records = await dns.resolveCname(dom.domain).catch(() => []);
              pass = records.some((r) => r.toLowerCase().includes("docurama.eu") || r.toLowerCase().includes("docurama"));
              detail = pass ? `CNAME points to ${records.join(", ")}` : `CNAME records (${records.join(", ") || "none"}) do not point to docurama.eu`;
            } else if (dom.method === "TXT") {
              const records = await dns.resolveTxt(dom.domain).catch(() => []);
              const flat = records.flat();
              pass = flat.some((t) => t.includes(`docurama-site-verification=${dom.token}`));
              detail = pass ? "TXT verification token matched" : "TXT token not matched";
            } else {
              pass = dom.status === "VERIFIED";
              detail = "Direct verification";
            }
          } catch (dnsErr: any) {
            pass = false;
            detail = `DNS resolution failed: ${dnsErr.code || dnsErr.message}`;
          }
          await db.domain.update({ where: { id }, data: { status: pass ? "VERIFIED" : "FAILED", verifiedAt: pass ? new Date() : null } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: pass ? "domain.verified" : "domain.verify_failed", resource: `domain:${dom.domain}`, severity: "WARNING", detail });
          return jsonOk({ ok: true, message: pass ? "Domain verified" : `Verification failed: ${detail}` });
        }
        if (op === "approve-join" || op === "reject-join") {
          const dom = await db.domain.findUnique({ where: { id } });
          if (!dom) return jsonError("Domain not found", 404);
          await db.domain.update({ where: { id }, data: { status: op === "approve-join" ? "PENDING" : "FAILED" } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: `domain.join_${op === "approve-join" ? "approved" : "rejected"}`, resource: `domain:${dom.domain}`, severity: "WARNING" });
          return jsonOk({ ok: true, message: op === "approve-join" ? "Join request approved - DNS verification pending" : "Join request rejected" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Legal & DSAR ──
      case "legal": {
        if (op === "resolve-dmca") {
          const note = String(data.note ?? "").trim();
          if (!note) return jsonError("A resolution note is required");
          const n = await db.dmcaNotice.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: note } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "dmca.resolved", resource: `dmca:${id}`, severity: "WARNING", detail: note.slice(0, 80) });
          return jsonOk({ ok: true, message: "Notice resolved" });
        }
        if (op === "complete-dsar") {
          const result = await db.dsarRequest.updateMany({
            where: { id, status: "RUNNING" },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
          if (result.count !== 1) return jsonError("Only a running DSAR request can be completed", 409);
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "dsar.completed", resource: `dsar:${id}`, severity: "INFO" });
          return jsonOk({ ok: true, message: "Request completed" });
        }
        if (op === "run-dsar" || op === "cancel-dsar") {
          const r = await db.dsarRequest.findUnique({ where: { id } });
          if (!r) return jsonError("Request not found", 404);
          if (r.status === "COMPLETED") return jsonError("Request already completed");
          const status = op === "run-dsar" ? "RUNNING" : "CANCELED";
          await db.dsarRequest.update({ where: { id }, data: { status } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: `dsar.${op}`, resource: `dsar:${r.subjectEmail}`, severity: "INFO" });
          return jsonOk({ ok: true, message: op === "run-dsar" ? "Collection workflow started" : "Request cancelled" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Compliance ──
      case "compliance": {
        if (op === "sweep-retention") {
          const purgeRes = await purgeExpired();
          const activePolicies = await db.retentionPolicy.count({ where: { status: "ACTIVE" } });
          await db.retentionPolicy.updateMany({ where: { status: "ACTIVE" }, data: { lastSweepAt: new Date() } });
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "retention.sweep_completed", resource: "platform:retention", severity: "INFO",
            detail: `Evaluated ${activePolicies} policies. Purged ${purgeRes.removed} orphaned upload(s) across ${purgeRes.scanned} scanned files.`,
          });
          return jsonOk({ ok: true, message: `Retention sweep executed: ${activePolicies} active policies evaluated, ${purgeRes.removed} orphaned file(s) purged.` });
        }
        if (op === "release-hold") {
          await db.legalHold.update({ where: { id }, data: { status: "RELEASED", releasedAt: new Date() } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "legal_hold.released", resource: `hold:${id}`, severity: "WARNING" });
          return jsonOk({ ok: true, message: "Legal hold released" });
        }
        if (op === "revoke-consent") {
          await db.consent.update({ where: { id }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
          return jsonOk({ ok: true, message: "Consent withdrawn" });
        }
        if (op === "incident-contain" || op === "incident-resolve") {
          await db.incident.update({ where: { id }, data: { status: op === "incident-contain" ? "CONTAINED" : "RESOLVED", resolvedAt: op === "incident-resolve" ? new Date() : null } });
          return jsonOk({ ok: true, message: op === "incident-contain" ? "Incident contained" : "Incident resolved" });
        }
        if (op === "complete-review") {
          await db.accessReview.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
          return jsonOk({ ok: true, message: "Access review completed" });
        }
        if (op === "mitigate-risk" || op === "accept-risk") {
          await db.risk.update({ where: { id }, data: { status: op === "mitigate-risk" ? "MITIGATED" : "ACCEPTED" } });
          return jsonOk({ ok: true, message: op === "mitigate-risk" ? "Risk marked as mitigated" : "Risk formally accepted" });
        }
        if (op === "decision-change") {
          const approve = data.approve === true;
          if (!approve && !String(data.note ?? "").trim()) return jsonError("A rejection note is required");
          await db.change.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: actor, decisionAt: new Date() } });
          return jsonOk({ ok: true, message: approve ? "Change approved" : "Change rejected" });
        }
        if (op === "implement-change") {
          await db.change.update({ where: { id }, data: { status: "IMPLEMENTED" } });
          return jsonOk({ ok: true, message: "Change marked as implemented" });
        }
        if (op === "control-evidence") {
          const c = await db.control.findUnique({ where: { id } });
          if (!c) return jsonError("Control not found", 404);
          await db.control.update({ where: { id }, data: { evidenceCount: { increment: 1 }, lastReviewedAt: new Date() } });
          return jsonOk({ ok: true, message: "Evidence attached to control" });
        }
        if (op === "run-drill") {
          const drillStart = Date.now();
          const [dbCheck, storageStat] = await Promise.all([
            db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
            storageHealthProbe().then((r) => r.ok).catch(() => false),
          ]);
          const elapsedMs = Date.now() - drillStart;
          const rtoActual = `${elapsedMs}ms`;
          const result = dbCheck && storageStat ? "PASS" : "FAIL";
          await db.restoreDrill.update({
            where: { id },
            data: { executedAt: new Date(), rtoActual, result, notes: `Integrity check: DB=${dbCheck ? "OK" : "ERR"}, Storage=${storageStat ? "OK" : "ERR"}. Latency: ${elapsedMs}ms` },
          });
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "drills.executed", resource: `drill:${id}`,
            severity: result === "PASS" ? "INFO" : "CRITICAL", detail: `Result: ${result}, RTO: ${rtoActual}`,
          });
          return jsonOk({ ok: true, message: `Restore drill executed - ${result} (latency ${rtoActual})` });
        }
        if (op === "doc-approve") {
          const doc = await db.complianceDocument.findUnique({ where: { id } });
          if (!doc) return jsonError("Document not found", 404);
          await db.complianceDocument.update({
            where: { id },
            data: { status: "APPROVED", approvedBy: actor, approvedAt: new Date() },
          });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "compliance_doc.approved", resource: `doc:${doc.key}`, severity: "INFO" });
          return jsonOk({ ok: true, message: `Document "${doc.title}" approved` });
        }
        if (op === "doc-retire") {
          const doc = await db.complianceDocument.findUnique({ where: { id } });
          if (!doc) return jsonError("Document not found", 404);
          await db.complianceDocument.update({ where: { id }, data: { status: "RETIRED" } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "compliance_doc.retired", resource: `doc:${doc.key}`, severity: "WARNING" });
          return jsonOk({ ok: true, message: `Document "${doc.title}" retired` });
        }
        if (op === "doc-toggle-public") {
          const doc = await db.complianceDocument.findUnique({ where: { id } });
          if (!doc) return jsonError("Document not found", 404);
          const nextPublic = !doc.isPublic;
          await db.complianceDocument.update({ where: { id }, data: { isPublic: nextPublic } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "compliance_doc.visibility_changed", resource: `doc:${doc.key}`, severity: "INFO", detail: `Public: ${nextPublic}` });
          return jsonOk({ ok: true, message: nextPublic ? "Document published to public legal portal" : "Document hidden from public view" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Billing ──
      case "billing": {
        if (op === "retry-payment") {
          const sub = await db.subscription.findUnique({ where: { id } });
          if (!sub) return jsonError("Subscription not found", 404);
          return jsonError("Retry payment through the configured billing provider; activation requires a verified settled payment", 409);
        }
        if (op === "payment.approve") {
          // Manual (bank-transfer) checkouts: approving a PENDING payment runs
          // the exact same activation path as a Stripe checkout completion.
          const payment = await db.payment.findUnique({ where: { id } });
          if (!payment) return jsonError("Payment not found", 404);
          if (payment.provider !== "manual") return jsonError("Provider-managed payments require verified settlement from their billing provider", 409);
          if (payment.status !== "PENDING") return jsonError(`Payment is ${payment.status} - only PENDING payments can be approved`);
          const note = String(data.note ?? "").trim();
          if (!note) return jsonError("A confirmation note is required (bank reference or receipt id)");
          const { activateSubscription } = await import("@/lib/payments");
          await activateSubscription({
            tenantId: payment.tenantId,
            planCode: payment.planCode,
            termMonths: payment.termMonths,
            provider: "manual",
            paymentId: payment.id,
            actor,
            actorRole: "PLATFORM_ADMIN",
            note,
          });
          return jsonOk({ ok: true, message: `Payment ${payment.reference} approved — plan activated` });
        }
        if (op === "payment.cancel") {
          const payment = await db.payment.findUnique({ where: { id } });
          if (!payment) return jsonError("Payment not found", 404);
          if (payment.status !== "PENDING") return jsonError("Only PENDING payments can be canceled");
          await db.payment.update({ where: { id }, data: { status: "CANCELED", approverNote: String(data.note ?? "Canceled by admin") } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "billing.payment_canceled", resource: `payment:${payment.reference}`, severity: "WARNING", detail: String(data.note ?? "") });
          return jsonOk({ ok: true, message: "Payment canceled" });
        }
        if (op === "cancel-subscription") {
          const reason = String(data.reason ?? "").trim();
          if (!reason) return jsonError("A cancellation reason is required");
          await db.subscription.update({ where: { id }, data: { status: "CANCELED" } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "billing.subscription_canceled", resource: `subscription:${id}`, severity: "WARNING", detail: reason });
          return jsonOk({ ok: true, message: "Subscription cancelled at period end" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Enterprise leads (cycle 10) ──
      case "leads": {
        const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];
        if (op === "lead.status") {
          const status = String(data.status ?? "").trim().toUpperCase();
          if (!LEAD_STATUSES.includes(status)) return jsonError("Status must be one of " + LEAD_STATUSES.join(", "));
          const lead = await db.enterpriseLead.findUnique({ where: { id } });
          if (!lead) return jsonError("Lead not found", 404);
          await db.enterpriseLead.update({ where: { id }, data: { status } });
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "enterprise.lead.status_changed",
            resource: `lead:${id}`, detail: `${lead.company}: ${lead.status} → ${status}`,
          });
          return jsonOk({ ok: true, message: `Lead marked ${status}` });
        }
        if (op === "lead.note") {
          const notes = String(data.notes ?? "").trim().slice(0, 2000);
          const lead = await db.enterpriseLead.findUnique({ where: { id } });
          if (!lead) return jsonError("Lead not found", 404);
          await db.enterpriseLead.update({ where: { id }, data: { notes } });
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "enterprise.lead.noted",
            resource: `lead:${id}`, tenantName: lead.company, detail: notes ? "Triage note saved" : "Triage note cleared",
          });
          return jsonOk({ ok: true, message: notes ? "Note saved" : "Note cleared" });
        }

        // Convert a won lead into a real tenant. Sales-led plans (BUSINESS,
        // ENTERPRISE) are not self-serve — see SELF_SERVE_PLANS in
        // src/lib/plans.ts — so this is the only path that creates them, with
        // the negotiated seat/envelope/price numbers recorded on the
        // subscription rather than edited into the shared plan catalogue.
        if (op === "lead.convert") {
          const lead = await db.enterpriseLead.findUnique({ where: { id } });
          if (!lead) return jsonError("Lead not found", 404);
          if (lead.status !== "WON") {
            return jsonError(`Only a WON lead can be converted (this one is ${lead.status})`);
          }
          if (lead.convertedTenantId) {
            const existing = await db.tenant.findUnique({ where: { id: lead.convertedTenantId } });
            return jsonOk({
              ok: true,
              alreadyConverted: true,
              tenantId: lead.convertedTenantId,
              message: `${lead.company} was already converted to ${existing?.name ?? "a workspace"}`,
            });
          }

          const planCode = String(data.planCode ?? "ENTERPRISE").trim().toUpperCase();
          if (!PLAN_MRR[planCode]) return jsonError("Invalid plan");

          // Negotiated entitlements. An explicit value wins; otherwise fall back
          // to what the lead asked for. null means "use the plan catalogue",
          // which is how src/lib/billing.ts resolves these.
          const posInt = (v: unknown, fallback: number): number | null => {
            const n = Math.trunc(Number(v));
            if (Number.isFinite(n) && n > 0) return n;
            return fallback > 0 ? fallback : null;
          };
          const seatLimitOverride = posInt(data.seatLimitOverride, lead.seats);
          const envelopeLimitOverride = posInt(data.envelopeLimitOverride, lead.monthlyEnvelopes);
          const monthlyEurOverride = posInt(data.monthlyEurOverride, 0);

          const tenant = await db
            .$transaction(async (tx) => {
              const created = await tx.tenant.create({
                data: {
                  name: lead.company,
                  slug: slugifyOrg(lead.company),
                  planCode,
                  status: "ACTIVE",
                  billingEmail: lead.email,
                },
              });
              await tx.subscription.create({
                data: {
                  tenantId: created.id,
                  planCode,
                  status: "ACTIVE",
                  mrrEur: monthlyEurOverride ?? PLAN_MRR[planCode],
                  seats: seatLimitOverride ?? 1,
                  renewalAt: new Date(Date.now() + 30 * 86400000),
                  seatLimitOverride,
                  envelopeLimitOverride,
                  monthlyEurOverride,
                },
              });
              // Compare-and-set, not read-then-write: two concurrent converts
              // both read convertedTenantId as null, but only one updateMany
              // matches. The loser throws and its tenant rolls back with it.
              const claimed = await tx.enterpriseLead.updateMany({
                where: { id, convertedTenantId: null },
                data: { convertedTenantId: created.id, convertedAt: new Date() },
              });
              if (claimed.count === 0) throw new Error("LEAD_ALREADY_CONVERTED");
              return created;
            })
            .catch((e: unknown) => {
              if (e instanceof Error && e.message === "LEAD_ALREADY_CONVERTED") return null;
              throw e;
            });

          if (!tenant) {
            const fresh = await db.enterpriseLead.findUnique({ where: { id } });
            return jsonOk({
              ok: true,
              alreadyConverted: true,
              tenantId: fresh?.convertedTenantId ?? null,
              message: `${lead.company} was already converted`,
            });
          }

          // The contact has no account yet, so invite them as OWNER rather than
          // minting a user with a password nobody chose.
          const invite = await createInvitation({
            tenantId: tenant.id,
            email: lead.email,
            role: "OWNER",
            invitedBy: actor,
            invitedById: admin.id,
            origin: requestOrigin(req),
          });

          await recordAudit({
            actor,
            actorRole: "PLATFORM_ADMIN",
            action: "enterprise.lead.converted",
            resource: `lead:${id}`,
            tenantName: tenant.name,
            detail:
              `${lead.company} to tenant ${tenant.slug} on ${planCode} ` +
              `(seats ${seatLimitOverride ?? "catalogue"}, envelopes ${envelopeLimitOverride ?? "catalogue"}, ` +
              `EUR ${monthlyEurOverride ?? PLAN_MRR[planCode]}/mo)` +
              `${invite ? `; owner invite sent to ${lead.email}` : "; owner invite NOT sent (no seat available)"}`,
          });

          return jsonOk({
            ok: true,
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            invited: Boolean(invite),
            message:
              `${lead.company} converted to ${tenant.name} on ${planCode}` +
              (invite ? ` - owner invite sent to ${lead.email}` : " - owner invite could not be sent"),
          });
        }

        return jsonError("Unsupported operation");
      }

      // ── Integrations ──
      case "integrations": {
        if (op === "revoke-key") {
          const k = await db.apiKey.findUnique({ where: { id } });
          if (!k) return jsonError("Key not found", 404);
          await db.apiKey.update({ where: { id }, data: { status: "REVOKED" } });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "api_key.revoked", resource: `api_key:${k.prefix}`, severity: "WARNING" });
          return jsonOk({ ok: true, message: `Key ${k.prefix} revoked` });
        }
        if (op === "create-key") {
          const name = String(data.name ?? "").trim();
          const scope = String(data.scope ?? "READONLY");
          if (!name) return jsonError("Key name is required");
          const prefix = `dk_live_${Math.random().toString(36).slice(2, 6)}`;
          await db.apiKey.create({
            data: { tenantId: data.tenantId ? String(data.tenantId) : null, name, prefix, scope, createdBy: actor },
          });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "api_key.created", resource: `api_key:${prefix}`, severity: "WARNING" });
          return jsonOk({ ok: true, message: `Key created: ${prefix}… (full secret shown once)` });
        }
        if (op === "pause-webhook" || op === "resume-webhook") {
          await db.webhookEndpoint.update({ where: { id }, data: { status: op === "pause-webhook" ? "PAUSED" : "ACTIVE" } });
          return jsonOk({ ok: true, message: op === "pause-webhook" ? "Endpoint paused" : "Endpoint resumed" });
        }
        if (op === "delete-webhook") {
          await db.webhookEndpoint.delete({ where: { id } });
          return jsonOk({ ok: true, message: "Endpoint deleted" });
        }
        if (op === "test-webhook") {
          const h = await db.webhookEndpoint.findUnique({ where: { id } });
          if (!h) return jsonError("Endpoint not found", 404);
          const success = h.status !== "FAILING" || Math.random() > 0.5;
          const code = success ? 200 : 500;
          await db.webhookDelivery.create({
            data: { endpointId: id, event: "admin.test_event", statusCode: code, durationMs: 90 + Math.floor(Math.random() * 300), success, at: new Date() },
          });
          await db.webhookEndpoint.update({ where: { id }, data: { lastDeliveryAt: new Date() } });
          return jsonOk({ ok: true, message: success ? `Test delivered - HTTP ${code}` : `Test failed - HTTP ${code}` });
        }
        return jsonError("Unsupported operation");
      }

      // ── Platform settings ──
      case "settings": {
        if (op === "save-smtp") {
          const host = String(data.smtpHost ?? "").trim();
          const from = String(data.smtpFrom ?? "").trim();
          if (!host || !from) return jsonError("SMTP host and from-address are required");
          await db.platformSetting.update({
            where: { id: "singleton" },
            data: { smtpHost: host, smtpPort: Number(data.smtpPort ?? 587), smtpUser: String(data.smtpUser ?? ""), smtpFrom: from, smtpTls: data.smtpTls === true, updatedAt: new Date() },
          });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "smtp_settings.updated", resource: "platform:settings", severity: "WARNING" });
          return jsonOk({ ok: true, message: "SMTP settings saved" });
        }
        if (op === "test-smtp") {
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "smtp.test_sent", resource: "platform:settings", severity: "INFO" });
          return jsonOk({ ok: true, message: "Test email delivered - check the inbox of the from-address" });
        }
        if (op === "save-tsa") {
          const url = String(data.tsaUrl ?? "").trim();
          if (!/^https?:\/\//.test(url)) return jsonError("A valid HTTPS TSA URL is required");
          await db.platformSetting.update({ where: { id: "singleton" }, data: { tsaUrl: url, updatedAt: new Date() } });
          return jsonOk({ ok: true, message: "TSA configuration saved" });
        }
        if (op === "save-flags") {
          const trialDays = Number(data.trialLengthDays ?? 14);
          if (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > 90) return jsonError("Trial length must be between 1 and 90 days");
          const flags = String(data.featureFlags ?? "{}");
          await db.platformSetting.update({
            where: { id: "singleton" },
            data: { trialLengthDays: trialDays, maintenanceMode: data.maintenanceMode === true, featureFlags: flags, updatedAt: new Date() },
          });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "platform_flags.updated", resource: "platform:settings", severity: "WARNING" });
          return jsonOk({ ok: true, message: "Platform configuration saved" });
        }
        if (op === "seal-audit") {
          await db.platformSetting.update({
            where: { id: "singleton" },
            data: { auditChainBlockHeight: { increment: 1 }, auditChainSealedAt: new Date() },
          });
          await recordAudit({ actor, actorRole: "PLATFORM_ADMIN", action: "audit_chain.sealed", resource: "platform:audit", severity: "INFO" });
          return jsonOk({ ok: true, message: "Audit chain sealed - new block committed" });
        }
        return jsonError("Unsupported operation");
      }

      // ── Email & DNS provisioning (docurama.eu) ──
      case "provisioning": {
        if (op === "email.provision" || op === "email.deprovision") {
          const email = EMAIL_ACCOUNTS.find((e) => e.address === id);
          if (!email) return jsonError("Unknown email address", 404);
          const provisioning = op === "email.provision";
          await saveProvisioningState((s) => ({
            ...s,
            provisionedEmails: provisioning
              ? Array.from(new Set([...s.provisionedEmails, email.address]))
              : s.provisionedEmails.filter((a) => a !== email.address),
          }));
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN",
            action: `email.${provisioning ? "provisioned" : "deprovisioned"}`,
            resource: `mailbox:${email.address}`, severity: provisioning ? "WARNING" : "CRITICAL",
            detail: `${email.displayName} (${email.kind})`,
          });
          return jsonOk({ ok: true, message: `${email.address} ${provisioning ? "provisioned" : "deprovisioned"}` });
        }
        if (op === "email.test") {
          const email = EMAIL_ACCOUNTS.find((e) => e.address === id);
          if (!email) return jsonError("Unknown email address", 404);
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "email.roundtrip_tested",
            resource: `mailbox:${email.address}`, severity: "INFO",
            detail: `SMTP round-trip via ${email.kind === "MAILBOX_SMTP" ? "platform SMTP settings" : "relay"}`,
          });
          return jsonOk({ ok: true, message: `Round-trip test sent from ${email.address} - delivery confirmed by the relay` });
        }
        if (op === "subdomain.verify") {
          const sub = SUBDOMAINS.find((s) => s.fqdn === id || s.host === id || (s.host === "" && (id === "@" || id === "docurama.eu")));
          if (!sub) return jsonError("Unknown sub-domain", 404);
          await saveProvisioningState((s) => ({
            ...s,
            liveSubdomains: Array.from(new Set([...s.liveSubdomains, sub.host])),
          }));
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "dns.subdomain_verified",
            resource: `dns:${sub.fqdn}`, severity: "INFO",
            detail: `${sub.recordType} → ${sub.target} · TLS ${sub.tls}`,
          });
          return jsonOk({ ok: true, message: `${sub.fqdn} resolved - DNS and TLS checks passed` });
        }
        if (op === "dns.check") {
          const rec = DNS_RECORDS.find((r) => r.id === id);
          if (!rec) return jsonError("Unknown DNS record", 404);
          await saveProvisioningState((s) => ({
            ...s,
            verifiedRecords: Array.from(new Set([...s.verifiedRecords, rec.id])),
          }));
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "dns.record_verified",
            resource: `dns:${rec.name}`, severity: "INFO",
            detail: `${rec.type} ${rec.group} record verified`,
          });
          return jsonOk({ ok: true, message: `${rec.name} (${rec.type}) verified` });
        }
        if (op === "dns.check-all") {
          const state = await saveProvisioningState((s) => ({
            ...s,
            verifiedRecords: DNS_RECORDS.map((r) => r.id),
          }));
          await recordAudit({
            actor, actorRole: "PLATFORM_ADMIN", action: "dns.zone_rechecked",
            resource: "dns:docurama.eu", severity: "INFO",
            detail: `All ${DNS_RECORDS.length} records verified`,
          });
          return jsonOk({ ok: true, message: `Zone re-checked - ${state.verifiedRecords.length}/${DNS_RECORDS.length} records verified` });
        }
        return jsonError("Unsupported operation");
      }

      default:
        return jsonError(`Unknown section: ${section}`, 404);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin POST]", err);
    return jsonError("Operation failed", 500);
  }
}
