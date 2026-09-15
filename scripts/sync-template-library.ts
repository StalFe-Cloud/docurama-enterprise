/**
 * Synchronize the French legal template library into the database.
 * Run with: bun scripts/sync-template-library.ts
 */

import { db } from "../src/lib/db";
import { foldForSearch } from "../src/lib/search";
import { FRENCH_LEGAL_TEMPLATES } from "../src/lib/templates/fr";

async function main() {
  console.log(`Syncing ${FRENCH_LEGAL_TEMPLATES.length} French legal templates to database...`);

  for (const t of FRENCH_LEGAL_TEMPLATES) {
    const existing = await db.template.findFirst({
      where: { libraryKey: t.libraryKey },
    });

    const data = {
      tenantId: null,
      name: t.name,
      nameLower: foldForSearch(t.name),
      description: t.description,
      category: t.category,
      folder: t.folder,
      pages: t.pages,
      locale: t.locale,
      jurisdiction: t.jurisdiction,
      version: t.version,
      sourceNotes: t.sourceNotes,
      bodyMarkdown: t.bodyMarkdown,
      fields: JSON.stringify(t.fields),
      isBuiltIn: true,
      publicSlug: t.libraryKey,
    };

    if (existing) {
      await db.template.update({
        where: { id: existing.id },
        data,
      });
      console.log(`  ✓ Updated: ${t.name} (${t.libraryKey})`);
    } else {
      await db.template.create({
        data: {
          ...data,
          libraryKey: t.libraryKey,
        },
      });
      console.log(`  ✓ Created: ${t.name} (${t.libraryKey})`);
    }
  }

  const count = await db.template.count({ where: { isBuiltIn: true } });
  console.log(`\nSynchronization complete! ${count} built-in template(s) present in database.`);
}

main()
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
