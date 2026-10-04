import { expect, test, mock } from "bun:test";
import { Prisma, type EsignPreferences } from "@prisma/client";
import { ensureEsignPreferences, type PreferencesStore } from "../src/lib/esign-preferences";

const tenantId = "synthetic-preferences-tenant";
const winner: EsignPreferences = {
  id: "synthetic-prefs", tenantId, allowMultipleSignatures: false, flattenFormFields: false,
  filenameFormat: "Reviewed filename", sealOnCompletion: false, requireReauth: true,
  signatureLevel: "qualified", part11Mode: true, consentText: "Reviewed consent", consentVersion: "v7",
  updatedAt: new Date("2026-10-04T00:00:00Z"),
};
const conflict = (target: unknown = ["tenantId"]) => new Prisma.PrismaClientKnownRequestError("synthetic conflict", {
  code: "P2002", clientVersion: "synthetic", meta: { modelName: "EsignPreferences", target },
});
const store = (write: () => Promise<EsignPreferences>, read: () => Promise<EsignPreferences | null>) => {
  const upsert = mock((args: Prisma.EsignPreferencesUpsertArgs) => { void args; return write(); });
  const findUnique = mock((args: Prisma.EsignPreferencesFindUniqueArgs) => { void args; return read(); });
  return { delegate: { upsert, findUnique } as unknown as PreferencesStore, upsert, findUnique };
};

test("normal lazy preference read preserves existing security policy and never rewrites it", async () => {
  const fixture = store(async () => winner, async () => null);
  expect(await ensureEsignPreferences(tenantId, fixture.delegate)).toBe(winner);
  expect(fixture.upsert.mock.calls[0]).toEqual([{ where: { tenantId }, update: {}, create: { tenantId } }]);
  expect(fixture.findUnique).not.toHaveBeenCalled();
});

test("first-use tenant conflict returns winner's exact persisted policy for the requested tenant", async () => {
  const fixture = store(async () => { throw conflict(); }, async () => winner);
  expect(await ensureEsignPreferences(tenantId, fixture.delegate)).toBe(winner);
  expect(fixture.findUnique.mock.calls[0]).toEqual([{ where: { tenantId } }]);
  expect(fixture.upsert).toHaveBeenCalledTimes(1);
});

test("the exact named tenant constraint is supported without broad substring matching", async () => {
  const fixture = store(async () => { throw conflict("EsignPreferences_tenantId_key"); }, async () => winner);
  expect(await ensureEsignPreferences(tenantId, fixture.delegate)).toBe(winner);
});

test("missing winner preserves the original unique error", async () => {
  const error = conflict();
  const fixture = store(async () => { throw error; }, async () => null);
  await expect(ensureEsignPreferences(tenantId, fixture.delegate)).rejects.toBe(error);
});

test("fallback read failures remain errors rather than fabricated default preferences", async () => {
  const error = new Error("synthetic database read failure");
  const fixture = store(async () => { throw conflict(); }, async () => { throw error; });
  await expect(ensureEsignPreferences(tenantId, fixture.delegate)).rejects.toBe(error);
});

test("other constraints, missing metadata, foreign-key failures and error lookalikes are not swallowed", async () => {
  for (const error of [conflict(["id"]), conflict(["tenantId", "id"]), conflict("unrelated_tenantId_key"),
    conflict(null), new Prisma.PrismaClientKnownRequestError("synthetic foreign key", { code: "P2003", clientVersion: "synthetic" }),
    { code: "P2002", meta: { target: ["tenantId"] } }, new Error("synthetic socket timeout")]) {
    const fixture = store(async () => { throw error; }, async () => winner);
    await expect(ensureEsignPreferences(tenantId, fixture.delegate)).rejects.toBe(error);
    expect(fixture.findUnique).not.toHaveBeenCalled();
  }
});
