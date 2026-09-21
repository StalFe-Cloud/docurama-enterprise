-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureName" TEXT,
    "signatureStyle" TEXT DEFAULT 'signature-font-caveat',
    "activeTenantId" TEXT,
    "totpSecret" TEXT,
    "totpPendingSecret" TEXT,
    "totpRecoveryCodes" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "onboardingJson" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SIGNUP',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoTransaction" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '2FA_LOGIN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSignature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'signature',
    "method" TEXT NOT NULL DEFAULT 'draw',
    "value" TEXT NOT NULL,
    "font" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL DEFAULT 'Docurama Sign <notifications@docurama.eu>',
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "bodyText" TEXT NOT NULL,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "planCode" TEXT NOT NULL DEFAULT 'STARTER',
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "suspendedReason" TEXT,
    "billingEmail" TEXT,
    "storageUsedMb" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "enforceTwoFactor" BOOLEAN NOT NULL DEFAULT false,
    "industry" TEXT,
    "companySize" TEXT,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleLower" TEXT NOT NULL DEFAULT '',
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "documentId" TEXT,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "message" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "conformanceLevel" TEXT,
    "sha256" TEXT,
    "sealedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRemindedAt" TIMESTAMP(3),
    "autoRemind" BOOLEAN NOT NULL DEFAULT false,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedSenderDomain" TEXT,
    "attestedAt" TIMESTAMP(3),
    "attestStatus" TEXT,

    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SIGNER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 1,
    "authMethod" TEXT NOT NULL DEFAULT 'EMAIL',
    "signedAt" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeEvent" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "EnvelopeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "folder" TEXT NOT NULL DEFAULT 'All templates',
    "pages" INTEGER NOT NULL DEFAULT 1,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "publicSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'en',
    "jurisdiction" TEXT,
    "bodyMarkdown" TEXT,
    "fields" TEXT,
    "libraryKey" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "sourceNotes" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT NOT NULL,
    "hasTextLayer" BOOLEAN NOT NULL DEFAULT false,
    "ocrStatus" TEXT NOT NULL DEFAULT 'NONE',
    "ocrConfidence" DOUBLE PRECISION,
    "ocrError" TEXT,
    "extractedText" TEXT,
    "detectedFields" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "hasText" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" DOUBLE PRECISION,
    "charCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'TXT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'JOIN',
    "verifiedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckNote" TEXT,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'RSA-2048',
    "certificatePem" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "privateKeyPem" TEXT NOT NULL,
    "thumbprint" TEXT NOT NULL,
    "sanDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalInstance" (
    "id" TEXT NOT NULL,
    "keyThumbprint" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "verifiedDomain" TEXT,
    "certificatePem" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attestationCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortalInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAttestation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "conformance" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "signerCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedDomain" TEXT,
    "instanceThumbprint" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" TEXT NOT NULL,
    "tSeq" INTEGER,
    "tEntryHash" TEXT,

    CONSTRAINT "PortalAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransparencyEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "envelopeId" TEXT,
    "publicCode" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "prevHead" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransparencyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalLogEntry" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "instanceThumbprint" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "instanceEntryHash" TEXT,
    "prevHead" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalKey" (
    "id" TEXT NOT NULL DEFAULT 'portal',
    "algorithm" TEXT NOT NULL DEFAULT 'RSA-2048',
    "publicKeyPem" TEXT NOT NULL,
    "privateKeyPem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RekorWitness" (
    "id" TEXT NOT NULL DEFAULT 'portal-key',
    "subject" TEXT NOT NULL DEFAULT 'portal-key',
    "keyFingerprint" TEXT NOT NULL,
    "rekorUrl" TEXT NOT NULL,
    "entryUUID" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "treeSize" INTEGER,
    "integratedTime" TIMESTAMP(3) NOT NULL,
    "statement" TEXT NOT NULL,
    "statementHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "inclusionProof" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RekorWitness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commonName" TEXT NOT NULL,
    "organization" TEXT,
    "email" TEXT,
    "serialNumber" TEXT NOT NULL,
    "thumbprint" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "keyAlgorithm" TEXT NOT NULL DEFAULT 'RSA-2048',
    "signatureAlgorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "notBefore" TIMESTAMP(3) NOT NULL,
    "notAfter" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL DEFAULT 'signing',
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "pkcs12Base64" TEXT,
    "certificatePem" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TsaConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT 'https://timestamp.digicert.com',
    "hashAlgorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "authType" TEXT NOT NULL DEFAULT 'none',
    "username" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestLatencyMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TsaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignPreferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allowMultipleSignatures" BOOLEAN NOT NULL DEFAULT true,
    "flattenFormFields" BOOLEAN NOT NULL DEFAULT true,
    "filenameFormat" TEXT NOT NULL DEFAULT '{title} - {signer} ({date})',
    "sealOnCompletion" BOOLEAN NOT NULL DEFAULT true,
    "requireReauth" BOOLEAN NOT NULL DEFAULT false,
    "signatureLevel" TEXT NOT NULL DEFAULT 'advanced',
    "part11Mode" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT,
    "consentVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFrom" TEXT NOT NULL DEFAULT 'Docurama Sign <notifications@docurama.eu>',
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpLastTestAt" TIMESTAMP(3),
    "smtpLastTestStatus" TEXT,
    "alertOnSent" BOOLEAN NOT NULL DEFAULT true,
    "alertOnViewed" BOOLEAN NOT NULL DEFAULT true,
    "alertOnSigned" BOOLEAN NOT NULL DEFAULT true,
    "alertOnCompleted" BOOLEAN NOT NULL DEFAULT true,
    "alertOnDeclined" BOOLEAN NOT NULL DEFAULT false,
    "dailyDigest" BOOLEAN NOT NULL DEFAULT false,
    "digestTime" TEXT NOT NULL DEFAULT '09:00',
    "reminderMode" TEXT NOT NULL DEFAULT 'manual',
    "reminderIntervalDays" INTEGER NOT NULL DEFAULT 3,
    "reminderMaxCount" INTEGER NOT NULL DEFAULT 5,
    "quietHoursStart" TEXT NOT NULL DEFAULT '21:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
    "skipWeekends" BOOLEAN NOT NULL DEFAULT true,
    "escalateToSms" BOOLEAN NOT NULL DEFAULT false,
    "escalateAfterDays" INTEGER NOT NULL DEFAULT 7,
    "reminderJobLastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsGateway" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "senderId" TEXT NOT NULL DEFAULT 'DOCURAMA',
    "lowCostMode" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappProvider" TEXT,
    "whatsappApiKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestTo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "transport" TEXT NOT NULL DEFAULT 'streamable-http',
    "allowedTools" TEXT NOT NULL DEFAULT 'envelope_list,document_verify,template_list',
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyEur" INTEGER NOT NULL,
    "seatLimit" INTEGER NOT NULL,
    "envelopeLimit" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "apiAccess" BOOLEAN NOT NULL DEFAULT false,
    "slaUptime" TEXT NOT NULL DEFAULT '99.5%',
    "support" TEXT NOT NULL,
    "features" TEXT NOT NULL,
    "outcomes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mrrEur" INTEGER NOT NULL DEFAULT 0,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "renewalAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'SEPA ••4291',
    "lastInvoiceAt" TIMESTAMP(3),
    "failedPayment" BOOLEAN NOT NULL DEFAULT false,
    "termMonths" INTEGER NOT NULL DEFAULT 1,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "carriedForwardEnvelopes" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT DEFAULT 'manual',
    "providerRef" TEXT,
    "seatLimitOverride" INTEGER,
    "envelopeLimitOverride" INTEGER,
    "monthlyEurOverride" INTEGER,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "termMonths" INTEGER NOT NULL DEFAULT 1,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "approverNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "protocol" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "issuerUrl" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "idpMetadataXml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseLead" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "companyLower" TEXT NOT NULL DEFAULT '',
    "contactNameLower" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 0,
    "monthlyEnvelopes" INTEGER NOT NULL DEFAULT 0,
    "requirements" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "convertedTenantId" TEXT,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsarRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "subjectEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DsarRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmcaNotice" (
    "id" TEXT NOT NULL,
    "complainant" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "works" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'NORMAL',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "DmcaNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Control" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "framework" TEXT NOT NULL DEFAULT 'SOC 2',
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPLEMENTED',
    "owner" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),

    CONSTRAINT "Control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'DELETE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSweepAt" TIMESTAMP(3),

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "subjectEmail" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'signup',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'SEV3',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "findings" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL DEFAULT 'MEDIUM',
    "impact" TEXT NOT NULL DEFAULT 'MEDIUM',
    "score" INTEGER NOT NULL DEFAULT 9,
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "owner" TEXT NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "description" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decisionAt" TIMESTAMP(3),

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "dpdSigned" BOOLEAN NOT NULL DEFAULT false,
    "lastAuditAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'APPROVED',

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreDrill" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "rtoTarget" TEXT NOT NULL,
    "rtoActual" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PASS',
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "RestoreDrill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subprocessor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "dpaSigned" BOOLEAN NOT NULL DEFAULT true,
    "transferMechanism" TEXT NOT NULL DEFAULT 'SCC',

    CONSTRAINT "Subprocessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Policy',
    "owner" TEXT NOT NULL DEFAULT 'Security',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "summary" TEXT,
    "bodyMarkdown" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "controlRefs" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'READONLY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "secretMasked" TEXT NOT NULL,
    "successRate" INTEGER NOT NULL DEFAULT 100,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "secret" TEXT,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "nextAttemptAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "tenantName" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "ip" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "actor" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "envelopesCreated" INTEGER NOT NULL DEFAULT 0,
    "envelopesSealed" INTEGER NOT NULL DEFAULT 0,
    "signersActive" INTEGER NOT NULL DEFAULT 0,
    "activeTenants" INTEGER NOT NULL DEFAULT 0,
    "mrrEur" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "smtpHost" TEXT NOT NULL DEFAULT 'smtp.eu.mailprovider.io',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL DEFAULT 'notifications@docurama.eu',
    "smtpFrom" TEXT NOT NULL DEFAULT 'Docurama Sign <notifications@docurama.eu>',
    "smtpTls" BOOLEAN NOT NULL DEFAULT true,
    "tsaUrl" TEXT NOT NULL DEFAULT 'https://timestamp.digicert.com',
    "tsaReachable" BOOLEAN NOT NULL DEFAULT true,
    "certFingerprint" TEXT NOT NULL DEFAULT '3A:F2:88:1B:6C:9E:44:D0:A7:2E:5F:B1:C3:98:0D:64:71:AA:29:5C',
    "certExpiryAt" TIMESTAMP(3) NOT NULL,
    "signingConformance" TEXT NOT NULL DEFAULT 'B-LT',
    "trialLengthDays" INTEGER NOT NULL DEFAULT 14,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "featureFlags" TEXT NOT NULL DEFAULT '{"smsDelivery":true,"bulkSend":true,"webhooks":true,"passkeys":true,"aiFieldDetect":false,"euResidencyOnly":false}',
    "provisioningState" TEXT NOT NULL DEFAULT '{}',
    "sweeperLastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queueDepth" INTEGER NOT NULL DEFAULT 3,
    "apiReplicas" INTEGER NOT NULL DEFAULT 2,
    "diskUsedPct" INTEGER NOT NULL DEFAULT 41,
    "lastDeployAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT NOT NULL DEFAULT '4.2.1',
    "auditChainSealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditChainBlockHeight" INTEGER NOT NULL DEFAULT 1842,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerification_userId_idx" ON "EmailVerification"("userId");

-- CreateIndex
CREATE INDEX "SsoTransaction_expiresAt_idx" ON "SsoTransaction"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "UserSignature_userId_idx" ON "UserSignature"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_status_idx" ON "Invitation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MailOutbox_toEmail_idx" ON "MailOutbox"("toEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_tenantId_key" ON "Member"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tenantId_name_key" ON "Team"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_publicCode_key" ON "Envelope"("publicCode");

-- CreateIndex
CREATE INDEX "Envelope_tenantId_createdAt_idx" ON "Envelope"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Envelope_tenantId_titleLower_idx" ON "Envelope"("tenantId", "titleLower");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_accessToken_key" ON "Recipient"("accessToken");

-- CreateIndex
CREATE INDEX "Recipient_envelopeId_idx" ON "Recipient"("envelopeId");

-- CreateIndex
CREATE INDEX "EnvelopeEvent_envelopeId_at_idx" ON "EnvelopeEvent"("envelopeId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Template_publicSlug_key" ON "Template"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Template_libraryKey_key" ON "Template"("libraryKey");

-- CreateIndex
CREATE INDEX "Template_locale_isBuiltIn_idx" ON "Template"("locale", "isBuiltIn");

-- CreateIndex
CREATE INDEX "Template_tenantId_nameLower_idx" ON "Template"("tenantId", "nameLower");

-- CreateIndex
CREATE INDEX "Document_tenantId_createdAt_idx" ON "Document"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceKey_tenantId_key" ON "EvidenceKey"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceKey_keyId_key" ON "EvidenceKey"("keyId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInstance_keyThumbprint_key" ON "PortalInstance"("keyThumbprint");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAttestation_code_key" ON "PortalAttestation"("code");

-- CreateIndex
CREATE INDEX "PortalAttestation_instanceThumbprint_idx" ON "PortalAttestation"("instanceThumbprint");

-- CreateIndex
CREATE INDEX "TransparencyEntry_tenantId_seq_idx" ON "TransparencyEntry"("tenantId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "TransparencyEntry_tenantId_seq_key" ON "TransparencyEntry"("tenantId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "TransparencyEntry_tenantId_envelopeId_payloadHash_key" ON "TransparencyEntry"("tenantId", "envelopeId", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "PortalLogEntry_seq_key" ON "PortalLogEntry"("seq");

-- CreateIndex
CREATE INDEX "PortalLogEntry_code_idx" ON "PortalLogEntry"("code");

-- CreateIndex
CREATE INDEX "PortalLogEntry_seq_idx" ON "PortalLogEntry"("seq");

-- CreateIndex
CREATE INDEX "SigningCertificate_tenantId_idx" ON "SigningCertificate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TsaConfig_tenantId_key" ON "TsaConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EsignPreferences_tenantId_key" ON "EsignPreferences"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_tenantId_key" ON "NotificationSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsGateway_tenantId_key" ON "SmsGateway"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "McpConfig_tenantId_key" ON "McpConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCustomer_tenantId_provider_key" ON "PaymentCustomer"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "SsoConnection_emailDomain_status_idx" ON "SsoConnection"("emailDomain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SsoConnection_protocol_emailDomain_key" ON "SsoConnection"("protocol", "emailDomain");

-- CreateIndex
CREATE INDEX "EnterpriseLead_convertedTenantId_idx" ON "EnterpriseLead"("convertedTenantId");

-- CreateIndex
CREATE INDEX "EnterpriseLead_companyLower_idx" ON "EnterpriseLead"("companyLower");

-- CreateIndex
CREATE UNIQUE INDEX "Control_ref_key" ON "Control"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_key_key" ON "ComplianceDocument"("key");

-- CreateIndex
CREATE INDEX "ComplianceDocument_status_category_idx" ON "ComplianceDocument"("status", "category");

-- CreateIndex
CREATE INDEX "ComplianceDocumentVersion_documentId_createdAt_idx" ON "ComplianceDocumentVersion"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_success_attempts_nextAttemptAt_idx" ON "WebhookDelivery"("success", "attempts", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_date_key" ON "DailyStat"("date");

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSignature" ADD CONSTRAINT "UserSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeEvent" ADD CONSTRAINT "EnvelopeEvent_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceKey" ADD CONSTRAINT "EvidenceKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAttestation" ADD CONSTRAINT "PortalAttestation_instanceThumbprint_fkey" FOREIGN KEY ("instanceThumbprint") REFERENCES "PortalInstance"("keyThumbprint") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransparencyEntry" ADD CONSTRAINT "TransparencyEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningCertificate" ADD CONSTRAINT "SigningCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TsaConfig" ADD CONSTRAINT "TsaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignPreferences" ADD CONSTRAINT "EsignPreferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsGateway" ADD CONSTRAINT "SmsGateway_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConfig" ADD CONSTRAINT "McpConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCustomer" ADD CONSTRAINT "PaymentCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoConnection" ADD CONSTRAINT "SsoConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocumentVersion" ADD CONSTRAINT "ComplianceDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

