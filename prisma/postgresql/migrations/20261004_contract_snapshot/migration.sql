-- Nullable by design: historical terms cannot be reconstructed automatically.
ALTER TABLE "Envelope" ADD COLUMN "contractSnapshot" TEXT;
