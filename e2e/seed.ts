import { captureSignatureData } from "../src/lib/signature-data";
import { computeEnvelopeEvidenceDigest } from "../src/lib/esign";
/**
 * E2E seed — deterministic, idempotent fixtures for the Maestro suite.
 *
 * Run: bun e2e/seed.ts   (or `bun run test:e2e:seed`)
 *
 * Design rules:
 *  - All E2E writes are confined to the dedicated "E2E Testing" tenant.
 *    The demo dataset (StålFe, Aurora, …) is never touched.
 *  - Re-running wipes the tenant's envelopes/templates first, so every
 *    `maestro test` cycle starts from the same state.
 *  - Demo passwords retain the legacy SHA-256 fixture format; successful
 *    password login upgrades them through src/lib/auth.ts to salted scrypt.
 *  - Fixed publicCodes (DOC-E2E0001/0002/0003) make verify-portal flows
 *    deterministic without scraping codes out of the UI.
 *  - Fixed signing tokens (E2E_SIGNER_TOKEN / E2E_DECLINE_TOKEN) make the
 *    signer-portal flows deterministic — in production tokens are 32 random
 *    bytes, the seed pins two so Maestro can open /sign/{token} directly.
 *  - An API key fixture (known secret, ENVELOPES scope) drives the API-layer
 *    test suite (e2e/api.test.ts).
 */

import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  commitmentHash, chainEntryHash, appendPortalLogEntry,
  GENESIS_HEAD, TRANSPARENCY_FORMAT,
} from "../src/lib/transparency";
import { storeUpload } from "../src/lib/document-store";
import { PLAN_CATALOG, PLAN_ORDER } from "../src/lib/plans";
import { syncTemplateLibrary } from "../scripts/sync-template-library";
import { backfillLeadSearch } from "../scripts/backfill-lead-search";

const run = promisify(execFile);

const E2E_SIGNER_TOKEN = "e2e-fixed-signer-token-0000000000000001";
const E2E_DECLINE_TOKEN = "e2e-fixed-decline-token-0000000000000001";
const E2E_JOURNEY_TOKEN = "e2e-fixed-journey-token-0000000000000001";
const E2E_CC_TOKEN = "e2e-fixed-cc-token-0000000000000001";
const E2E_API_KEY_SECRET = "dk_e2e_0000000000000000000000000000000000000000";
const E2E_MCP_RATE_KEY_SECRET = "dk_e2e_mcp_rate_0000000000000000000000000000001";

// Quota fixture: a STARTER tenant whose monthly envelope allowance (50) is
// fully spent, so the send path's 402 can be exercised deterministically.
const E2E_QUOTA_TENANT_SLUG = "e2e-quota";
const E2E_QUOTA_USER_EMAIL = "e2e-quota@docurama.eu";
const E2E_QUOTA_USER_PASSWORD = "e2eQuota1234!";
const E2E_QUOTA_FILLER = 100; // == PLAN_CATALOG.STARTER.envelopeLimit (src/lib/plans.ts)

// Fixed doc ids (doc_ + 32 hex, per DOC_ID_RE) so re-seeds overwrite the same
// storage keys instead of accumulating files.
const E2E_DOC_NDA = `doc_${"e2e" + "0".repeat(28)}1`;
const E2E_DOC_SERVICE = `doc_${"e2e" + "0".repeat(28)}2`;
const E2E_DOC_DECLINE = `doc_${"e2e" + "0".repeat(28)}3`;
const E2E_DOC_SEALED = `doc_${"e2e" + "0".repeat(28)}4`;

/**
 * Minimal valid multi-page PDF (standard Helvetica, no embedded fonts) —
 * enough for pdfium to render real pages, so the signer portal's preview
 * and its E2E flows exercise the actual render pipeline, not a stub.
 */
function minimalPdf(pageLabels: string[]): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  const firstPage = 4; // 1 catalog, 2 pages, 3 font; then page/content pairs
  pageLabels.forEach((_, i) => pageIds.push(firstPage + i * 2));

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageLabels.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pageLabels.forEach((label, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const text = `Docurama E2E fixture - ${label}`;
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const stream = `BT /F1 24 Tf 72 770 Td (${escaped}) Tj 0 -40 Td (${pageLabels.length} page document) Tj ET`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) throw new Error(`missing object ${id}`);
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Seed a Document row + its bytes on disk (overwrites a prior seed run). */
async function seedDocument(
  docId: string,
  filename: string,
  pageLabels: string[],
  tenantId: string,
  uploadedById: string,
) {
  const pdf = minimalPdf(pageLabels);
  const stored = await storeUpload(
    (async function* () { yield pdf; })(),
    tenantId,
    docId,
  );
  return db.document.create({
    data: {
      id: docId, tenantId, uploadedById, filename,
      storageKey: stored.storageKey, byteSize: stored.byteSize,
      pageCount: pageLabels.length, sha256: stored.sha256,
    },
  });
}

// Fixtures for the attested-verification flow (public portal result for a
// code sealed on a "remote self-hosted instance" — seeded directly as if the
// receiver had processed the push).
const E2E_ATTESTED_CODE = "DOC-E2EATST";
const E2E_ATTESTED_DOMAIN = "acme-corp.example";

const db = new PrismaClient();

const hashPassword = (pw: string) => createHash("sha256").update(pw).digest("hex");

const E2E_TENANT_SLUG = "e2e-testing";
const E2E_USER_EMAIL = "e2e@docurama.eu";
const E2E_USER_PASSWORD = "e2ePass1234!";
const E2E_ADMIN_EMAIL = "e2e-admin@docurama.eu";
// Submitted by the public enterprise-lead browser flow; wiped below so the
// endpoint's 10-minute duplicate throttle cannot fail a re-run.
const E2E_LEAD_PREFIX = "e2e-lead-";
const E2E_ADMIN_PASSWORD = "e2eAdmin1234!";

async function main() {
  // Catalog rows are fixtures too: branch-local committed DBs can contain
  // an older catalogue. Do not rewrite existing subscriptions here.
  for (const code of PLAN_ORDER) {
    const p = PLAN_CATALOG[code];
    const data = { name: p.name, monthlyEur: p.monthlyEur, seatLimit: p.seatLimit,
      envelopeLimit: p.envelopeLimit, storageGb: p.storageGb, apiAccess: p.apiAccess,
      slaUptime: p.slaUptime, support: p.support,
      features: p.features.join("|"), outcomes: p.outcomes.join("|") };
    await db.plan.upsert({ where: { code }, create: { code, ...data }, update: data });
  }
  /* ── Tenant ──────────────────────────────────────────────────────── */
  const tenant =
    (await db.tenant.findUnique({ where: { slug: E2E_TENANT_SLUG } })) ??
    (await db.tenant.create({
      data: {
        name: "E2E Testing",
        slug: E2E_TENANT_SLUG,
        planCode: "ENTERPRISE", // high monthly quota so flows never hit 402
        status: "ACTIVE",
      },
    }));
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  /* ── Wipe prior E2E run artifacts (envelopes cascade to recipients/events) ── */
  const wiped = await db.envelope.deleteMany({ where: { tenantId: tenant.id } });
  await db.template.deleteMany({ where: { tenantId: tenant.id } });
  await db.document.deleteMany({ where: { tenantId: tenant.id } }); // envelopes are gone, no FK left
  console.log(`wiped ${wiped.count} prior E2E envelope(s)`);

  /* ── Users ───────────────────────────────────────────────────────── */
  const upsertUser = async (
    email: string,
    password: string,
    role: string,
    extra: { firstName: string; lastName: string }
  ) => {
    const existing = await db.user.findUnique({ where: { email } });
    const data = {
      email,
      passwordHash: hashPassword(password),
      firstName: extra.firstName,
      lastName: extra.lastName,
      role,
      status: "ACTIVE",
    };
    const user = existing
      ? await db.user.update({ where: { id: existing.id }, data })
      : await db.user.create({ data });
    // Membership in the E2E tenant (OWNER for the workspace user, ADMIN seat
    // for the platform admin so they can scope into it if a flow needs to).
    const member =
      (await db.member.findFirst({ where: { userId: user.id, tenantId: tenant.id } })) ??
      (await db.member.create({
        data: { userId: user.id, tenantId: tenant.id, role: role === "PLATFORM_ADMIN" ? "ADMIN" : "OWNER" },
      }));
    // activeTenantId scopes the workspace API for this user.
    const scoped =
      role === "PLATFORM_ADMIN"
        ? { activeTenantId: null } // platform admins see the admin console by default
        : { activeTenantId: tenant.id };
    if (existing) {
      await db.user.update({ where: { id: user.id }, data: scoped });
    } else {
      await db.user.update({ where: { id: user.id }, data: scoped });
    }
    void member;
    return user;
  };

  const wsUser = await upsertUser(E2E_USER_EMAIL, E2E_USER_PASSWORD, "WORKSPACE_ADMIN", {
    firstName: "Ella",
    lastName: "Tester",
  });
  await upsertUser(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "PLATFORM_ADMIN", {
    firstName: "Adam",
    lastName: "Admin",
  });
  console.log(`users: ${E2E_USER_EMAIL} (tenant scoped), ${E2E_ADMIN_EMAIL} (platform admin)`);

  /* ── Accounts e2e/plans.test.ts signs in as ──────────────────────── */
  // These are demo-shaped accounts that live in the committed demo database
  // (db/custom.db). The SQLite runner copies that file, so the tests found
  // them; any fresh database — every PostgreSQL deployment, and CI's postgres
  // job — has no demo data and the same tests 401'd. Provisioned here so the
  // fixtures have one source rather than a 1.5 MB binary the suite happens to
  // start from.
  //
  // Strictly create-if-absent: a real demo database keeps its own rows, which
  // is what "demo data is never touched" means elsewhere in this file.
  const ensureUser = async (
    email: string,
    password: string,
    role: string,
    firstName: string,
    lastName: string,
  ) => {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return { user: existing, created: false };
    const user = await db.user.create({
      data: { email, passwordHash: hashPassword(password), firstName, lastName, role, status: "ACTIVE" },
    });
    return { user, created: true };
  };

  const demoAdmin = await ensureUser("admin@docurama.eu", "admin1234", "PLATFORM_ADMIN", "Dana", "Admin");

  // alex/marco/sofia must share one workspace: the team tests assign marco to
  // a team alex creates, and assert sofia cannot create one at all.
  const alex = await ensureUser("alex@stalfe.example", "demo1234", "WORKSPACE_ADMIN", "Alex", "Stalfe");
  const marco = await ensureUser("marco@stalfe.example", "demo1234", "MEMBER", "Marco", "Stalfe");
  const sofia = await ensureUser("sofia@stalfe.example", "demo1234", "MEMBER", "Sofia", "Stalfe");

  if (alex.created || marco.created || sofia.created) {
    // Reuse whichever workspace the pre-existing member of the trio is already
    // in, so a partially-seeded database does not end up with two.
    const anchorMember = await db.member.findFirst({
      where: { userId: { in: [alex.user.id, marco.user.id, sofia.user.id] } },
    });
    const demoTenant =
      (anchorMember && (await db.tenant.findUnique({ where: { id: anchorMember.tenantId } }))) ??
      (await db.tenant.findFirst({ where: { slug: "stalfe-demo" } })) ??
      (await db.tenant.create({
        data: { name: "StalFe Demo", slug: "stalfe-demo", planCode: "BUSINESS", status: "ACTIVE" },
      }));

    // OWNER for alex (adminRoles => may create teams), MEMBER for the others
    // (sofia's 403 is the assertion).
    for (const [entry, memberRole] of [
      [alex, "OWNER"],
      [marco, "MEMBER"],
      [sofia, "MEMBER"],
    ] as const) {
      const member = await db.member.findFirst({
        where: { userId: entry.user.id, tenantId: demoTenant.id },
      });
      if (!member) {
        await db.member.create({
          data: { userId: entry.user.id, tenantId: demoTenant.id, role: memberRole, status: "ACTIVE" },
        });
      }
      if (!entry.user.activeTenantId) {
        await db.user.update({ where: { id: entry.user.id }, data: { activeTenantId: demoTenant.id } });
      }
    }
    console.log(`demo accounts: provisioned into ${demoTenant.slug} (alex/marco/sofia)`);
  }
  if (demoAdmin.created) console.log("demo accounts: provisioned admin@docurama.eu");

  /* ── Built-in template library ───────────────────────────────────── */
  // The 8 statutory French templates are defined in src/lib/templates/fr and
  // synced by scripts/sync-template-library.ts, which nothing called. They
  // therefore existed only inside the committed demo database, so a fresh one
  // served an empty /modeles-de-contrats and an empty workspace template list.
  const builtIns = await syncTemplateLibrary();
  console.log(`templates: ${builtIns} built-in French template(s) present`);

  /* ── Lead search columns ─────────────────────────────────────────── */
  // Rows created before companyLower/contactNameLower existed carry the ""
  // default and are unsearchable until folded. Idempotent.
  const leadsFixed = await backfillLeadSearch();
  if (leadsFixed) console.log(`leads: backfilled search columns on ${leadsFixed} lead(s)`);

  /* ── Platform settings singleton ─────────────────────────────────── */
  // Nothing in the application creates this row; it only ever came from the
  // demo database. Without it the admin console renders no SMTP/TSA cards.
  // certExpiryAt is the one column with no schema default.
  const settingsRow = await db.platformSetting.findUnique({ where: { id: "singleton" } });
  if (!settingsRow) {
    await db.platformSetting.create({
      data: { id: "singleton", certExpiryAt: new Date(Date.now() + 365 * 86400_000) },
    });
    console.log("platform settings: provisioned the singleton row");
  }

  /* ── Fixture documents (real PDFs on disk for the signer preview) ── */
  const ndaDoc = await seedDocument(
    E2E_DOC_NDA, "mutual-nda-e2e.pdf",
    ["Mutual NDA - page 1 of 3", "Mutual NDA - page 2 of 3", "Mutual NDA - page 3 of 3"],
    tenant.id, wsUser.id,
  );
  const serviceDoc = await seedDocument(
    E2E_DOC_SERVICE, "service-agreement-e2e.pdf",
    [
      "Service Agreement - page 1 of 4", "Service Agreement - page 2 of 4",
      "Service Agreement - page 3 of 4", "Service Agreement - page 4 of 4",
    ],
    tenant.id, wsUser.id,
  );
  console.log(`documents: ${ndaDoc.filename} (3 pages) + ${serviceDoc.filename} (4 pages)`);

  const declineDoc = await seedDocument(E2E_DOC_DECLINE, "consultant-decline-e2e.pdf",
    ["Consultant Agreement - page 1 of 2", "Consultant Agreement - page 2 of 2"], tenant.id, wsUser.id);
  const sealedDoc = await seedDocument(E2E_DOC_SEALED, "supply-agreement-e2e.pdf",
    Array.from({ length: 5 }, (_, index) => `Supply Agreement - page ${index + 1} of 5`), tenant.id, wsUser.id);

  /* ── Fixture envelopes (deterministic verify-portal targets) ─────── */
  // SENT, one pending recipient — verify portal must report NOT_SEALED.
  await db.envelope.create({
    data: {
      publicCode: "DOC-E2E0001",
      sha256: ndaDoc.sha256,
      documentId: ndaDoc.id,
      title: "E2E Fixture — Mutual NDA (sent)",
      titleLower: "e2e fixture — mutual nda (sent)",
      tenantId: tenant.id,
      createdById: wsUser.id,
      status: "SENT",
      message: "Fixture envelope seeded for the verify-portal flow.",
      pages: 3,
      recipients: {
        create: [
          {
            name: "Fixture Signer",
            email: "fixture-signer@example.com",
            role: "SIGNER",
            order: 1,
            status: "PENDING",
            accessToken: E2E_SIGNER_TOKEN,
          },
          {
            name: "Fixture CC",
            email: "fixture-cc@example.com",
            role: "CC",
            order: 2,
            status: "PENDING",
            accessToken: E2E_CC_TOKEN,
          },
        ],
      },
      events: {
        create: [
          { actor: "Ella Tester", action: "CREATED", detail: "Seeded fixture" },
          { actor: "Docurama", action: "SENT", detail: "Seeded fixture" },
        ],
      },
    },
  });

  // SENT, one pending recipient — the decline flow (see below) needs its own
  // envelope so signing/declining never disturbs the other flows' fixtures.
  await db.envelope.create({
    data: {
      publicCode: "DOC-E2E0003",
      sha256: declineDoc.sha256,
      documentId: declineDoc.id,
      title: "E2E Fixture — Consultant Agreement (decline)",
      titleLower: "e2e fixture — consultant agreement (decline)",
      tenantId: tenant.id,
      createdById: wsUser.id,
      status: "SENT",
      message: "Fixture envelope seeded for the decline flow.",
      pages: 2,
      recipients: {
        create: [
          {
            name: "Fixture Decliner",
            email: "fixture-decliner@example.com",
            role: "SIGNER",
            order: 1,
            status: "PENDING",
            accessToken: E2E_DECLINE_TOKEN,
          },
        ],
      },
      events: {
        create: [
          { actor: "Ella Tester", action: "CREATED", detail: "Seeded fixture" },
          { actor: "Docurama", action: "SENT", detail: "Seeded fixture" },
        ],
      },
    },
  });

  // COMPLETED + sealed — verify portal must report VERIFIED with digest.
  const sealedAt = new Date();
  const sealedSignatureData = JSON.stringify(captureSignatureData({ name: "Fixture Signer", font: "caveat", consent: true },
    [], "fixture-signer@example.com", sealedAt));
  const sealedTitle = "E2E Fixture — Supply Agreement (sealed)";
  const sealedEvidenceDigest = computeEnvelopeEvidenceDigest({ id: "", publicCode: "DOC-E2E0002",
    title: sealedTitle, pages: 5, createdAt: sealedAt,
    documentSha256: sealedDoc.sha256, recipients: [{ email: "fixture-signer@example.com", role: "SIGNER",
      status: "SIGNED", order: 1, signedAt: sealedAt, signatureData: sealedSignatureData }], events: [] });
  await db.envelope.create({
    data: {
      publicCode: "DOC-E2E0002",
      documentId: sealedDoc.id,
      createdAt: sealedAt,
      evidenceSha256: sealedEvidenceDigest,
      title: sealedTitle,
      titleLower: "e2e fixture — supply agreement (sealed)",
      tenantId: tenant.id,
      createdById: wsUser.id,
      status: "COMPLETED",
      message: "Seeded sealed fixture.",
      pages: 5,
      sha256: sealedDoc.sha256,
      sealedAt,
      completedAt: sealedAt,
      conformanceLevel: null,
      recipients: {
        create: [
          {
            name: "Fixture Signer",
            email: "fixture-signer@example.com",
            role: "SIGNER",
            order: 1,
            status: "SIGNED",
            signedAt: sealedAt,
            signatureData: sealedSignatureData,
            accessToken: randomBytes(32).toString("base64url"),
          },
        ],
      },
      events: {
        create: [
          { actor: "Ella Tester", action: "CREATED", detail: "Seeded fixture" },
          { actor: "Fixture Signer", action: "SIGNED", detail: "Sealed fixture signature" },
          { actor: "Docurama", action: "SEALED", detail: "All signers completed. Seeded fixture seal (verification code DOC-E2E0002)" },
        ],
      },
    },
  });

  // SENT, one pending recipient — the signer-portal happy path: the flow opens
  // the link, reviews the embedded document preview, adopts a signature, signs,
  // and the envelope seals (COMPLETED). Its own fixture so sealing never breaks
  // the NOT_SEALED assertions on 0001.
  await db.envelope.create({
    data: {
      publicCode: "DOC-E2E0004",
      sha256: serviceDoc.sha256,
      documentId: serviceDoc.id,
      title: "E2E Fixture — Service Agreement (signer journey)",
      titleLower: "e2e fixture — service agreement (signer journey)",
      tenantId: tenant.id,
      createdById: wsUser.id,
      status: "SENT",
      message: "Please review and sign at your convenience.",
      pages: 4,
      recipients: {
        create: [
          {
            name: "Fixture Journey",
            email: "fixture-journey@example.com",
            role: "SIGNER",
            order: 1,
            status: "PENDING",
            accessToken: E2E_JOURNEY_TOKEN,
          },
        ],
      },
      events: {
        create: [
          { actor: "Ella Tester", action: "CREATED", detail: "Seeded fixture" },
          { actor: "Docurama", action: "SENT", detail: "Seeded fixture" },
        ],
      },
    },
  });

  console.log("fixtures: DOC-E2E0001 (SENT) + DOC-E2E0002 (COMPLETED/sealed) + DOC-E2E0003 (SENT/decline) + DOC-E2E0004 (SENT/signer-journey)");

  /* ── API key fixture (e2e/api.test.ts) ───────────────────────── */
  const secretHash = createHash("sha256").update(E2E_API_KEY_SECRET).digest("hex");
  await db.apiKey.deleteMany({ where: { name: "E2E Suite Key" } });
  await db.apiKey.create({
    data: {
      tenantId: tenant.id,
      name: "E2E Suite Key",
      prefix: "dk_e2e_",
      secretHash,
      scope: "ENVELOPES",
      status: "ACTIVE",
      createdBy: wsUser.id,
    },
  });
  // A second key reserved for the MCP rate-limit test: its in-server rate
  // bucket starts cold, so a temporarily lowered limit produces a crisp 429
  // on exactly the third request (see e2e/mcp.test.ts).
  await db.apiKey.deleteMany({ where: { name: "E2E MCP Rate Key" } });
  await db.apiKey.create({
    data: {
      tenantId: tenant.id,
      name: "E2E MCP Rate Key",
      prefix: "dk_e2e_mcp_rate_",
      secretHash: createHash("sha256").update(E2E_MCP_RATE_KEY_SECRET).digest("hex"),
      scope: "READONLY",
      status: "ACTIVE",
      createdBy: wsUser.id,
    },
  });
  console.log("api keys: E2E Suite Key (ENVELOPES) + E2E MCP Rate Key (READONLY)");

  /* ── MCP configuration + template fixture (e2e/mcp.test.ts) ────── */
  await db.mcpConfig.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      enabled: true,
      allowedTools: "envelope_list,envelope_detail,document_verify,template_list",
      rateLimitPerMin: 120, // high enough that the functional tests never trip it
    },
    update: { enabled: true, allowedTools: "envelope_list,envelope_detail,document_verify,template_list", rateLimitPerMin: 120 },
  });
  await db.template.create({
    data: {
      tenantId: tenant.id,
      name: "E2E Clause Library",
      nameLower: "e2e clause library",
      category: "Fixture",
      folder: "E2E",
      pages: 2,
      usageCount: 7,
      publicSlug: "e2e-clause-library",
      bodyMarkdown: "Fixture template body.",
    },
  });
  console.log("mcp: enabled for the E2E tenant (4 tools, 120/min) + template fixture");

  /* ── Quota fixture: a STARTER tenant with its month fully spent ── */
  {
    const quotaTenant =
      (await db.tenant.findUnique({ where: { slug: E2E_QUOTA_TENANT_SLUG } })) ??
      (await db.tenant.create({
        data: { name: "E2E Quota", slug: E2E_QUOTA_TENANT_SLUG, planCode: "STARTER", status: "ACTIVE" },
      }));

    const existing = await db.user.findUnique({ where: { email: E2E_QUOTA_USER_EMAIL } });
    const quotaUser = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: hashPassword(E2E_QUOTA_USER_PASSWORD),
            status: "ACTIVE",
            activeTenantId: quotaTenant.id,
          },
        })
      : await db.user.create({
          data: {
            email: E2E_QUOTA_USER_EMAIL,
            passwordHash: hashPassword(E2E_QUOTA_USER_PASSWORD),
            firstName: "Quinn",
            lastName: "Quota",
            role: "WORKSPACE_ADMIN",
            status: "ACTIVE",
            activeTenantId: quotaTenant.id,
          },
        });
    await db.member.upsert({
      where: { userId_tenantId: { userId: quotaUser.id, tenantId: quotaTenant.id } },
      create: { userId: quotaUser.id, tenantId: quotaTenant.id, role: "OWNER" },
      update: { role: "OWNER" },
    });

    // Refill the spent month on every seed run (createdAt defaults to now,
    // which is inside the current billing month the route counts).
    await db.envelope.deleteMany({ where: { tenantId: quotaTenant.id } });
    for (let i = 1; i <= E2E_QUOTA_FILLER; i++) {
      const n = String(i).padStart(3, "0");
      await db.envelope.create({
        data: {
          publicCode: `DOC-E2EQF${n}`,
          title: `Quota filler ${n}`,
          titleLower: `quota filler ${n}`,
          tenantId: quotaTenant.id,
          createdById: quotaUser.id,
          status: "SENT",
          message: "Fixture that spends the monthly quota.",
          pages: 1,
        },
      });
    }
    console.log(
      `quota fixture: ${E2E_QUOTA_USER_EMAIL} (STARTER, ${E2E_QUOTA_FILLER}/${E2E_QUOTA_FILLER} envelopes sent this month)`,
    );
  }

  /* ── Attested-verification fixture (remote "self-hosted instance") ── */
  // Simulates what the portal receiver stores after a real self-hosted push:
  // a TOFU-registered instance key + the minimal fingerprint for DOC-E2EATST.
  // The key pair and the signature are REAL (openssl RSA-2048 + SHA-256), so
  // the fixture is byte-equivalent to a production attestation.
  {
    // In the E2E environment this app plays BOTH roles (instance + portal), so
    // the api/evidence tests leave TOFU-registered loopback instances behind.
    // A fresh sweep keeps the portal tables deterministic; the Acme fixture
    // below is recreated immediately after.
    await db.portalAttestation.deleteMany({});
    await db.portalInstance.deleteMany({});
    // The portal's own append-only log is swept with the rest so every seed
    // cycle restarts the chain deterministically (dev/E2E posture — a real
    // portal never deletes log entries).
    await db.portalLogEntry.deleteMany({});

    await db.portalAttestation.deleteMany({ where: { code: E2E_ATTESTED_CODE } });

    const dir = await mkdtemp(join(tmpdir(), "docurama-seed-attest-"));
    try {
      const keyPath = join(dir, "key.pem");
      const certPath = join(dir, "cert.pem");
      await run("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "730", "-nodes",
        "-keyout", keyPath, "-out", certPath,
        "-subj", "/CN=Docurama Evidence Key - Acme Corp/O=Acme Corp/C=FR",
        "-addext", `subjectAltName=DNS:${E2E_ATTESTED_DOMAIN}`,
      ]);
      const pub = await run("openssl", ["x509", "-in", certPath, "-pubkey", "-noout"]);
      const [privateKeyPem, certificatePem] = await Promise.all([
        readFile(keyPath, "utf8"),
        readFile(certPath, "utf8"),
      ]);
      const thumbprint = createHash("sha256")
        .update(Buffer.from(certificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, ""), "base64"))
        .digest("hex");

      const sealedAt = new Date();
      const attestedDigest = createHash("sha256").update("docurama-e2e-attested-fixture").digest("hex");

      // The transparency claim a real instance at chain position 1 would push:
      // the entry commits to the exact fingerprint above and hashes consistently
      // (seq 1, genesis prevHead) — byte-equivalent to a production push.
      const tPayloadHash = commitmentHash({
        code: E2E_ATTESTED_CODE, sha256: attestedDigest, sealedAt: sealedAt.toISOString(),
        conformance: "B-T", pages: 4, signerCount: 2,
      });
      const tEntryHash = chainEntryHash({
        seq: 1, payloadHash: tPayloadHash, prevHead: GENESIS_HEAD, at: sealedAt.toISOString(),
      });

      const rawPayload = JSON.stringify({
        format: "docurama-attestation", version: 1,
        instance: { keyId: "ek_fixture_acme", label: "Acme Corp (self-hosted fixture)", verifiedDomain: E2E_ATTESTED_DOMAIN },
        envelope: {
          code: E2E_ATTESTED_CODE, sha256: attestedDigest,
          sealedAt: sealedAt.toISOString(), completedAt: sealedAt.toISOString(),
          conformance: "B-T", pages: 4, signerCount: 2,
        },
        publicKeyPem: pub.stdout.trim(), certificatePem: certificatePem.trim(), keyThumbprint: thumbprint,
        transparency: {
          format: TRANSPARENCY_FORMAT, seq: 1,
          payloadHash: tPayloadHash, prevHead: GENESIS_HEAD, entryHash: tEntryHash, at: sealedAt.toISOString(),
        },
      });

      const instance = await db.portalInstance.create({
        data: {
          keyThumbprint: thumbprint,
          label: "Acme Corp (self-hosted fixture)",
          verifiedDomain: E2E_ATTESTED_DOMAIN,
          certificatePem: certificatePem.trim(),
          publicKeyPem: pub.stdout.trim(),
          attestationCount: 1,
        },
      });
      await db.portalAttestation.create({
        data: {
          code: E2E_ATTESTED_CODE,
          sha256: attestedDigest,
          sealedAt,
          completedAt: sealedAt,
          conformance: "B-T",
          pages: 4,
          signerCount: 2,
          verifiedDomain: E2E_ATTESTED_DOMAIN,
          instanceThumbprint: instance.keyThumbprint,
          rawPayload,
          tSeq: 1,
          tEntryHash: tEntryHash,
        },
      });
      // Witness the fixture in the portal's own append-only log, exactly like
      // the receiver does for a live push — so /api/transparency/proof/DOC-E2EATST
      // serves a real, verifiable inclusion proof for the seeded code.
      const witnessed = await appendPortalLogEntry({
        code: E2E_ATTESTED_CODE,
        instanceThumbprint: instance.keyThumbprint,
        sha256: attestedDigest,
        instanceEntryHash: tEntryHash,
      });
      console.log(`attested fixture: ${E2E_ATTESTED_CODE} (instance "Acme Corp (self-hosted fixture)", domain ${E2E_ATTESTED_DOMAIN}, portal log entry #${witnessed.seq})`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /* ── Enterprise lead fixture (public enterprise-lead browser flow) ── */
  // The public form soft-throttles a repeat submission from the same address
  // for 10 minutes (src/app/api/enterprise-lead/route.ts) and answers 429, so
  // the browser flow submits a unique e2e-lead-<ts>@example.com each run.
  // Sweep the prefix here so those rows do not accumulate in a long-lived
  // database — the old Maestro runner never needed this because it started
  // from a fresh copy of db/custom.db every time.
  const leadsWiped = await db.enterpriseLead.deleteMany({ where: { email: { startsWith: E2E_LEAD_PREFIX } } });
  if (leadsWiped.count) console.log(`enterprise lead: cleared ${leadsWiped.count} prior ${E2E_LEAD_PREFIX}* submission(s)`);

  /* ── Summary ─────────────────────────────────────────────────────── */
  const envelopes = await db.envelope.count({ where: { tenantId: tenant.id } });
  console.log(`\nSeed OK — tenant ${tenant.slug} now holds ${envelopes} envelope(s).`);
  console.log(`E2E workspace login: ${E2E_USER_EMAIL} / ${E2E_USER_PASSWORD}`);
  console.log(`E2E admin login:     ${E2E_ADMIN_EMAIL} / ${E2E_ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
