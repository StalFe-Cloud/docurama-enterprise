ALTER TABLE "Recipient" ADD COLUMN "locale" TEXT;
ALTER TABLE "MailOutbox" ADD COLUMN "envelopeId" TEXT;
ALTER TABLE "MailOutbox" ADD COLUMN "recipientId" TEXT;
CREATE INDEX "MailOutbox_envelopeId_recipientId_idx" ON "MailOutbox"("envelopeId", "recipientId");
