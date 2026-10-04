import { Prisma, type PrismaClient } from "@prisma/client";

export type PreferencesStore = Pick<PrismaClient["esignPreferences"], "upsert" | "findUnique">;

function tenantCreationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return (Array.isArray(target) && target.length === 1 && target[0] === "tenantId") ||
    target === "EsignPreferences_tenantId_key";
}

/** Concurrent first reads can both attempt Prisma's empty-update upsert create.
 * Recover only the tenant's unique creation race, using its persisted policy.
 * Never replace security/consent settings or invent defaults after an error. */
export async function ensureEsignPreferences(tenantId: string, store: PreferencesStore) {
  try {
    return await store.upsert({ where: { tenantId }, update: {}, create: { tenantId } });
  } catch (error) {
    if (!tenantCreationConflict(error)) throw error;
    const winner = await store.findUnique({ where: { tenantId } });
    if (!winner) throw error;
    return winner;
  }
}
