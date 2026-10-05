-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "consentSnapshot" TEXT;

-- AlterTable
ALTER TABLE "EsignPreferences" ALTER COLUMN "signatureLevel" SET DEFAULT 'simple';
