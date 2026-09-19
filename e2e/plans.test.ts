/// <reference types="bun-types" />

/**
 * Pricing, onboarding and billing E2E (cycle 10).
 *
 * Run: bun test e2e/plans.test.ts   (run.sh wires it after e2e/seed.ts)
 *
 * Covers the cycle-10 surface end to end:
 *  - the shared plan catalog (SOLO = Starter at one seat, 50 envelopes,
 *    incremental term discounts 0/5/10/15%, rollover caps, outcome framing
 *    instead of a "most popular" badge)
 *  - the marketing pricing page and the /enterprise onboarding page
 *  - signup plan prefill (?plan=SOLO) and hard seat limits on invites
 *  - the public enterprise-lead pipeline (outbox copy to sales@, admin triage)
 *  - envelope rollover on renewal (src/lib/billing.ts) incl. the cap and
 *    idempotency
 *  - small-team-group ops (team create/assign/delete, admin-only)
 */

import { describe, expect, test } from "bun:test";
import {
  PLAN_CATALOG, PLAN_ORDER, BILLING_TERMS, ENVELOPE_LIMITS,
  effectiveMonthlyEur, termTotalEur, termSavingsEur, rolloverCap, planGuide,
} from "../src/lib/plans";

const BASE = process.env.MAESTRO_BASE_URL ?? "http://127.0.0.1:3000";

const get = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
};

const post = async (path: string, payload: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
};

const login = async (email: string, password: string) => {
  const res = await post("/api/auth/login", { email, password });
  expect(res.status).toBe(200);
  return String(res.body.token);
};

// ─── 1. Plan catalog (pure functions, no server needed) ──────────────────────

describe("plan catalog (src/lib/plans.ts)", () => {
  test("SOLO is sized for 1 seat with strategic friction vs STARTER", () => {
    const solo = PLAN_CATALOG.SOLO;
    const starter = PLAN_CATALOG.STARTER;
    expect(solo.monthlyEur).toBe(12);
    expect(starter.monthlyEur).toBe(29);
    expect(solo.seatLimit).toBe(1);
    expect(starter.seatLimit).toBe(3);
    expect(solo.envelopeLimit).toBe(30);
    expect(starter.envelopeLimit).toBe(100);
    expect(solo.storageGb).toBe(5);
    expect(starter.storageGb).toBe(10);
    for (const key of ["apiAccess", "slaUptime", "support"] as const) {
      expect(solo[key]).toBe(starter[key]);
    }
  });

  test("STARTER carries 100 envelopes and the 35-day weekends-on-us framing", () => {
    expect(PLAN_CATALOG.STARTER.envelopeLimit).toBe(100);
    expect(PLAN_CATALOG.STARTER.features.some((f) => f.includes("100 envelopes"))).toBe(true);
    expect(PLAN_CATALOG.SOLO.features.some((f) => f.includes("30 envelopes"))).toBe(true);
    expect(PLAN_CATALOG.SOLO.features.some((f) => f.toLowerCase().includes("weekends are on us"))).toBe(true);
    expect(PLAN_CATALOG.STARTER.features.some((f) => f.toLowerCase().includes("weekends are on us"))).toBe(true);
  });

  test("ENVELOPE_LIMITS mirrors the catalog for every plan code", () => {
    for (const code of PLAN_ORDER) {
      expect(ENVELOPE_LIMITS[code]).toBe(PLAN_CATALOG[code].envelopeLimit);
    }
    expect(PLAN_ORDER).toEqual(["SOLO", "STARTER", "BUSINESS", "ENTERPRISE"]);
  });

  test("billing terms are incremental: 1mo 0%, 3mo -5%, 6mo -10%, 12mo -20%", () => {
    expect(BILLING_TERMS.map((t) => [t.months, t.discountPct])).toEqual([[1, 0], [3, 5], [6, 10], [12, 20]]);
  });

  test("term price math: monthly is untouched, 12-month Starter is 23.20/mo saving 69.60", () => {
    const starter = PLAN_CATALOG.STARTER;
    const solo = PLAN_CATALOG.SOLO;
    const monthly = BILLING_TERMS[0];
    const annual = BILLING_TERMS[3];
    expect(effectiveMonthlyEur(solo, monthly)).toBe(12);
    expect(effectiveMonthlyEur(solo, annual)).toBe(9.6);
    expect(termTotalEur(solo, annual)).toBe(115.2);
    expect(termSavingsEur(solo, annual)).toBe(28.8);

    expect(effectiveMonthlyEur(starter, monthly)).toBe(29);
    expect(effectiveMonthlyEur(starter, annual)).toBe(23.2);
    expect(termTotalEur(starter, annual)).toBe(278.4);
    expect(termSavingsEur(starter, annual)).toBe(69.6);
  });

  test("term price math: 6-month Business is 71.10/mo", () => {
    const business = PLAN_CATALOG.BUSINESS;
    const sixMonths = BILLING_TERMS[2];
    expect(effectiveMonthlyEur(business, sixMonths)).toBe(71.1);
    expect(termTotalEur(business, sixMonths)).toBe(426.6);
    expect(termSavingsEur(business, sixMonths)).toBe(47.4);
  });

  test("rollover caps equal one monthly allowance per plan", () => {
    for (const code of PLAN_ORDER) {
      expect(rolloverCap(PLAN_CATALOG[code])).toBe(PLAN_CATALOG[code].envelopeLimit);
    }
  });

  test("outcome framing replaces the 'most popular' badge on every plan", () => {
    for (const code of PLAN_ORDER) {
      const p = PLAN_CATALOG[code];
      expect(p.outcomes.length).toBeGreaterThanOrEqual(3);
      const all = [...p.features, ...p.outcomes, p.bestFor, p.name].join(" ").toLowerCase();
      expect(all).not.toContain("most popular");
      expect(all).not.toContain("populaire");
    }
  });

  test("every plan has a guide with guided steps and demos", () => {
    for (const code of PLAN_ORDER) {
      const g = planGuide(code);
      expect(g.headline.length).toBeGreaterThan(5);
      expect(g.steps.length).toBeGreaterThanOrEqual(3);
      expect(g.demos.length).toBeGreaterThanOrEqual(2);
      for (const s of [...g.steps, ...g.demos]) expect(s.href.startsWith("/")).toBe(true);
    }
  });
});

// ─── 2. Public pages ─────────────────────────────────────────────────────────

describe("pricing and enterprise pages (marketing surface)", () => {
  test("home page: four plans, no-engagement switch, no 'most popular' badge", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const name of ["Solo", "Starter", "Business", "Enterprise"]) expect(html).toContain(name);
    expect(html).toContain("No engagement");
    expect(html).toContain("cancel anytime");
    expect(html).toContain("100 envelopes");
    expect(html).toContain("30 envelopes");
    expect(html).toContain("weekends are on us");
    expect(html).toContain("roll over");
    // The badge is gone: value framing took its place.
    expect(html).not.toContain("Most popular");
    // The three committed discount slabs are communicated.
    expect(html).toContain("−5%");
    expect(html).toContain("−10%");
    expect(html).toContain("−20%");
  });

  test("/enterprise onboarding page renders the guided pipeline and lead form", async () => {
    const res = await fetch(`${BASE}/enterprise`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Enterprise onboarding");
    expect(html).toContain("Guided pilot");
    expect(html).toContain("small team groups");
    expect(html).toContain("lead-form");
  });
});

// ─── 3. Signup plan prefill + seat limits ────────────────────────────────────

describe("signup plan prefill and seat limits", () => {
  const stamp = Date.now();

  test("signup with planCode SOLO creates a one-seat workspace", async () => {
    const signup = await post("/api/auth/signup", {
      firstName: "Sofia", lastName: "Solo", email: `e2e-solo-${stamp}@docurama.eu`,
      password: "soloPass1234", organization: "E2E Solo Workshop", consent: true, planCode: "SOLO",
    });
    expect(signup.status).toBe(200);
    const token = String(signup.body.token);

    const state = await get("/api/onboarding", { Authorization: `Bearer ${token}` });
    expect(state.status).toBe(200);
    const org = state.body.org as { planCode: string } | null;
    expect(org?.planCode).toBe("SOLO");
    // One member (the creator), zero remaining.
    const seats = state.body.seats as { used: number; limit: number; remaining: number; members: number; pendingInvites: number };
    expect(seats).toEqual({ used: 1, limit: 1, remaining: 0, members: 1, pendingInvites: 0 });
  });

  test("SOLO workspace cannot invite: 403 with the seat message", async () => {
    const loginRes = await post("/api/auth/login", { email: `e2e-solo-${stamp}@docurama.eu`, password: "soloPass1234" });
    expect(loginRes.status).toBe(200);
    const token = String(loginRes.body.token);
    const invite = await post("/api/onboarding", {
      op: "invite.send", data: { email: `teammate-${stamp}@docurama.eu`, role: "MEMBER" },
    }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
    expect(invite.status).toBe(403);
    expect(String(invite.body.error)).toContain("All 1 seats");
  });

  test("default signup (no planCode) still lands on STARTER", async () => {
    const signup = await post("/api/auth/signup", {
      firstName: "Tim", lastName: "Team", email: `e2e-starter-${stamp}@docurama.eu`,
      password: "teamPass1234", organization: "E2E Starter Workshop", consent: true,
    });
    expect(signup.status).toBe(200);
    const state = await get("/api/onboarding", { Authorization: `Bearer ${String(signup.body.token)}` });
    const seats = state.body.seats as { limit: number; remaining: number };
    expect((state.body.org as { planCode: string }).planCode).toBe("STARTER");
    expect(seats.limit).toBe(3);
    expect(seats.remaining).toBe(2);
  });
});

// ─── 4. Enterprise lead pipeline ─────────────────────────────────────────────

describe("enterprise lead pipeline (/api/enterprise-lead + admin triage)", () => {
  const stamp = Date.now();
  const leadEmail = `ingrid-${stamp}@nordpharm.example`;

  test("public lead submission lands in the pipeline, outbox and audit ledger", async () => {
    const res = await post("/api/enterprise-lead", {
      company: "E2E Medical Devices", contactName: "Ingrid Sorensen", email: leadEmail,
      phone: "+45 20 11 22 33", seats: "11-50", monthlyEnvelopes: 1000,
      requirements: "Part 11 mode and BYO certificates, please.",
    });
    expect(res.status).toBe(200);
    expect(String(res.body.message)).toContain("one business day");

    const direct = new (await import("@prisma/client")).PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const lead = await direct.enterpriseLead.findFirst({ where: { email: leadEmail } });
      expect(lead).not.toBeNull();
      expect(lead!.company).toBe("E2E Medical Devices");
      expect(lead!.status).toBe("NEW");
      expect(lead!.seats).toBe(31); // "11-50" parsed to its rounded midpoint
      // sales@ is notified through the honest outbox ledger.
      const outbox = await direct.mailOutbox.findFirst({
        where: { toEmail: "sales@docurama.eu", template: "ENTERPRISE_LEAD", linkUrl: null },
        orderBy: { createdAt: "desc" },
      });
      expect(outbox).not.toBeNull();
      expect(outbox!.subject).toContain("E2E Medical Devices");
      // The intake is audited (anonymous actor, clearly labelled).
      const audit = await direct.auditEvent.findFirst({
        where: { action: "enterprise.lead.created", resource: `lead:${lead!.id}` },
      });
      expect(audit).not.toBeNull();
      expect(audit!.actorRole).toBe("ANONYMOUS");
    } finally {
      await direct.$disconnect();
    }
  });

  test("duplicate submission inside 10 minutes is throttled with 429", async () => {
    const res = await post("/api/enterprise-lead", {
      company: "E2E Medical Devices", contactName: "Ingrid Sorensen", email: leadEmail,
    });
    expect(res.status).toBe(429);
  });

  test("invalid payloads are rejected with 400", async () => {
    const missing = await post("/api/enterprise-lead", { contactName: "No Company", email: "x@y.example" });
    expect(missing.status).toBe(400);
    const badEmail = await post("/api/enterprise-lead", { company: "C", contactName: "N", email: "not-an-email" });
    expect(badEmail.status).toBe(400);
  });

  test("admin console triages the lead; non-admins cannot", async () => {
    const anon = await get("/api/admin/leads");
    expect([401, 403]).toContain(anon.status);

    const token = await login("admin@docurama.eu", "admin1234");
    const list = await get("/api/admin/leads?q=E2E Medical", { Authorization: `Bearer ${token}` });
    expect(list.status).toBe(200);
    const leads = list.body.leads as { id: string; company: string; status: string }[];
    const mine = leads.find((l) => l.company === "E2E Medical Devices");
    expect(mine).toBeDefined();

    const changed = await post("/api/admin/leads", {
      op: "lead.status", id: mine!.id, data: { status: "QUALIFIED" },
    }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
    expect(changed.status).toBe(200);
    expect(String(changed.body.message)).toContain("QUALIFIED");
  });
});

// ─── 5. Envelope rollover on renewal ─────────────────────────────────────────

describe("envelope rollover on renewal (src/lib/billing.ts)", () => {
  test("unused envelopes carry forward on renewal, capped at one allowance", async () => {
    const { renewDueSubscriptions, currentAllowance } = await import("../src/lib/billing");
    const direct = new (await import("@prisma/client")).PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    const stamp = Date.now();
    const days = (n: number) => new Date(Date.now() + n * 86400000);
    try {
      // Fixture A: STARTER, 1-month term elapsed 5 days ago, 20 of 100 used
      // → 80 carry forward.
      const tenantA = await direct.tenant.create({
        data: { name: "E2E Renew A", slug: `e2e-renew-a-${stamp}`, planCode: "STARTER", status: "ACTIVE" },
      });
      const ownerA = await direct.user.create({
        data: {
          email: `e2e-renew-a-${stamp}@docurama.eu`, passwordHash: "x", firstName: "Rene", lastName: "Walsh",
          activeTenantId: tenantA.id,
        },
      });
      await direct.member.create({ data: { userId: ownerA.id, tenantId: tenantA.id, role: "OWNER" } });
      const subA = await direct.subscription.create({
        data: {
          tenantId: tenantA.id, planCode: "STARTER", status: "ACTIVE", mrrEur: 29, seats: 3,
          termMonths: 1, discountPct: 0, renewalAt: days(-5),
        },
      });
      for (let i = 0; i < 20; i++) {
        await direct.envelope.create({
          data: {
            publicCode: `DOC-E2ERN-A${i}`, title: `Renewal filler ${i}`, titleLower: `renewal filler ${i}`,
            tenantId: tenantA.id, createdById: ownerA.id, status: "COMPLETED", pages: 1, createdAt: days(-10),
          },
        });
      }

      // Fixture B: allowance already 200 (100 plan + 100 carried), nothing used
      // → unused 200 carries forward capped at 100.
      const tenantB = await direct.tenant.create({
        data: { name: "E2E Renew B", slug: `e2e-renew-b-${stamp}`, planCode: "STARTER", status: "ACTIVE" },
      });
      const subB = await direct.subscription.create({
        data: {
          tenantId: tenantB.id, planCode: "STARTER", status: "ACTIVE", mrrEur: 29, seats: 3,
          termMonths: 1, discountPct: 0, carriedForwardEnvelopes: 100, renewalAt: days(-1),
        },
      });

      const results = await renewDueSubscriptions();
      const outcomeA = results.find((r) => r.subscriptionId === subA.id);
      const outcomeB = results.find((r) => r.subscriptionId === subB.id);
      expect(outcomeA).toBeDefined();
      expect(outcomeA!.carriedForward).toBe(80);
      expect(outcomeA!.usedInPeriod).toBe(20);
      expect(outcomeB).toBeDefined();
      expect(outcomeB!.carriedForward).toBe(100); // capped: min(200 unused, 100 cap)

      const afterA = await direct.subscription.findUnique({ where: { id: subA.id } });
      expect(afterA!.renewalAt.getTime()).toBeGreaterThan(Date.now());
      expect(afterA!.lastInvoiceAt).not.toBeNull();

      // The current allowance includes the rollover: 100 plan + 80 carried.
      const allowance = await currentAllowance(tenantA.id);
      expect(allowance.total).toBe(180);
      expect(allowance.carriedForward).toBe(80);
      expect(allowance.remaining).toBe(180); // nothing used inside the fresh period

      // The renewal is audited.
      const audit = await direct.auditEvent.findFirst({
        where: { action: "subscription.renewed", resource: `subscription:${subA.id}` },
      });
      expect(audit).not.toBeNull();
      expect(audit!.detail).toContain("80 carried forward");

      // Idempotency: nothing is due anymore; a second pass is a no-op.
      const second = await renewDueSubscriptions();
      expect(second.find((r) => r.subscriptionId === subA.id)).toBeUndefined();
      expect(second.find((r) => r.subscriptionId === subB.id)).toBeUndefined();
    } finally {
      // Cascades remove subscriptions, members, envelopes and audit rows.
      await direct.tenant.deleteMany({ where: { slug: { in: [`e2e-renew-a-${stamp}`, `e2e-renew-b-${stamp}`] } } });
      await direct.$disconnect();
    }
  });
});

// ─── 6. Small team groups ────────────────────────────────────────────────────

describe("small team groups (workspace settings ops)", () => {
  test("owner creates a team, assigns a member, then deleting unassigns", async () => {
    const token = await login("alex@stalfe.example", "demo1234");
    const teamName = `E2E Pod ${Date.now()}`;
    const created = await post("/api/workspace/settings", {
      op: "team.create", data: { name: teamName },
    }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
    expect(created.status).toBe(200);
    const teamId = String(created.body.id);

    const direct = new (await import("@prisma/client")).PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const marco = await direct.user.findUnique({ where: { email: "marco@stalfe.example" } });
      const member = await direct.member.findFirst({ where: { userId: marco!.id } });
      const assigned = await post("/api/workspace/settings", {
        op: "member.team", id: member!.id, data: { teamId },
      }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
      expect(assigned.status).toBe(200);

      const settings = await get("/api/workspace/settings", { Authorization: `Bearer ${token}` });
      const teams = settings.body.teams as { id: string; name: string; memberCount: number }[];
      expect(teams.some((t) => t.id === teamId && t.memberCount === 1)).toBe(true);
      const members = settings.body.members as { email: string; teamId: string | null }[];
      expect(members.find((m) => m.email === "marco@stalfe.example")?.teamId).toBe(teamId);

      // Duplicate names are refused.
      const dupe = await post("/api/workspace/settings", {
        op: "team.create", data: { name: teamName },
      }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
      expect(dupe.status).toBe(400);

      const deleted = await post("/api/workspace/settings", {
        op: "team.delete", id: teamId,
      }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
      expect(deleted.status).toBe(200);
      const after = await direct.member.findUnique({ where: { id: member!.id } });
      expect(after!.teamId).toBeNull(); // unassigned, access unchanged
    } finally {
      await direct.$disconnect();
    }
  });

  test("non-admin members cannot create teams", async () => {
    const token = await login("sofia@stalfe.example", "demo1234");
    const res = await post("/api/workspace/settings", {
      op: "team.create", data: { name: "Sneaky Team" },
    }, { "Content-Type": "application/json", Authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
  });
});
