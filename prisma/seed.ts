/* Docurama portal seed · realistic demo dataset */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { foldForSearch } from "../src/lib/search";

const db = new PrismaClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const d = (days: number, h = 0) => new Date(Date.now() - days * 86400000 + h * 3600000);
const dFuture = (days: number) => new Date(Date.now() + days * 86400000);

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

async function main() {
  console.log("Clearing existing data…");
  await Promise.all([
    db.user.deleteMany(), db.tenant.deleteMany(), db.plan.deleteMany(),
    db.enterpriseLead.deleteMany(),
    db.control.deleteMany(), db.retentionPolicy.deleteMany(), db.consent.deleteMany(),
    db.incident.deleteMany(), db.accessReview.deleteMany(), db.risk.deleteMany(),
    db.change.deleteMany(), db.vendor.deleteMany(), db.restoreDrill.deleteMany(),
    db.subprocessor.deleteMany(), db.dsarRequest.deleteMany(), db.dmcaNotice.deleteMany(),
    db.auditEvent.deleteMany(), db.securityEvent.deleteMany(), db.dailyStat.deleteMany(),
    db.platformSetting.deleteMany(),
  ]);

  // ── Plans ──────────────────────────────────────────────────────────────
  // Mirrors src/lib/plans.ts PLAN_CATALOG (cycle 10): SOLO added (Starter
  // feature set at one seat), STARTER envelopes 25 → 50 with the 35-day
  // weekends-on-us framing, outcome bullets on every plan.
  await db.plan.createMany({
    data: [
      { code: "SOLO", name: "Solo", monthlyEur: 12, seatLimit: 1, envelopeLimit: 30, storageGb: 5, apiAccess: false, slaUptime: "99.5%", support: "Email support", features: "1 seat|30 envelopes/month|35 sending days a month — weekends on us|Envelope rollover on renewal (up to 30)|PAdES B-B sealing|Email signing|Public verify portal|2 templates", outcomes: "Sign client contracts yourself without paying for team seats you don't need|Keep every unused envelope — a quiet month is never a lost month|Look professional from day one with branded signing pages and public verification" },
      { code: "STARTER", name: "Starter", monthlyEur: 29, seatLimit: 3, envelopeLimit: 100, storageGb: 10, apiAccess: false, slaUptime: "99.5%", support: "Email support", features: "3 seats|100 envelopes/month|35 sending days a month — weekends on us|Envelope rollover on renewal (up to 100)|PAdES B-B sealing|Email signing|Public verify portal|5 templates", outcomes: "Get your first contracts signed this week, as a team|Scale up seamlessly with 100 envelopes and rollover on renewal|Give clients a verifiable, EU-compliant signing experience without IT help" },
      { code: "BUSINESS", name: "Business", monthlyEur: 79, seatLimit: 10, envelopeLimit: 250, storageGb: 50, apiAccess: true, slaUptime: "99.9%", support: "Priority email support", features: "10 seats|250 envelopes/month (rollover on renewal, up to 250)|PAdES B-LT sealing|SMS + WhatsApp delivery|API + webhooks|Unlimited templates|DNS domain attestation", outcomes: "Run your whole contract operation in one place|Automate signing into your own tools with the REST API and webhooks|Send from your own verified domain so invitations carry your brand" },
      { code: "ENTERPRISE", name: "Enterprise", monthlyEur: 349, seatLimit: 100, envelopeLimit: 5000, storageGb: 500, apiAccess: true, slaUptime: "99.99%", support: "24/7 support + TAM", features: "100 seats|5000 envelopes/month (rollover on renewal, up to 5000)|PAdES B-LTA sealing|BYO certificate|SSO/SAML|21 CFR Part 11 mode|Audit chain exports|Custom retention|Legal hold workflows", outcomes: "Pass audits — every signature manifests who signed, when and what it means|Keep counsel happy with legal holds, retention policies and evidence packs|Bring your own certificates and SSO, on EU infrastructure" },
    ],
  });

  // ── Tenants ────────────────────────────────────────────────────────────
  const tenantsData = [
    { name: "StålFe", slug: "stalfe", plan: "ENTERPRISE", status: "ACTIVE", storage: 214_800 },
    { name: "Aurora Legal LLP", slug: "aurora-legal", plan: "BUSINESS", status: "ACTIVE", storage: 18_200 },
    { name: "Helios Energy Group", slug: "helios-energy", plan: "ENTERPRISE", status: "ACTIVE", storage: 331_000 },
    { name: "Bayern Immobilien AG", slug: "bayern-immo", plan: "BUSINESS", status: "ACTIVE", storage: 24_600 },
    { name: "Meteora Health Clinics", slug: "meteora-health", plan: "BUSINESS", status: "TRIAL", storage: 2_400 },
    { name: "Solstice Media Ltd", slug: "solstice-media", plan: "STARTER", status: "ACTIVE", storage: 610 },
    { name: "Corvus Manufacturing", slug: "corvus-mfg", plan: "ENTERPRISE", status: "SUSPENDED", storage: 158_000, suspendedReason: "Invoice overdue 60+ days (INV-20841)" },
    { name: "Lumen Research Institute", slug: "lumen-research", plan: "STARTER", status: "TRIAL", storage: 980 },
    { name: "Atlas Freight Systems", slug: "atlas-freight", plan: "BUSINESS", status: "ACTIVE", storage: 41_300 },
    { name: "Verdant Agriculture", slug: "verdant-agri", plan: "STARTER", status: "ACTIVE", storage: 1_850 },
    { name: "Lefebvre Consulting", slug: "lefebvre-consulting", plan: "SOLO", status: "ACTIVE", storage: 320 },
  ];
  const tenants: Record<string, string> = {};
  for (const t of tenantsData) {
    const rec = await db.tenant.create({
      data: {
        name: t.name, slug: t.slug, planCode: t.plan, status: t.status,
        storageUsedMb: t.storage, suspendedReason: t.suspendedReason ?? null,
        createdAt: d(40 + Math.random() * 300), trialEndsAt: t.status === "TRIAL" ? dFuture(9) : null,
        billingEmail: `billing@${t.slug}.example`,
      },
    });
    tenants[t.slug] = rec.id;
  }

  // ── Users & memberships ────────────────────────────────────────────────
  const usersData = [
    { email: "admin@docurama.eu", first: "Elena", last: "Marchetti", role: "PLATFORM_ADMIN", pw: "admin1234", tenant: null, mrole: null, totp: true },
    { email: "ops@docurama.eu", first: "Jonas", last: "Weber", role: "PLATFORM_ADMIN", pw: "admin1234", tenant: null, mrole: null, totp: true },
    { email: "alex@stalfe.example", first: "Alexandra", last: "Fischer", role: "WORKSPACE_ADMIN", pw: "demo1234", tenant: "stalfe", mrole: "OWNER", totp: true },
    { email: "marco@stalfe.example", first: "Marco", last: "Bianchi", role: "MEMBER", pw: "demo1234", tenant: "stalfe", mrole: "ADMIN", totp: false },
    { email: "sofia@stalfe.example", first: "Sofia", last: "Lindqvist", role: "MEMBER", pw: "demo1234", tenant: "stalfe", mrole: "MEMBER", totp: false },
    { email: "lars@nordjarm.example", first: "Lars", last: "Bergström", role: "MEMBER", pw: "demo1234", tenant: "stalfe", mrole: "MEMBER", totp: false },
    { email: "pietro@aurora-legal.example", first: "Pietro", last: "Rinaldi", role: "WORKSPACE_ADMIN", pw: "demo1234", tenant: "aurora-legal", mrole: "OWNER", totp: true },
    { email: "hannah@helios-energy.example", first: "Hannah", last: "Schulz", role: "WORKSPACE_ADMIN", pw: "demo1234", tenant: "helios-energy", mrole: "OWNER", totp: true },
    { email: "lucas@bayern-immo.example", first: "Lucas", last: "Huber", role: "MEMBER", pw: "demo1234", tenant: "bayern-immo", mrole: "ADMIN", totp: false },
    { email: "amara@meteora-health.example", first: "Amara", last: "Okafor", role: "MEMBER", pw: "demo1234", tenant: "meteora-health", mrole: "OWNER", totp: false },
    { email: "tomas@solstice-media.example", first: "Tomás", last: "Alvarez", role: "MEMBER", pw: "demo1234", tenant: "solstice-media", mrole: "OWNER", totp: false },
    { email: "greta@corvus-mfg.example", first: "Greta", last: "Neumann", role: "MEMBER", pw: "demo1234", tenant: "corvus-mfg", mrole: "OWNER", totp: true },
    { email: "yuki@lumen-research.example", first: "Yuki", last: "Tanaka", role: "MEMBER", pw: "demo1234", tenant: "lumen-research", mrole: "OWNER", totp: false },
    { email: "dmitri@atlas-freight.example", first: "Dmitri", last: "Volkov", role: "MEMBER", pw: "demo1234", tenant: "atlas-freight", mrole: "ADMIN", totp: true },
    { email: "leila@verdant-agri.example", first: "Leila", last: "Haddad", role: "MEMBER", pw: "demo1234", tenant: "verdant-agri", mrole: "OWNER", totp: false },
    { email: "arnaud@lefebvre.example", first: "Arnaud", last: "Lefebvre", role: "MEMBER", pw: "demo1234", tenant: "lefebvre-consulting", mrole: "OWNER", totp: false },
  ];
  const users: Record<string, string> = {};
  for (const u of usersData) {
    const rec = await db.user.create({
      data: {
        email: u.email, passwordHash: sha(u.pw), firstName: u.first, lastName: u.last,
        role: u.role, totpEnabled: u.totp, lastActiveAt: d(Math.random() * 3),
        createdAt: d(30 + Math.random() * 300),
      },
    });
    users[u.email] = rec.id;
    if (u.tenant && u.mrole) {
      await db.member.create({ data: { userId: rec.id, tenantId: tenants[u.tenant], role: u.mrole } });
    }
  }

  // ── Subscriptions ──────────────────────────────────────────────────────
  // Cycle 10: term/discount fields demo the promotional switch (committed
  // 3/6/12-month terms at −5/−10/−15%); rollover fields demo envelope
  // carry-forward on renewal.
  const subData: [string, string, number, number, number, number, number][] = [
    // slug, plan, mrr, seats, termMonths, discountPct, carriedForward
    ["stalfe", "ENTERPRISE", 349, 18, 12, 15, 820],
    ["aurora-legal", "BUSINESS", 79, 7, 6, 10, 140],
    ["helios-energy", "ENTERPRISE", 349, 42, 12, 15, 2100],
    ["bayern-immo", "BUSINESS", 79, 5, 3, 5, 0],
    ["solstice-media", "STARTER", 19, 2, 1, 0, 12],
    ["atlas-freight", "BUSINESS", 79, 9, 6, 10, 60],
    ["verdant-agri", "STARTER", 19, 2, 1, 0, 0],
    ["corvus-mfg", "ENTERPRISE", 349, 24, 12, 15, 0],
    ["lefebvre-consulting", "SOLO", 19, 1, 3, 5, 18],
  ];
  for (const [slug, plan, mrr, seats, termMonths, discountPct, carried] of subData) {
    const failed = slug === "corvus-mfg";
    await db.subscription.create({
      data: {
        tenantId: tenants[slug], planCode: plan, status: failed ? "PAST_DUE" : "ACTIVE",
        mrrEur: mrr, seats, renewalAt: dFuture(10 + (mrr % 17)),
        termMonths, discountPct, carriedForwardEnvelopes: carried,
        lastInvoiceAt: d(12), failedPayment: failed,
      },
    });
  }

  // ── Small team groups (cycle 10) ───────────────────────────────────────
  // StålFe runs Sales / Engineering / Legal groups inside the one workspace.
  const teamDefs: [string, string[]][] = [
    ["stalfe", ["Sales", "Engineering", "Legal"]],
  ];
  for (const [slug, names] of teamDefs) {
    for (const n of names) {
      await db.team.create({ data: { tenantId: tenants[slug], name: n } });
    }
  }
  // Assign StålFe members to their groups (owner stays ungrouped).
  const teamAssign: [string, string][] = [
    ["marco@stalfe.example", "Sales"],
    ["sofia@stalfe.example", "Engineering"],
    ["lars@nordjarm.example", "Legal"],
  ];
  for (const [email, teamName] of teamAssign) {
    const team = await db.team.findFirst({ where: { tenantId: tenants.stalfe, name: teamName } });
    if (team) {
      await db.member.updateMany({
        where: { userId: users[email], tenantId: tenants.stalfe },
        data: { teamId: team.id },
      });
    }
  }

  // ── Enterprise pipeline (cycle 10) ─────────────────────────────────────
  await db.enterpriseLead.createMany({
    data: [
      { company: "Nordpharm Medical Devices", contactName: "Ingrid Sørensen", email: "ingrid@nordpharm.example", phone: "+45 20 11 22 33", seats: 40, monthlyEnvelopes: 1200, requirements: "Medical-device company; needs 21 CFR Part 11 mode, BYO qualified certificates, possible self-hosting later.", status: "CONTACTED", notes: "Call booked Thursday; pilot on NDAs + supplier agreements." },
      { company: "Banque Helvetia Partenaires", contactName: "Élise Rochat", email: "e.rochat@helvetia-p.example", seats: 60, monthlyEnvelopes: 3500, requirements: "SSO/SAML mandatory, audit chain exports quarterly, data residency in EU/Paris confirmed.", status: "NEW" },
      { company: "Voltalis Grid Services", contactName: "Marek Nowak", email: "marek@voltalis-grid.example", seats: 25, monthlyEnvelopes: 800, requirements: "Small team structures per country subsidiary; API integration with their ERP.", status: "QUALIFIED", notes: "Security questionnaire returned; DPA in review with their legal." },
    ],
  });

  // ── Envelopes ──────────────────────────────────────────────────────────
  const envTitles = [
    "EN 10204 3.1 Mill Certificate · S355J2 Plates", "Foundry Partner Qualification · Nordjärm Gjuteri",
    "Welding Procedure WPS-2219 · Qualification Record", "Inspection Certificate 3.2 · Pressure Housings",
    "Purchase Order PO-2026-0417 · Steel Castings", "Supplier Quality Agreement · Gusswerk Rheinland",
    "CE Declaration of Conformity · Gearbox Housings", "NDT Report UT-88 · Ultrasonic Testing",
    "Delivery Note DN-4471 · Port of Hamburg", "Heat Treatment Certificate · Batch HT-912",
    "Mutual NDA · Aurora Legal", "Employment Contract · J. Weber",
    "Freight Terms & Conditions 2026", "Office Lease · Munich Hauptbahnhof",
    "Consultancy Agreement · Q3", "Data Processing Addendum",
    "Settlement Agreement · Case 4711", "NDA · Meteora Clinical Trial",
    "Pilot Agreement · Lumen Study 12", "Insurance Policy Endorsement",
    "Sales Agent Agreement · Iberia", "Transfer of IP · App Suite",
    "Internship Agreement · Winter Cohort", "Master Services Agreement · Helios Energy",
    "SOW #4 · Integration Works", "Severance Agreement · HR-2291",
    "Warehouse Rental · Rotterdam", "Material Substitution Approval · S420N",
  ];
  const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "SENT", "SENT", "PARTIALLY_SIGNED", "PARTIALLY_SIGNED", "DRAFT", "VOIDED", "DECLINED", "EXPIRED", "COMPLETED"];
  const signers = [
    ["Alexandra Fischer", "alex@stalfe.example"], ["Marco Bianchi", "marco@stalfe.example"],
    ["Lars Bergström", "lars@nordjarm.example"], ["Elisa Righi", "elisa@fonderia-padana.example"],
    ["Hannah Schulz", "hannah@helios-energy.example"], ["Pietro Rinaldi", "pietro@aurora-legal.example"],
    ["Dmitri Volkov", "dmitri@atlas-freight.example"], ["Sofia Lindqvist", "sofia@stalfe.example"],
  ];
  const creatorPool = ["alex@stalfe.example", "pietro@aurora-legal.example", "hannah@helios-energy.example", "dmitri@atlas-freight.example", "lucas@bayern-immo.example"];
  // Weighted pool (StålFe twice) with a coprime step so every tenant gets envelopes.
  const tenantPool = ["stalfe", "stalfe", "aurora-legal", "helios-energy", "bayern-immo", "atlas-freight", "meteora-health", "lumen-research", "solstice-media", "verdant-agri"];

  for (let i = 0; i < 64; i++) {
    const slug = pick(tenantPool, i * 3 + 1);
    const status = pick(statuses, i);
    const created = d(1 + (i % 30));
    const done = ["COMPLETED"].includes(status);
    const sealedAt = done ? d((i % 30) + 0.2) : null;
    const code = `DOC-${(824100 + i * 37).toString(36).toUpperCase().padStart(6, "0")}${i}`;
    const envTitle = pick(envTitles, i) + (i >= envTitles.length ? ` (v${Math.floor(i / envTitles.length) + 1})` : "");
    const env = await db.envelope.create({
      data: {
        publicCode: code, title: envTitle, titleLower: foldForSearch(envTitle),
        tenantId: tenants[slug], createdById: users[pick(creatorPool, i)], status,
        message: "Please review and sign at your earliest convenience.",
        pages: 2 + (i % 12), createdAt: created,
        sealedAt, completedAt: sealedAt,
        conformanceLevel: done ? pick(["B-LT", "B-LTA", "B-T"], i) : null,
        sha256: done ? sha(`docurama-seal-${code}`).slice(0, 64) : null,
        voidedAt: status === "VOIDED" ? d(i % 20) : null,
        voidReason: status === "VOIDED" ? "Withdrawn by sender · terms renegotiated" : null,
        lastRemindedAt: status === "SENT" && i % 3 === 0 ? d(0.5) : null,
      },
    });
    // recipients: 1-3
    const nRec = 1 + (i % 3);
    for (let r = 0; r < nRec; r++) {
      const [nm, em] = pick(signers, i + r);
      let rStatus = "PENDING";
      if (status === "COMPLETED") rStatus = "SIGNED";
      else if (status === "PARTIALLY_SIGNED") rStatus = r === 0 ? "SIGNED" : "PENDING";
      else if (status === "DECLINED") rStatus = r === 0 ? "DECLINED" : "PENDING";
      else if (status === "SENT" || status === "DRAFT" || status === "EXPIRED") rStatus = "PENDING";
      else if (status === "VOIDED") rStatus = "PENDING";
      await db.recipient.create({
        data: {
          envelopeId: env.id, name: nm, email: em, order: r + 1, status: rStatus,
          role: r === 1 && nRec === 3 ? "CC" : "SIGNER",
          authMethod: r === 0 && i % 4 === 0 ? "SMS" : "EMAIL",
          signedAt: rStatus === "SIGNED" ? d((i % 30) + 0.1 * (r + 1)) : null,
          accessToken: sha(`sign-token-${env.id}-${r}`),
        },
      });
    }
    // audit events
    const evts: [string, string, number][] = [["CREATED", "Sender", 0], ["SENT", "Docurama", 0.05], ["VIEWED", pick(signers, i)[0], 0.3], ["SIGNED", pick(signers, i)[0], 0.6]];
    if (status !== "DRAFT") {
      for (const [action, actor, off] of evts) {
        if (status === "DRAFT" && action !== "CREATED") continue;
        if (["SENT", "PARTIALLY_SIGNED", "EXPIRED"].includes(status) && action === "SIGNED" && status !== "PARTIALLY_SIGNED") continue;
        await db.envelopeEvent.create({
          data: {
            envelopeId: env.id, actor, action, at: d((i % 30), -off * 24),
            detail: action === "SENT" ? "Signing invitations delivered via SMTP" : action === "SIGNED" ? "Signature applied · PAdES compliant" : null,
            ipHash: sha(`ip-${env.id}-${action}`).slice(0, 12),
          },
        });
      }
      if (status === "COMPLETED") {
        await db.envelopeEvent.create({
          data: { envelopeId: env.id, actor: "Docurama", action: "SEALED", at: sealedAt!, detail: `Sealed with conformance ${pick(["B-LT", "B-LTA", "B-T"], i)} · RFC 3161 timestamp applied`, ipHash: sha(`ip-${env.id}-seal`).slice(0, 12) },
        });
      }
      if (status === "VOIDED") {
        await db.envelopeEvent.create({ data: { envelopeId: env.id, actor: "Sender", action: "VOIDED", at: env.voidedAt!, detail: env.voidReason } });
      }
    }
  }

  // ── Templates ──────────────────────────────────────────────────────────
  const tplData: [string, string, string, number][] = [
    ["Mill Certificate 3.1 (EN 10204)", "Material test certificate per EN 10204 type 3.1", "Quality", 2],
    ["Foundry Partner Qualification", "Supplier audit and qualification record for foundry partners", "Compliance", 6],
    ["Mutual NDA (Standard)", "Two-way confidentiality agreement with EU governing law", "Legal", 4],
    ["Employment Contract (DE)", "German employment contract with probation clause", "HR", 8],
    ["Master Services Agreement", "Core MSA with SLA schedules", "Legal", 12],
    ["Data Processing Addendum", "GDPR Art. 28 processor terms", "Compliance", 6],
    ["Freight Service Terms", "Logistics terms & conditions 2026", "Operations", 5],
    ["Consultant Agreement", "Independent contractor terms", "HR", 5],
  ];
  for (const [name, desc, cat, pages] of tplData) {
    for (const slug of ["stalfe", "aurora-legal", "helios-energy"]) {
      await db.template.create({
        data: {
          tenantId: tenants[slug], name, nameLower: foldForSearch(name), description: desc, category: cat, pages,
          usageCount: Math.floor(Math.random() * 40), lastUsedAt: d(Math.random() * 20),
          publicSlug: `t-${sha(name + slug).slice(0, 10)}`,
        },
      });
    }
  }

  // ── Domains ────────────────────────────────────────────────────────────
  const domData: [string, string, string, string][] = [
    ["stalfe", "stalfe.com", "TXT", "VERIFIED"],
    ["aurora-legal", "auroralegal.co.uk", "CNAME", "VERIFIED"],
    ["helios-energy", "helios-energy.de", "TXT", "VERIFIED"],
    ["bayern-immo", "bayern-immo.de", "HTTP", "PENDING"],
    ["atlas-freight", "atlasfreight.io", "TXT", "FAILED"],
    ["meteora-health", "meteoraclinics.example", "CNAME", "PENDING"],
    ["verdant-agri", "verdant.example", "TXT", "JOIN_REQUESTED"],
    ["lumen-research", "lumen-research.example", "HTTP", "JOIN_REQUESTED"],
  ];
  for (const [slug, domain, method, status] of domData) {
    await db.domain.create({
      data: {
        tenantId: tenants[slug], domain, method, status,
        token: `docu-verify-${sha(domain).slice(0, 16)}`,
        verifiedAt: status === "VERIFIED" ? d(10) : null, requestedAt: d(12),
      },
    });
  }

  // ── DSAR + DMCA ────────────────────────────────────────────────────────
  const dsarData: [string, string, string, string][] = [
    ["ACCESS", "data.subject@helios-energy.example", "RUNNING", "stalfe"],
    ["ERASURE", "former.employee@aurora-legal.example", "OPEN", "aurora-legal"],
    ["PORTABILITY", "client@atlas-freight.example", "COMPLETED", "atlas-freight"],
    ["RECTIFICATION", "member@meteora-health.example", "OPEN", "meteora-health"],
  ];
  for (const [type, email, status, slug] of dsarData) {
    await db.dsarRequest.create({
      data: {
        tenantId: tenants[slug], type, subjectEmail: email, status,
        requestedAt: d(10), dueAt: dFuture(20), notes: "Submitted via privacy portal.",
        completedAt: status === "COMPLETED" ? d(2) : null,
      },
    });
  }
  const dmcaData: [string, string, string, string, string][] = [
    ["rights@mediawatch.example", "https://verify.docurama.eu/d/pirated-content-01", "Published commercial photography series", "OPEN", "HIGH"],
    ["legal@pubhouse.example", "https://verify.docurama.eu/d/excerpt-ebook-77", "Chapter excerpts from copyrighted ebook", "OPEN", "NORMAL"],
    ["dmca@stockphotos.example", "https://verify.docurama.eu/d/stock-image-pack", "Licensed stock imagery redistribution", "RESOLVED", "NORMAL"],
  ];
  for (const [complainant, url, works, status, severity] of dmcaData) {
    await db.dmcaNotice.create({
      data: {
        complainant, targetUrl: url, works, status, severity,
        receivedAt: d(3), slaDueAt: dFuture(7),
        resolvedAt: status === "RESOLVED" ? d(1) : null,
        resolutionNote: status === "RESOLVED" ? "Document disabled and signer notified; repeat-offender flag applied to workspace." : null,
      },
    });
  }

  // ── Compliance ─────────────────────────────────────────────────────────
  const controls: [string, string, string, string, string, number][] = [
    ["SOC2-CC6.1", "Logical access · network & system controls", "Security", "IMPLEMENTED", "E. Marchetti", 6],
    ["SOC2-CC6.6", "Boundary protection & transmission security", "Security", "IMPLEMENTED", "J. Weber", 4],
    ["SOC2-CC7.2", "Anomaly & security event monitoring", "Security", "PARTIAL", "J. Weber", 3],
    ["SOC2-CC8.1", "Change management controls", "Availability", "IMPLEMENTED", "E. Marchetti", 8],
    ["SOC2-CC9.1", "Risk mitigation & third-party assurance", "Confidentiality", "PARTIAL", "E. Marchetti", 2],
    ["ISO-27001-A.5.15", "Access control · classification", "Security", "PLANNED", "Security Team", 0],
    ["ISO-27001-A.8.12", "Data leakage prevention", "Confidentiality", "PARTIAL", "Security Team", 1],
    ["GDPR-32", "Security of processing (Art. 32)", "Privacy", "IMPLEMENTED", "E. Marchetti", 5],
    ["GDPR-30", "Records of processing activities", "Privacy", "IMPLEMENTED", "DPO Office", 7],
    ["eIDAS-32", "Qualified electronic signature integrity", "Trust", "IMPLEMENTED", "J. Weber", 9],
  ];
  for (const [ref, title, category, status, owner, ev] of controls) {
    await db.control.create({
      data: {
        ref, title, category, status, owner, evidenceCount: ev,
        lastReviewedAt: d(5 + Math.random() * 60),
        framework: ref.startsWith("SOC2") ? "SOC 2" : ref.startsWith("ISO") ? "ISO 27001" : ref.startsWith("GDPR") ? "GDPR" : "eIDAS",
      },
    });
  }
  const policies: [string, string, number, string, string][] = [
    ["Envelope records", "Signed envelopes & certificates", 2555, "ARCHIVE", "ACTIVE"],
    ["Unsigned drafts", "Documents never sent or expired", 90, "DELETE", "ACTIVE"],
    ["Audit trail exports", "Compressed audit chain archives", 1095, "ARCHIVE", "ACTIVE"],
    ["Recruiting documents", "Candidate records (Art. 6(1)(b))", 180, "ANONYMIZE", "ACTIVE"],
    ["Marketing consents", "Consent logs & proof", 730, "DELETE", "DRAFT"],
  ];
  for (const [name, scope, days, disp, status] of policies) {
    await db.retentionPolicy.create({
      data: { name, scope, retentionDays: days, disposition: disp, status, lastSweepAt: status === "ACTIVE" ? d(0.4) : null },
    });
  }
  await db.legalHold.createMany({
    data: [
      { tenantId: tenants["stalfe"], reason: "Pending litigation · Case 4711 (Rotterdam District Court)", scope: "All envelopes with counterparty Corvus Manufacturing", issuedBy: "E. Marchetti", issuedAt: d(11) },
      { tenantId: tenants["corvus-mfg"], reason: "Regulatory investigation · export control audit", scope: "Freight terms & customs envelopes 2025-2026", issuedBy: "E. Marchetti", issuedAt: d(25) },
      { tenantId: tenants["aurora-legal"], reason: "Arbitration · Matter ARB-882", scope: "Settlement agreement drafts", issuedBy: "J. Weber", issuedAt: d(4), status: "RELEASED", releasedAt: d(1) },
    ],
  });
  const consents: [string, string, string][] = [
    ["data.subject@helios-energy.example", "Terms of service", "GRANTED"],
    ["member@meteora-health.example", "Product updates", "GRANTED"],
    ["client@atlas-freight.example", "Product updates", "WITHDRAWN"],
    ["former.employee@aurora-legal.example", "Terms of service", "GRANTED"],
    ["newsletter@solstice-media.example", "Newsletter", "WITHDRAWN"],
  ];
  for (const [email, purpose, status] of consents) {
    await db.consent.create({
      data: { subjectEmail: email, purpose, status, grantedAt: d(60), source: "signup", withdrawnAt: status === "WITHDRAWN" ? d(5) : null },
    });
  }
  await db.incident.createMany({
    data: [
      { title: "Signing service latency spike (eu-west-1)", severity: "SEV3", status: "RESOLVED", description: "TSA latency caused seal operations to exceed 30s SLO. Traffic re-routed to secondary timestamp provider.", assignee: "J. Weber", detectedAt: d(9), resolvedAt: d(8.8) },
      { title: "Brute-force attempts against admin portal", severity: "SEV2", status: "CONTAINED", description: "Credential stuffing wave from 41 source IPs; rate-limited and blocked at edge. No accounts compromised (2FA enforced).", assignee: "E. Marchetti", detectedAt: d(2.1) },
      { title: "Expired dependency CVE in PDF renderer", severity: "SEV3", status: "OPEN", description: "CVE-2026-8812 (high) in pdf-render-worker 2.3.1. Upgrade scheduled in change CR-118.", assignee: "Platform Team", detectedAt: d(0.8) },
    ],
  });
  await db.accessReview.createMany({
    data: [
      { quarter: "Q3 2026", reviewer: "E. Marchetti", scope: "Platform admin & prod access (4 identities)", status: "COMPLETED", findings: 1, completedAt: d(20) },
      { quarter: "Q3 2026", reviewer: "A. Fischer", scope: "StålFe workspace admin roles", status: "COMPLETED", findings: 0, completedAt: d(18) },
      { quarter: "Q4 2026", reviewer: "J. Weber", scope: "Platform admin & prod access (4 identities)", status: "PENDING" },
      { quarter: "Q4 2026", reviewer: "H. Schulz", scope: "Helios workspace · segregation of duties", status: "PENDING" },
    ],
  });
  const risks: [string, string, string, string, number, string, string, string][] = [
    ["TSA single-vendor dependency", "Operational", "MEDIUM", "HIGH", 12, "Secondary RFC 3161 provider configured; automatic failover tested", "OPEN", "J. Weber"],
    ["Signing certificate expiry process", "Trust", "LOW", "HIGH", 6, "Expiry monitoring with 30-day countdown; renewal runbook", "MITIGATED", "E. Marchetti"],
    ["Sub-processor concentration (EU hosting)", "Vendor", "MEDIUM", "MEDIUM", 9, "Dual-region deployment evaluation in progress", "OPEN", "Platform Team"],
    ["Legacy API v1 deprecation", "Technical", "HIGH", "LOW", 3, "Deprecation notice sent; 3 tenants remaining", "ACCEPTED", "J. Weber"],
  ];
  for (const [title, category, likelihood, impact, score, mitigation, status, owner] of risks) {
    await db.risk.create({ data: { title, category, likelihood, impact, score, mitigation, status, owner } });
  }
  await db.change.createMany({
    data: [
      { title: "Upgrade pdf-render-worker to 2.4.0", type: "STANDARD", description: "Patches CVE-2026-8812; includes performance regression tests in staging.", requestedBy: "Platform Team", status: "PENDING" },
      { title: "Enable SMS delivery for eu-south region", type: "STANDARD", description: "New Twilio EU region routing for SMS OTP delivery.", requestedBy: "Growth Team", status: "APPROVED", decidedBy: "E. Marchetti", decisionAt: d(3) },
      { title: "Emergency: rotate SMTP credentials", type: "EMERGENCY", description: "Credential exposure in CI logs; rotated and revoked old secrets.", requestedBy: "J. Weber", status: "IMPLEMENTED", decidedBy: "E. Marchetti", decisionAt: d(6) },
      { title: "Introduce usage-based overage billing", type: "STANDARD", description: "Charge per-envelope overage beyond plan quota.", requestedBy: "Finance", status: "PENDING" },
    ],
  });
  const vendors: [string, string, string, boolean, number, string][] = [
    ["EU Cloud Host B.V.", "Primary infrastructure (eu-west-1)", "HIGH", true, 34, "APPROVED"],
    ["Timestamp Authority SE", "RFC 3161 timestamping", "MEDIUM", true, 12, "APPROVED"],
    ["MailRelay EU", "Transactional email delivery", "MEDIUM", true, 60, "APPROVED"],
    ["MessageRoute GmbH", "SMS OTP delivery", "LOW", false, 90, "REVIEW"],
    ["ObservabilityStack", "Metrics & log aggregation", "MEDIUM", true, 47, "APPROVED"],
  ];
  for (const [name, service, riskLevel, dpd, audit, status] of vendors) {
    await db.vendor.create({ data: { name, service, riskLevel, dpdSigned: dpd, lastAuditAt: d(audit), status } });
  }
  await db.restoreDrill.createMany({
    data: [
      { scope: "Primary database (eu-west-1a)", rtoTarget: "2h", rtoActual: "1h 22m", result: "PASS", executedAt: d(45), notes: "Full restore verified with 4 TB snapshot." },
      { scope: "Envelope storage bucket", rtoTarget: "4h", rtoActual: "3h 05m", result: "PASS", executedAt: d(30) },
      { scope: "Signing HSM keys (offline backup)", rtoTarget: "24h", rtoActual: "31h", result: "FAIL", executedAt: d(75), notes: "Escrow retrieval SLA breached; vendor contract updated." },
      { scope: "Cross-region failover", rtoTarget: "1h", rtoActual: null, result: "PARTIAL", executedAt: d(15), notes: "DNS cutover manual · automation ticketed as CR-121." },
    ],
  });
  await db.subprocessor.createMany({
    data: [
      { name: "EU Cloud Host B.V.", purpose: "Application & database hosting", location: "Netherlands", dpaSigned: true, transferMechanism: "EU only" },
      { name: "Timestamp Authority SE", purpose: "RFC 3161 trusted timestamps", location: "Germany", dpaSigned: true, transferMechanism: "EU only" },
      { name: "MailRelay EU", purpose: "Transactional email", location: "Ireland", dpaSigned: true, transferMechanism: "EU only" },
      { name: "MessageRoute GmbH", purpose: "SMS delivery", location: "Germany", dpaSigned: false, transferMechanism: "SCC" },
    ],
  });

  // ── API keys & webhooks ────────────────────────────────────────────────
  const keysData: [string, string, string, string, boolean, string | null][] = [
    ["StålFe production key", "dk_live_sf91", "FULL", "stalfe", true, "A. Fischer"],
    ["StålFe envelope sync", "dk_live_sf42", "ENVELOPES", "stalfe", true, "M. Bianchi"],
    ["Aurora CI pipeline", "dk_live_aur7", "READONLY", "aurora-legal", false, "P. Rinaldi"],
    ["Helios ERP bridge", "dk_live_hel13", "ENVELOPES", "helios-energy", true, "H. Schulz"],
    ["Atlas legacy v1 key", "dk_live_atl55", "FULL", "atlas-freight", true, "D. Volkov"],
    ["Bayern read-only audit", "dk_live_bay21", "READONLY", "bayern-immo", true, "L. Huber"],
  ];
  for (const [name, prefix, scope, slug, active, creator] of keysData) {
    await db.apiKey.create({
      data: {
        tenantId: tenants[slug], name, prefix, scope, createdBy: creator ?? "·",
        status: active ? "ACTIVE" : "REVOKED", lastUsedAt: active ? d(Math.random()) : d(20),
        createdAt: d(90),
      },
    });
  }
  // Platform-level key owned by admin
  await db.apiKey.create({
    data: { tenantId: null, name: "Docurama internal ops", prefix: "dk_ops_004", scope: "FULL", createdBy: "E. Marchetti", status: "ACTIVE", lastUsedAt: d(0.2), createdAt: d(120) },
  });
  const hooksData: [string, string, string, string, number][] = [
    ["stalfe", "https://ops.stalfe.example/hooks/docurama", "envelope.completed|envelope.voided", "ACTIVE", 99],
    ["helios-energy", "https://erp.helios-energy.de/api/docurama-events", "envelope.completed|recipient.signed", "ACTIVE", 100],
    ["aurora-legal", "https://auroralegal.co.uk/automation/signing", "envelope.created|envelope.completed|template.used", "FAILING", 62],
    ["atlas-freight", "https://atlasfreight.io/webhooks/docs", "envelope.declined", "PAUSED", 100],
  ];
  for (const [slug, url, events, status, rate] of hooksData) {
    const hook = await db.webhookEndpoint.create({
      data: {
        tenantId: tenants[slug], url, events, status, secretMasked: "whsec_••••••" + sha(url).slice(0, 4),
        successRate: rate, lastDeliveryAt: d(0.1), createdAt: d(70),
      },
    });
    const outcomes: [string, number, boolean][] = [
      ["envelope.completed", 200, true], ["envelope.completed", 200, true],
      ["recipient.signed", 200, true], ["envelope.voided", 500, false],
      ["envelope.completed", 200, true], ["envelope.created", 408, false],
    ];
    for (let i = 0; i < outcomes.length; i++) {
      const [ev, code, ok] = outcomes[i];
      await db.webhookDelivery.create({
        data: { endpointId: hook.id, event: ev, statusCode: code, durationMs: 80 + Math.floor(Math.random() * 400), success: ok, at: d(i * 0.3) },
      });
    }
  }

  // ── Audit & security events ────────────────────────────────────────────
  const auditActions: [string, string, string, string, string][] = [
    ["tenant.plan_changed", "tenant:corvus-mfg", "INFO", "E. Marchetti", "PLATFORM_ADMIN"],
    ["user.login.admin_portal", "user:admin@docurama.eu", "INFO", "E. Marchetti", "PLATFORM_ADMIN"],
    ["envelope.sealed", "envelope:DOC-8241", "INFO", "A. Fischer", "WORKSPACE_ADMIN"],
    ["api_key.created", "api_key:dk_live_hel13", "WARNING", "H. Schulz", "MEMBER"],
    ["domain.verified", "domain:helios-energy.de", "INFO", "H. Schulz", "WORKSPACE_ADMIN"],
    ["legal_hold.issued", "tenant:stalfe", "WARNING", "E. Marchetti", "PLATFORM_ADMIN"],
    ["dsar.downloaded", "dsar:access-request", "INFO", "J. Weber", "PLATFORM_ADMIN"],
    ["smtp_settings.updated", "platform:settings", "WARNING", "J. Weber", "PLATFORM_ADMIN"],
    ["retention.sweep_completed", "platform:retention", "INFO", "system", "SYSTEM"],
    ["webhook.endpoint_paused", "webhook:atlas-freight", "WARNING", "D. Volkov", "MEMBER"],
    ["tenant.suspended", "tenant:corvus-mfg", "CRITICAL", "E. Marchetti", "PLATFORM_ADMIN"],
    ["audit_chain.sealed", "platform:audit", "INFO", "system", "SYSTEM"],
  ];
  for (let i = 0; i < 28; i++) {
    const [action, resource, severity, actor, role] = pick(auditActions, i);
    await db.auditEvent.create({
      data: { actor, actorRole: role, action, resource, severity, ip: `10.42.${i % 6}.${(i * 13) % 240}`, at: d(i * 0.4), detail: null, tenantName: i % 3 === 0 ? pick(tenantsData, i).name : null },
    });
  }
  const secEvents: [string, string, string, boolean, string][] = [
    ["MFA_CHALLENGE_TOKEN_MISUSE_BLOCKED", "HIGH", "unknown@protonmail.example", true, "MFA challenge token presented as session token · rejected by purpose check"],
    ["SIGNER_TOKEN_HARVEST_ATTEMPT_BLOCKED", "HIGH", "recipient:marco@stalfe.example", true, "Attempt to access co-signer session · recipient tokens no longer serialized"],
    ["FAILED_LOGIN", "LOW", "greta@corvus-mfg.example", false, "3 consecutive failures · account cool-down applied"],
    ["RATE_LIMIT", "MEDIUM", "198.51.100.77", true, "42 verify-portal requests/min from single IP"],
    ["ADMIN_LOGIN", "INFO", "admin@docurama.eu", false, "Platform admin signed in with TOTP"],
    ["CREDENTIAL_STUFFING_WAVE", "HIGH", "41 source IPs", true, "Edge rule CH-77 auto-blocked for 24h"],
    ["PATH_TRAVERSAL_ATTEMPT_BLOCKED", "HIGH", "203.0.113.24", true, "SPA fallback traversal payload rejected"],
    ["API_KEY_RATE_SOFT_LIMIT", "MEDIUM", "api_key:dk_live_hel13", false, "80% of hourly budget consumed"],
  ];
  for (let i = 0; i < 22; i++) {
    const [type, severity, actor, blocked, detail] = pick(secEvents, i);
    await db.securityEvent.create({
      data: { type, severity, actor, ip: `198.51.100.${(i * 7) % 240}`, blocked, detail, at: d(i * 0.6) },
    });
  }

  // ── Daily stats (30 days) ──────────────────────────────────────────────
  for (let i = 29; i >= 0; i--) {
    const wave = Math.sin((29 - i) / 5) * 30;
    const base = 180 + wave + (29 - i) * 3.5;
    await db.dailyStat.create({
      data: {
        date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
        envelopesCreated: Math.round(base + Math.random() * 25),
        envelopesSealed: Math.round(base * 0.72 + Math.random() * 15),
        signersActive: Math.round(base * 1.4 + Math.random() * 30),
        activeTenants: 58 + Math.round((29 - i) / 6),
        mrrEur: 6_800 + Math.round((29 - i) * 18 + Math.random() * 40),
      },
    });
  }

  // ── Platform settings ──────────────────────────────────────────────────
  await db.platformSetting.create({
    data: {
      certExpiryAt: dFuture(47), lastDeployAt: d(1.2), sweeperLastRunAt: d(0.05),
      auditChainSealedAt: d(0.3), updatedAt: new Date(),
    },
  });

  const counts = {
    tenants: await db.tenant.count(), users: await db.user.count(),
    envelopes: await db.envelope.count(), recipients: await db.recipient.count(),
    events: await db.envelopeEvent.count(), templates: await db.template.count(),
    audit: await db.auditEvent.count(), stats: await db.dailyStat.count(),
  };
  console.log("Seed complete:", counts);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
