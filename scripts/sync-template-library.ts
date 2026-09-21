/**
 * Synchronize the French legal template library into the database.
 * Run with: bun scripts/sync-template-library.ts
 *
 * The library is the source of truth for the statutory built-in templates
 * (isBuiltIn, tenantId null). They previously reached a database only via the
 * committed demo database, so any fresh one — every PostgreSQL deployment, and
 * CI's postgres job — had none, leaving the public /modeles-de-contrats
 * catalogue and the workspace template list empty. e2e/seed.ts now calls
 * syncTemplateLibrary() so the fixtures have one source rather than a binary
 * the suite happens to start from.
 */

import { db } from "../src/lib/db";
import { foldForSearch } from "../src/lib/search";
import { FRENCH_LEGAL_TEMPLATES } from "../src/lib/templates/fr";

/** Upsert every library template. Idempotent; safe to re-run. */
export async function syncTemplateLibrary(log: (msg: string) => void = () => {}): Promise<number> {
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
      log(`  ✓ Updated: ${t.name} (${t.libraryKey})`);
    } else {
      await db.template.create({
        data: {
          ...data,
          libraryKey: t.libraryKey,
        },
      });
      log(`  ✓ Created: ${t.name} (${t.libraryKey})`);
    }
  }

  return db.template.count({ where: { isBuiltIn: true } });
}

async function main() {
  console.log(`Syncing ${FRENCH_LEGAL_TEMPLATES.length} French legal templates to database...`);
  const count = await syncTemplateLibrary((m) => console.log(m));
  console.log(`
Synchronization complete! ${count} built-in template(s) present in database.`);
}

// Only when run directly. e2e/seed.ts imports syncTemplateLibrary, and a
// bare main() at module scope would run the sync and then disconnect the
// client out from under the rest of the seed.
if (import.meta.main) {
  main()
    .catch((err) => {
      console.error("Sync failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}