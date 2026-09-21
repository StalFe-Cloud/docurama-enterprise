/**
 * Backfill EnterpriseLead.companyLower / contactNameLower.
 * Run with: bun scripts/backfill-lead-search.ts
 *
 * Those columns were added so lead search works on PostgreSQL: the admin query
 * lowercases the term, PostgreSQL LIKE is case-sensitive and SQLite's is not,
 * so matching against the raw columns found rows on SQLite and silently
 * returned nothing on PostgreSQL.
 *
 * Deployments upgrade with `prisma db push` (see docker-entrypoint.sh), which
 * adds the columns with their "" default rather than computing them — so rows
 * that predate the change are unsearchable until this runs. Idempotent: it
 * only touches rows whose folded value is missing or stale.
 */

import { db } from "../src/lib/db";
import { foldForSearch } from "../src/lib/search";

/** Recompute folded search columns for any lead that needs it. Returns the count fixed. */
export async function backfillLeadSearch(log: (msg: string) => void = () => {}): Promise<number> {
  const leads = await db.enterpriseLead.findMany({
    select: { id: true, company: true, contactName: true, companyLower: true, contactNameLower: true },
  });

  let fixed = 0;
  for (const lead of leads) {
    const companyLower = foldForSearch(lead.company);
    const contactNameLower = foldForSearch(lead.contactName);
    if (companyLower === lead.companyLower && contactNameLower === lead.contactNameLower) continue;
    await db.enterpriseLead.update({ where: { id: lead.id }, data: { companyLower, contactNameLower } });
    log(`  ✓ ${lead.company}`);
    fixed++;
  }
  return fixed;
}

async function main() {
  const fixed = await backfillLeadSearch((m) => console.log(m));
  console.log(`Backfill complete: ${fixed} lead(s) updated.`);
}

// Only when run directly — e2e/seed.ts imports backfillLeadSearch, and a bare
// main() at module scope would disconnect the client out from under the seed.
if (import.meta.main) {
  main()
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
