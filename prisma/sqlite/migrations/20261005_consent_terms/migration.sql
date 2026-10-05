-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN "consentSnapshot" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EsignPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "allowMultipleSignatures" BOOLEAN NOT NULL DEFAULT true,
    "flattenFormFields" BOOLEAN NOT NULL DEFAULT true,
    "filenameFormat" TEXT NOT NULL DEFAULT '{title} - {signer} ({date})',
    "sealOnCompletion" BOOLEAN NOT NULL DEFAULT true,
    "requireReauth" BOOLEAN NOT NULL DEFAULT false,
    "signatureLevel" TEXT NOT NULL DEFAULT 'simple',
    "part11Mode" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT,
    "consentVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EsignPreferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EsignPreferences" ("allowMultipleSignatures", "consentText", "consentVersion", "filenameFormat", "flattenFormFields", "id", "part11Mode", "requireReauth", "sealOnCompletion", "signatureLevel", "tenantId", "updatedAt") SELECT "allowMultipleSignatures", "consentText", "consentVersion", "filenameFormat", "flattenFormFields", "id", "part11Mode", "requireReauth", "sealOnCompletion", "signatureLevel", "tenantId", "updatedAt" FROM "EsignPreferences";
DROP TABLE "EsignPreferences";
ALTER TABLE "new_EsignPreferences" RENAME TO "EsignPreferences";
CREATE UNIQUE INDEX "EsignPreferences_tenantId_key" ON "EsignPreferences"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
