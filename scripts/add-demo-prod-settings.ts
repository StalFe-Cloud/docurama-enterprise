/**
 * Demo/QA data for the production-settings release:
 *  - Alex (workspace admin demo) gets a second organization (multi-company demo)
 *  - Northwind gets a pending sending domain for the DNS verification flow
 *  - Northwind gets one ISSUED+ACTIVE signing certificate (real OpenSSL RSA-2048)
 *  - One active Northwind envelope gets autoRemind enabled (reminder-job demo)
 *
 * Idempotent: safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { issueSigningCertificate } from "../src/lib/certificates";

const db = new PrismaClient();

async function main() {
  const alex = await db.user.findUnique({ where: { email: "alex@northwind.example" } });
  if (!alex) throw new Error("Demo user alex@northwind.example not found — run prisma db seed first");
  const northwind = await db.tenant.findUnique({ where: { slug: "northwind" } });
  if (!northwind) throw new Error("Tenant northwind not found");

  // ── 1. Second organization for Alex ──
  const aurora = await db.tenant.findUnique({ where: { slug: "aurora-legal" } });
  if (!aurora) throw new Error("Tenant aurora-legal not found");
  const existing = await db.member.findFirst({ where: { userId: alex.id, tenantId: aurora.id } });
  if (existing) {
    console.log("Alex is already a member of Aurora Legal — skipping");
  } else {
    await db.member.create({ data: { userId: alex.id, tenantId: aurora.id, role: "ADMIN", status: "ACTIVE" } });
    console.log("Added Alex to Aurora Legal LLP as workspace admin (second organization)");
  }

  // ── 2. Pending sending domain for the DNS verification flow ──
  const existingDomain = await db.domain.findFirst({
    where: { tenantId: northwind.id, purpose: "SENDING" },
  });
  if (existingDomain) {
    console.log("Sending domain already present — skipping");
  } else {
    await db.domain.create({
      data: {
        tenantId: northwind.id,
        domain: "mail.northwind.example",
        purpose: "SENDING",
        method: "TXT",
        token: randomBytes(16).toString("hex"),
        status: "PENDING",
      },
    });
    console.log("Added pending sending domain mail.northwind.example for Northwind");
  }

  // ── 3. One issued + active signing certificate (real OpenSSL issuance) ──
  const existingCert = await db.signingCertificate.findFirst({
    where: { tenantId: northwind.id, status: "ACTIVE" },
  });
  if (existingCert) {
    console.log("Active signing certificate already present — skipping");
  } else {
    const passphrase = randomBytes(12).toString("hex"); // demo passphrase, discarded
    const issued = await issueSigningCertificate({
      commonName: "Northwind Signing 2026",
      organization: "Northwind Logistics",
      email: "legal@northwind.example",
      days: 365,
      purpose: "signing",
      passphrase,
    });
    await db.signingCertificate.create({
      data: {
        tenantId: northwind.id,
        userId: alex.id,
        commonName: "Northwind Signing 2026",
        organization: "Northwind Logistics",
        email: "legal@northwind.example",
        serialNumber: issued.serialNumber,
        thumbprint: issued.thumbprint,
        issuer: issued.issuer,
        keyAlgorithm: "RSA-2048",
        signatureAlgorithm: "SHA-256",
        notBefore: issued.notBefore,
        notAfter: issued.notAfter,
        status: "ACTIVE",
        purpose: "signing",
        validityDays: 365,
        pkcs12Base64: issued.pkcs12Base64,
        certificatePem: issued.certificatePem,
      },
    });
    console.log(`Issued + activated signing certificate (serial ${issued.serialNumber.slice(0, 12)}…) — demo passphrase discarded, .p12 downloadable from Settings → eSign`);
  }

  // ── 4. One auto-remind envelope for the reminder-job demo ──
  const candidate = await db.envelope.findFirst({
    where: { tenantId: northwind.id, status: { in: ["SENT", "PARTIALLY_SIGNED"] }, autoRemind: false },
    orderBy: { createdAt: "asc" },
  });
  if (candidate) {
    await db.envelope.update({ where: { id: candidate.id }, data: { autoRemind: true } });
    console.log(`Enabled auto-remind on ${candidate.publicCode} (${candidate.title})`);
  } else {
    console.log("No active envelope without autoRemind — skipping");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
