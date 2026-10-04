-- Additive: existing queued mail retains its plain-text fallback.
ALTER TABLE "MailOutbox" ADD COLUMN "bodyHtml" TEXT;
