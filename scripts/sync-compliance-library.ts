/**
 * Synchronize the Compliance Document library into the database.
 * Run with: bun scripts/sync-compliance-library.ts
 */

import { db } from "../src/lib/db";
import { COMPLIANCE_DOCUMENTS_SEED } from "../src/lib/compliance-library";

async function main() {
  console.log(`Syncing ${COMPLIANCE_DOCUMENTS_SEED.length} compliance documents into database...`);

  for (const doc of COMPLIANCE_DOCUMENTS_SEED) {
    const existing = await db.complianceDocument.findUnique({
      where: { key: doc.key },
    });

    if (existing) {
      const updated = await db.complianceDocument.update({
        where: { id: existing.id },
        data: {
          title: doc.title,
          category: doc.category,
          owner: doc.owner,
          status: doc.status,
          version: doc.version,
          locale: doc.locale,
          summary: doc.summary,
          isPublic: doc.isPublic,
          controlRefs: doc.controlRefs,
          bodyMarkdown: doc.bodyMarkdown,
        },
      });

      // Add a version entry if body changed
      if (existing.bodyMarkdown !== doc.bodyMarkdown || existing.version !== doc.version) {
        await db.complianceDocumentVersion.create({
          data: {
            documentId: updated.id,
            version: doc.version,
            bodyMarkdown: doc.bodyMarkdown,
            changedBy: "System Sync",
            changeNote: `Synchronized version ${doc.version}`,
          },
        });
      }

      console.log(`  ✓ Updated: ${doc.title} (${doc.key})`);
    } else {
      const created = await db.complianceDocument.create({
        data: {
          key: doc.key,
          title: doc.title,
          category: doc.category,
          owner: doc.owner,
          status: doc.status,
          version: doc.version,
          locale: doc.locale,
          summary: doc.summary,
          isPublic: doc.isPublic,
          controlRefs: doc.controlRefs,
          bodyMarkdown: doc.bodyMarkdown,
          effectiveFrom: new Date(),
          approvedBy: "CISO / DPO",
          approvedAt: new Date(),
        },
      });

      await db.complianceDocumentVersion.create({
        data: {
          documentId: created.id,
          version: doc.version,
          bodyMarkdown: doc.bodyMarkdown,
          changedBy: "System Init",
          changeNote: "Initial seeding from compliance library",
        },
      });

      console.log(`  ✓ Created: ${doc.title} (${doc.key})`);
    }
  }

  const count = await db.complianceDocument.count();
  console.log(`\nCompliance library sync finished! ${count} documents in database.`);
}

main()
  .catch((err) => {
    console.error("Compliance sync failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
