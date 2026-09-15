/**
 * Runtime DB patch: rebrand the Northwind Logistics demo workspace to StålFe
 * (foundry & industrial supply chain) with realistic steel-industry documents.
 *
 * Idempotent: safe to run twice.
 * Usage: npx tsx scripts/stalfe-rebrand.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Old base title -> new base title for the stalfe workspace, by recency position (0 = newest). */
const STALFE_TITLES: string[] = [
  "EN 10204 3.1 Mill Certificate · S355J2 Plates",          // SENT
  "Foundry Partner Qualification · Nordjärm Gjuteri",        // COMPLETED (sealed)
  "Welding Procedure WPS-2219 · Qualification Record",       // PARTIALLY_SIGNED
  "Inspection Certificate 3.2 · Pressure Housings",          // COMPLETED (sealed)
  "Purchase Order PO-2026-0417 · Steel Castings",            // SENT
  "Quotation Q-2213 · Fonderia Padana",                      // DECLINED
  "Supplier Quality Agreement · Gusswerk Rheinland",         // SENT
  "CE Declaration of Conformity · Gearbox Housings",         // SENT
  "RFQ-1188 Response · Wind Turbine Hubs",                   // EXPIRED
  "Material Substitution Approval · S420N",                  // DRAFT
  "Mutual NDA · Aurora Legal",                               // COMPLETED
  "Employment Contract · J. Weber",                          // COMPLETED
  "SOW #4 · Integration Works",                              // VOIDED
  "Site Access Induction · Oxelösund Works",                 // PARTIALLY_SIGNED
  "Freight Terms & Conditions 2026",                         // fallback oldest
];

/** Global old->new base-title mapping applied to every tenant (logistics->generic cleanups). */
const GLOBAL_TITLES: Record<string, string> = {
  "Vendor Onboarding Pack — Corvus": "Foundry Partner Qualification · Corvus Manufacturing",
  "Procurement Contract — Solar Panels": "Purchase Order · Solar Component Sets",
  "Loan Agreement — BayWa": "Framework Agreement · BayWa",
  "Renewal — Atlas Platform License": "Renewal · Atlas Platform License",
};

const sep = (s: string) => s.replace(/ — /g, " · ");

async function main() {
  const tenant =
    (await db.tenant.findFirst({ where: { slug: "northwind" } })) ??
    (await db.tenant.findFirst({ where: { slug: "stalfe" } }));
  if (!tenant) throw new Error("northwind/stalfe tenant not found");
  console.log("Rebranding tenant", tenant.id, tenant.name, "-> StålFe");

  await db.tenant.update({ where: { id: tenant.id }, data: { name: "StålFe", slug: "stalfe" } });

  // Users + their email references everywhere
  for (const old of ["alex@northwind.example", "marco@northwind.example", "sofia@northwind.example"]) {
    const neu = old.replace("northwind.example", "stalfe.example");
    await db.user.updateMany({ where: { email: old }, data: { email: neu } });
    await db.recipient.updateMany({ where: { email: old }, data: { email: neu } });
  }
  await db.securityEvent.updateMany({
    where: { actor: "recipient:marco@northwind.example" },
    data: { actor: "recipient:marco@stalfe.example" },
  });
  const secEvs = await db.securityEvent.findMany({ where: { detail: { contains: "—" } }, select: { id: true, detail: true } });
  for (const ev of secEvs) {
    await db.securityEvent.update({ where: { id: ev.id }, data: { detail: sep(ev.detail ?? "") } });
  }

  // Sending domains
  await db.domain.updateMany({
    where: { tenantId: tenant.id, domain: "northwind-logistics.com" },
    data: { domain: "stalfe.com" },
  });
  await db.domain.updateMany({
    where: { tenantId: tenant.id, domain: "mail.northwind.example" },
    data: { domain: "mail.stalfe.example" },
  });

  // API keys + webhook
  await db.apiKey.updateMany({ where: { tenantId: tenant.id, name: "Northwind production key" }, data: { name: "StålFe production key" } });
  await db.apiKey.updateMany({ where: { tenantId: tenant.id, name: "Northwind envelope sync" }, data: { name: "StålFe envelope sync" } });
  await db.webhookEndpoint.updateMany({
    where: { tenantId: tenant.id },
    data: { url: "https://ops.stalfe.example/hooks/docurama" },
  });

  // Audit scope string
  await db.auditEvent.updateMany({
    where: { detail: { contains: "Northwind workspace admin roles" } },
    data: { detail: "StålFe workspace admin roles" },
  });

  // Global title cleanups across all tenants
  const all = await db.envelope.findMany({ select: { id: true, title: true } });
  for (const e of all) {
    let t = sep(e.title);
    const base = t.replace(/ \(v\d+\)$/, "");
    const suffix = t.match(/ \(v\d+\)$/)?.[0] ?? "";
    if (GLOBAL_TITLES[base]) t = GLOBAL_TITLES[base] + suffix;
    if (t !== e.title) await db.envelope.update({ where: { id: e.id }, data: { title: t } });
  }

  // StålFe workspace: remap titles by recency position
  const envs = await db.envelope.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });
  console.log("StålFe envelopes:", envs.length);
  for (let i = 0; i < envs.length; i++) {
    const newTitle = STALFE_TITLES[i] ?? sep(envs[i].title);
    if (envs[i].title !== newTitle) {
      await db.envelope.update({ where: { id: envs[i].id }, data: { title: newTitle } });
    }
  }

  // Foundry-realistic signers on the two hero envelopes (newest = mill certificate)
  if (envs[0]) {
    await db.recipient.updateMany({
      where: { envelopeId: envs[0].id, order: 1 },
      data: { name: "Lars Bergström", email: "lars@nordjarm.example" },
    });
  }
  if (envs[1]) {
    await db.recipient.updateMany({
      where: { envelopeId: envs[1].id, order: 1 },
      data: { name: "Lars Bergström", email: "lars@nordjarm.example" },
    });
  }

  // Event details + void reasons: em-dash -> middle dot everywhere
  const evs = await db.envelopeEvent.findMany({ where: { detail: { contains: "—" } }, select: { id: true, detail: true } });
  for (const ev of evs) {
    await db.envelopeEvent.update({ where: { id: ev.id }, data: { detail: sep(ev.detail ?? "") } });
  }
  const voids = await db.envelope.findMany({ where: { voidReason: { contains: "—" } }, select: { id: true, voidReason: true } });
  for (const v of voids) {
    await db.envelope.update({ where: { id: v.id }, data: { voidReason: sep(v.voidReason ?? "") } });
  }
  const holds = await db.legalHold.findMany({ where: { OR: [{ reason: { contains: "—" } }, { scope: { contains: "—" } }] }, select: { id: true, reason: true, scope: true } });
  for (const h of holds) {
    await db.legalHold.update({ where: { id: h.id }, data: { reason: sep(h.reason), scope: sep(h.scope) } });
  }

  // Templates: rename + add the two foundry templates for the StålFe workspace
  await db.template.updateMany({ where: { tenantId: tenant.id, name: "Employment Contract — DE" }, data: { name: "Employment Contract (DE)" } });
  const hasMill = await db.template.findFirst({ where: { tenantId: tenant.id, name: "Mill Certificate 3.1 (EN 10204)" } });
  if (!hasMill) {
    await db.template.createMany({
      data: [
        { tenantId: tenant.id, name: "Mill Certificate 3.1 (EN 10204)", description: "Material test certificate per EN 10204 type 3.1", category: "Quality", pages: 2, usageCount: 18, publicSlug: "t-millcert-" + tenant.id.slice(-6) },
        { tenantId: tenant.id, name: "Foundry Partner Qualification", description: "Supplier audit and qualification record for foundry partners", category: "Compliance", pages: 6, usageCount: 7, publicSlug: "t-foundry-" + tenant.id.slice(-6) },
      ],
    });
  }

  const check = await db.tenant.findUnique({ where: { id: tenant.id } });
  console.log("DONE:", check?.name, check?.slug);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
