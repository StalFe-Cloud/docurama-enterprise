/// <reference types="bun-types" />

/**
 * Enterprise lead → tenant conversion.
 *
 * Run alone: bun test e2e/lead-conversion.test.ts. Owns a fresh scratch DB and
 * next/headers, like e2e/auth-security.test.ts.
 *
 * BUSINESS and ENTERPRISE are not in SELF_SERVE_PLANS (src/lib/plans.ts), so
 * this admin operation is the only path that creates them. What it has to get
 * right: the WON guard, idempotency, the negotiated entitlements actually
 * reaching the billing layer, and inviting the contact rather than minting a
 * user with a password nobody chose.
 */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { Database } from "bun:sqlite";

const scratchDir = mkdtempSync(join(tmpdir(), "docurama-lead-conversion-"));
process.env.DATABASE_URL = `file:${join(scratchDir, "lead.db").replace(/\\/g, "/")}`;
new Database(join(scratchDir, "lead.db"), { create: true }).close();
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], {
  env: process.env, stdio: "pipe",
});

let cookieToken: string | undefined;
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieToken ? { value: cookieToken } : undefined) }),
  headers: async () => new Headers(),
}));

const { db } = await import("../src/lib/db");
const billing = await import("../src/lib/billing");
const { planDef } = await import("../src/lib/plans");
const { foldForSearch } = await import("../src/lib/search");
const { resolveSessionUser } = await import("../src/lib/auth");
const { getSettingsSection } = await import("../src/lib/settings-handlers");
const adminRoute = await import("../src/app/api/admin/[section]/route");

let sequence = 0;
const unique = () => `lead-${++sequence}`;

/** Sign in as a platform admin for the duration of the suite. */
const admin = await db.user.create({
  data: {
    email: "lead-admin@example.test",
    firstName: "Lead",
    lastName: "Admin",
    passwordHash: "unused",
    role: "PLATFORM_ADMIN",
  },
});
const session = await db.session.create({
  data: { userId: admin.id, expiresAt: new Date(Date.now() + 3600_000) },
});
cookieToken = session.id;

afterAll(async () => {
  await db.$disconnect();
  rmSync(scratchDir, { recursive: true, force: true });
});

const ctx = { params: Promise.resolve({ section: "leads" }) };

async function convert(id: string, data: Record<string, unknown> = {}) {
  const res = await adminRoute.POST(
    new NextRequest("http://127.0.0.1:3000/api/admin/leads", {
      method: "POST",
      body: JSON.stringify({ op: "lead.convert", id, data }),
    }),
    ctx,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function newLead(overrides: Record<string, unknown> = {}) {
  return db.enterpriseLead.create({
    data: {
      company: `Werner Stahlbau ${unique()}`,
      contactName: "Erika Werner",
      email: `${unique()}@example.test`,
      status: "WON",
      seats: 40,
      monthlyEnvelopes: 5000,
      ...overrides,
    },
  });
}

describe("enterprise lead conversion", () => {
  test("only a WON lead converts", async () => {
    for (const status of ["NEW", "CONTACTED", "QUALIFIED", "LOST"]) {
      const lead = await newLead({ status });
      const { body } = await convert(lead.id);
      expect(String(body.error)).toMatch(/Only a WON lead/);
      expect(await db.tenant.count({ where: { name: lead.company } })).toBe(0);
    }
  });

  test("a missing lead 404s", async () => {
    const { status } = await convert("does-not-exist");
    expect(status).toBe(404);
  });

  test("converting creates the tenant, subscription, owner invite and audit trail", async () => {
    const lead = await newLead();
    const { body } = await convert(lead.id, {
      planCode: "ENTERPRISE",
      seatLimitOverride: 250,
      envelopeLimitOverride: 40_000,
      monthlyEurOverride: 1_800,
    });

    expect(body.ok).toBe(true);
    const tenantId = String(body.tenantId);
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    expect(tenant?.name).toBe(lead.company);
    expect(tenant?.planCode).toBe("ENTERPRISE");
    expect(tenant?.status).toBe("ACTIVE");
    // Billing contact carries over from the lead.
    expect(tenant?.billingEmail).toBe(lead.email);
    // Slug is derived but uniquified, never the bare company name.
    expect(tenant?.slug).toMatch(/^werner-stahlbau-lead-\d+-[0-9a-f]{6}$/);

    const sub = await db.subscription.findFirst({ where: { tenantId } });
    expect(sub?.planCode).toBe("ENTERPRISE");
    expect(sub?.status).toBe("ACTIVE");
    expect(sub?.seatLimitOverride).toBe(250);
    expect(sub?.envelopeLimitOverride).toBe(40_000);
    expect(sub?.monthlyEurOverride).toBe(1_800);
    expect(sub?.mrrEur).toBe(1_800);

    // The contact has no account, so they are invited as OWNER.
    const invite = await db.invitation.findFirst({ where: { tenantId } });
    expect(invite?.email).toBe(lead.email);
    expect(invite?.role).toBe("OWNER");
    expect(invite?.status).toBe("PENDING");
    expect(body.invited).toBe(true);
    // No user is minted with a password nobody chose.
    expect(await db.user.count({ where: { email: lead.email } })).toBe(0);

    const audit = await db.auditEvent.findFirst({
      where: { action: "enterprise.lead.converted", resource: `lead:${lead.id}` },
    });
    expect(audit).toBeTruthy();
    expect(audit?.detail).toContain("250");
    expect(audit?.detail).toContain("40000");
  });

  test("the negotiated numbers are what the billing layer enforces", async () => {
    const lead = await newLead();
    const { body } = await convert(lead.id, {
      planCode: "BUSINESS",
      seatLimitOverride: 175,
      envelopeLimitOverride: 33_000,
    });
    const tenantId = String(body.tenantId);

    // Not the BUSINESS catalogue numbers — the contracted ones.
    const catalogue = planDef("BUSINESS");
    expect(catalogue.seatLimit).not.toBe(175);
    expect(catalogue.envelopeLimit).not.toBe(33_000);

    const seats = await billing.seatCapacity(tenantId);
    expect(seats.seatLimit).toBe(175);
    // The owner invitation already holds one seat.
    expect(seats.pendingInvites).toBe(1);
    expect(seats.remaining).toBe(174);

    const allowance = await billing.currentAllowance(tenantId);
    expect(allowance.limit).toBe(33_000);
    expect(allowance.total).toBe(33_000);
    expect(allowance.remaining).toBe(33_000);
  });

  test("omitted overrides fall back to what the lead asked for", async () => {
    const lead = await newLead({ seats: 40, monthlyEnvelopes: 5_000 });
    const { body } = await convert(lead.id, { planCode: "ENTERPRISE" });
    const tenantId = String(body.tenantId);

    const sub = await db.subscription.findFirst({ where: { tenantId } });
    expect(sub?.seatLimitOverride).toBe(40);
    expect(sub?.envelopeLimitOverride).toBe(5_000);
    // No price was negotiated, so the catalogue rate stands.
    expect(sub?.monthlyEurOverride).toBeNull();

    expect((await billing.seatCapacity(tenantId)).seatLimit).toBe(40);
  });

  test("a lead with no numbers falls all the way back to the plan catalogue", async () => {
    const lead = await newLead({ seats: 0, monthlyEnvelopes: 0 });
    const { body } = await convert(lead.id, { planCode: "ENTERPRISE" });
    const tenantId = String(body.tenantId);

    const sub = await db.subscription.findFirst({ where: { tenantId } });
    expect(sub?.seatLimitOverride).toBeNull();
    expect(sub?.envelopeLimitOverride).toBeNull();

    const catalogue = planDef("ENTERPRISE");
    expect((await billing.seatCapacity(tenantId)).seatLimit).toBe(catalogue.seatLimit);
  });

  test("converting twice is a no-op, not a second tenant", async () => {
    const lead = await newLead();
    const first = await convert(lead.id, { planCode: "ENTERPRISE" });
    const second = await convert(lead.id, { planCode: "ENTERPRISE" });

    expect(second.body.alreadyConverted).toBe(true);
    expect(second.body.tenantId).toBe(first.body.tenantId);
    expect(await db.tenant.count({ where: { name: lead.company } })).toBe(1);
    expect(await db.subscription.count({ where: { tenantId: String(first.body.tenantId) } })).toBe(1);

    const stored = await db.enterpriseLead.findUnique({ where: { id: lead.id } });
    expect(stored?.convertedTenantId).toBe(String(first.body.tenantId));
    expect(stored?.convertedAt).toBeTruthy();
  });

  test("concurrent converts never mint a second tenant", async () => {
    const lead = await newLead();
    // SQLite takes one writer at a time and Prisma expires an interactive
    // transaction after 5s, so under three simultaneous converts the outcomes
    // CI actually produces range from one winner to all three timing out. Two
    // earlier versions of this test asserted an outcome — "exactly one" — and
    // failed on the runner twice, once with 3 (Windows, no contention) and
    // once with 0 (Linux, everything rolled back).
    //
    // The guarantee is an invariant, not an outcome: the compare-and-set claim
    // means a second tenant is never committed. Assert that, and assert the
    // state is consistent whichever way the database resolves it.
    await Promise.allSettled([
      convert(lead.id, { planCode: "ENTERPRISE" }),
      convert(lead.id, { planCode: "ENTERPRISE" }),
      convert(lead.id, { planCode: "ENTERPRISE" }),
    ]);

    const tenants = await db.tenant.findMany({ where: { name: lead.company } });
    // The whole point. Without the claim, each caller commits its own.
    expect(tenants.length).toBeLessThanOrEqual(1);

    const stored = await db.enterpriseLead.findUnique({ where: { id: lead.id } });
    if (tenants.length === 1) {
      // A winner: the lead points at exactly that tenant, with one subscription.
      expect(stored?.convertedTenantId).toBe(tenants[0].id);
      expect(stored?.convertedAt).toBeTruthy();
      expect(await db.subscription.count({ where: { tenantId: tenants[0].id } })).toBe(1);
    } else {
      // Everyone lost the write lock. Nothing may be half-done: no tenant means
      // the lead was never claimed either.
      expect(stored?.convertedTenantId).toBeNull();
      expect(stored?.convertedAt).toBeNull();
    }
  }, 60_000);

  test("the workspace billing surface reports the negotiated seats, not the catalogue", async () => {
    // Entitlements have two sources: PLAN_CATALOG in src/lib/plans.ts (what
    // planDef reads) and the Plan database rows the settings payload carries.
    // The overrides hang off the billing layer, so this pins which number the
    // UI meter actually receives — settings-billing.tsx renders seats.limit,
    // not plan.seatLimit.
    // The Plan rows are the other source of truth; this scratch database has
    // none, so mirror the catalogue into one the way a real deployment does.
    const businessPlan = planDef("BUSINESS");
    await db.plan.upsert({
      where: { code: "BUSINESS" },
      update: {},
      create: {
        code: "BUSINESS",
        name: businessPlan.name,
        monthlyEur: businessPlan.monthlyEur,
        seatLimit: businessPlan.seatLimit,
        envelopeLimit: businessPlan.envelopeLimit,
        storageGb: businessPlan.storageGb,
        apiAccess: businessPlan.apiAccess,
        support: businessPlan.support,
        features: businessPlan.features.join("|"),
      },
    });

    const lead = await newLead();
    const { body } = await convert(lead.id, { planCode: "BUSINESS", seatLimitOverride: 175 });
    const tenantId = String(body.tenantId);

    const owner = await db.user.create({
      data: {
        email: `${unique()}-owner@example.test`,
        firstName: "Neg",
        lastName: "Otiated",
        passwordHash: "unused",
        activeTenantId: tenantId,
      },
    });
    await db.member.create({ data: { userId: owner.id, tenantId, role: "OWNER", status: "ACTIVE" } });
    const ownerSession = await db.session.create({
      data: { userId: owner.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    const me = (await resolveSessionUser(ownerSession.id))!;

    const res = await getSettingsSection("settings", me);
    const payload = (await res.json()) as {
      seats: { limit: number };
      plan: { seatLimit: number } | null;
    };

    // What the meter renders: the contracted number.
    expect(payload.seats.limit).toBe(175);
    // The Plan row alongside it still carries the catalogue number. Pinned so
    // that surfacing plan.seatLimit to a user is a deliberate decision, not an
    // accident — resolving the two sources is a separate change.
    expect(payload.plan?.seatLimit).toBe(planDef("BUSINESS").seatLimit);
    expect(payload.plan?.seatLimit).not.toBe(175);
  });

  test("admin lead search folds case, and the folded columns are populated", async () => {
    // PostgreSQL LIKE is case-sensitive and SQLite's is not, so matching the
    // lowercased query against the raw company column found rows on SQLite and
    // silently returned nothing on PostgreSQL. The folded columns are what
    // makes it provider-agnostic; if the write path stops populating them the
    // search breaks on BOTH, which is what this pins.
    const lead = await db.enterpriseLead.create({
      data: {
        company: "Groupe Médical Sainte-Thérèse",
        contactName: "Éloïse Beaumont",
        companyLower: foldForSearch("Groupe Médical Sainte-Thérèse"),
        contactNameLower: foldForSearch("Éloïse Beaumont"),
        email: `${unique()}@example.test`,
        status: "NEW",
      },
    });

    // Folding lowercases and strips accents.
    expect(lead.companyLower).toBe("groupe medical sainte-therese");
    expect(lead.contactNameLower).toBe("eloise beaumont");

    const search = async (q: string) => {
      const res = await adminRoute.GET(
        new NextRequest(`http://127.0.0.1:3000/api/admin/leads?q=${encodeURIComponent(q)}`),
        ctx,
      );
      const body = (await res.json()) as { leads: { id: string }[] };
      return body.leads.some((l) => l.id === lead.id);
    };

    // Lowercase, original case and an unaccented spelling all find it.
    expect(await search("groupe medical")).toBe(true);
    expect(await search("Groupe Médical")).toBe(true);
    expect(await search("SAINTE-THERESE")).toBe(true);
    expect(await search("eloise")).toBe(true);
    // And a term that genuinely does not match still does not.
    expect(await search("definitely-not-present")).toBe(false);
  });

  test("an unknown plan is refused before anything is created", async () => {
    const lead = await newLead();
    const { body } = await convert(lead.id, { planCode: "PLATINUM" });
    expect(String(body.error)).toMatch(/Invalid plan/);
    expect(await db.tenant.count({ where: { name: lead.company } })).toBe(0);
    const stored = await db.enterpriseLead.findUnique({ where: { id: lead.id } });
    expect(stored?.convertedTenantId).toBeNull();
  });
});
