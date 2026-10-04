import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

type Upload = { storageKey: string; byteSize: number; sha256: string };
/** Only called with the retention suite's disposable Prisma client. */
export async function createRetentionFixture(db: PrismaClient, tenantId: string,
  orphanId: string, orphan: Upload, evidenceId: string, evidence: Upload) {
  const key = randomUUID();
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { id: tenantId, name: "Synthetic S3 retention", slug: `s3-retention-${key}` } });
    const user = await tx.user.create({ data: { email: `s3-retention-${key}@example.invalid`, passwordHash: "synthetic-no-login",
      firstName: "Retention", lastName: "Fixture" } });
    const member = await tx.member.create({ data: { tenantId: tenant.id, userId: user.id } });
    for (const [id, upload, filename] of [[orphanId, orphan, "orphan.pdf"], [evidenceId, evidence, "evidence.pdf"]] as const) {
      await tx.document.create({ data: { id, tenantId: tenant.id, uploadedById: user.id, filename,
        storageKey: upload.storageKey, byteSize: upload.byteSize, sha256: upload.sha256, mimeType: "application/pdf", pageCount: 1 } });
    }
    const envelope = await tx.envelope.create({ data: { publicCode: `S3-${key}`, title: "Synthetic retained evidence",
      tenantId: tenant.id, createdById: user.id, documentId: evidenceId } });
    return { tenantId: tenant.id, userId: user.id, memberId: member.id, envelopeId: envelope.id, documentIds: [orphanId, evidenceId] };
  });
}

export async function deleteRetentionFixture(db: PrismaClient, fixture: Awaited<ReturnType<typeof createRetentionFixture>>) {
  await db.$transaction(async (tx) => {
    await tx.envelope.delete({ where: { id: fixture.envelopeId } });
    await tx.document.deleteMany({ where: { id: { in: fixture.documentIds }, tenantId: fixture.tenantId } });
    await tx.member.delete({ where: { id: fixture.memberId } });
    await tx.tenant.delete({ where: { id: fixture.tenantId } });
    await tx.user.delete({ where: { id: fixture.userId } });
  });
}
