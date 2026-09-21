-- AlterTable
ALTER TABLE "MailOutbox" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "claimUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "paymentAnchorAt" TIMESTAMP(3),
ADD COLUMN     "usageAnchorAt" TIMESTAMP(3),
ADD COLUMN     "usagePeriodEnd" TIMESTAMP(3),
ADD COLUMN     "usagePeriodStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "claimUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "subjectUserId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "SecurityEvent" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "subjectUserId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "EnvelopeQuotaUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvelopeQuotaUsage_pkey" PRIMARY KEY ("id")
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

