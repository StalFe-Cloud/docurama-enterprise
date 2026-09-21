-- AlterTable
ALTER TABLE "MailOutbox" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "MailOutbox" ADD COLUMN "claimUntil" DATETIME;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "paymentAnchorAt" DATETIME;
ALTER TABLE "Subscription" ADD COLUMN "usageAnchorAt" DATETIME;
ALTER TABLE "Subscription" ADD COLUMN "usagePeriodEnd" DATETIME;
ALTER TABLE "Subscription" ADD COLUMN "usagePeriodStart" DATETIME;

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN "claimUntil" DATETIME;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "subjectUserId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "SecurityEvent" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "SecurityEvent" ADD COLUMN "subjectUserId" TEXT;
ALTER TABLE "SecurityEvent" ADD COLUMN "tenantId" TEXT;

-- CreateTable
CREATE TABLE "EnvelopeQuotaUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "EnvelopeQuotaUsage_tenantId_periodKey_idx" ON "EnvelopeQuotaUsage"("tenantId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeQuotaUsage_tenantId_periodKey_key" ON "EnvelopeQuotaUsage"("tenantId", "periodKey");

-- CreateIndex
CREATE INDEX "MailOutbox_claimUntil_idx" ON "MailOutbox"("claimUntil");

-- CreateIndex
CREATE INDEX "WebhookDelivery_claimUntil_idx" ON "WebhookDelivery"("claimUntil");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_at_idx" ON "AuditEvent"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_subjectUserId_at_idx" ON "AuditEvent"("subjectUserId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_at_idx" ON "AuditEvent"("tenantId", "at");

-- CreateIndex
CREATE INDEX "SecurityEvent_actorUserId_at_idx" ON "SecurityEvent"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "SecurityEvent_subjectUserId_at_idx" ON "SecurityEvent"("subjectUserId", "at");

-- CreateIndex
CREATE INDEX "SecurityEvent_tenantId_at_idx" ON "SecurityEvent"("tenantId", "at");

