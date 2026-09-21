-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureName" TEXT,
    "signatureStyle" TEXT DEFAULT 'signature-font-caveat',
    "activeTenantId" TEXT,
    "totpSecret" TEXT,
    "totpPendingSecret" TEXT,
    "totpRecoveryCodes" TEXT,
    "passwordChangedAt" DATETIME,
    "emailVerifiedAt" DATETIME,
    "onboardingJson" TEXT
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SIGNUP',
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SsoTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '2FA_LOGIN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'signature',
    "method" TEXT NOT NULL DEFAULT 'draw',
    "value" TEXT NOT NULL,
    "font" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toEmail" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL DEFAULT 'Docurama Sign <notifications@docurama.eu>',
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "bodyText" TEXT NOT NULL,
    "linkUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" DATETIME
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT,
    CONSTRAINT "Member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "planCode" TEXT NOT NULL DEFAULT 'STARTER',
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "suspendedReason" TEXT,
    "billingEmail" TEXT,
    "storageUsedMb" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" DATETIME,
    "enforceTwoFactor" BOOLEAN NOT NULL DEFAULT false,
    "industry" TEXT,
    "companySize" TEXT
);

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sealedAt" DATETIME,
    "completedAt" DATETIME,
    "voidedAt" DATETIME,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRemindedAt" DATETIME,
    "autoRemind" BOOLEAN NOT NULL DEFAULT false,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedSenderDomain" TEXT,
    "attestedAt" DATETIME,
    "attestStatus" TEXT,
    CONSTRAINT "Envelope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Envelope_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Envelope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Envelope_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "envelopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SIGNER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 1,
    "authMethod" TEXT NOT NULL DEFAULT 'EMAIL',
    "signedAt" DATETIME,
    "accessToken" TEXT NOT NULL,
    CONSTRAINT "Recipient_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnvelopeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "envelopeId" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ipHash" TEXT,
    CONSTRAINT "EnvelopeEvent_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "folder" TEXT NOT NULL DEFAULT 'All templates',
    "pages" INTEGER NOT NULL DEFAULT 1,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "publicSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "jurisdiction" TEXT,
    "bodyMarkdown" TEXT,
    "fields" TEXT,
    "libraryKey" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "sourceNotes" TEXT,
    CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "ocrConfidence" REAL,
    "ocrError" TEXT,
    "extractedText" TEXT,
    "detectedFields" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" DATETIME,
    CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "hasText" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" REAL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'TXT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'JOIN',
    "verifiedAt" DATETIME,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" DATETIME,
    "lastCheckNote" TEXT,
    CONSTRAINT "Domain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'RSA-2048',
    "certificatePem" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "privateKeyPem" TEXT NOT NULL,
    "thumbprint" TEXT NOT NULL,
    "sanDomain" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyThumbprint" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "verifiedDomain" TEXT,
    "certificatePem" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attestationCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PortalAttestation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "conformance" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "signerCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedDomain" TEXT,
    "instanceThumbprint" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" TEXT NOT NULL,
    "tSeq" INTEGER,
    "tEntryHash" TEXT,
    CONSTRAINT "PortalAttestation_instanceThumbprint_fkey" FOREIGN KEY ("instanceThumbprint") REFERENCES "PortalInstance" ("keyThumbprint") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransparencyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "envelopeId" TEXT,
    "publicCode" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "prevHead" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransparencyEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "instanceThumbprint" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "instanceEntryHash" TEXT,
    "prevHead" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PortalKey" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'portal',
    "algorithm" TEXT NOT NULL DEFAULT 'RSA-2048',
    "publicKeyPem" TEXT NOT NULL,
    "privateKeyPem" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RekorWitness" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'portal-key',
    "subject" TEXT NOT NULL DEFAULT 'portal-key',
    "keyFingerprint" TEXT NOT NULL,
    "rekorUrl" TEXT NOT NULL,
    "entryUUID" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "treeSize" INTEGER,
    "integratedTime" DATETIME NOT NULL,
    "statement" TEXT NOT NULL,
    "statementHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "inclusionProof" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SigningCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "notBefore" DATETIME NOT NULL,
    "notAfter" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL DEFAULT 'signing',
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "pkcs12Base64" TEXT,
    "certificatePem" TEXT,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SigningCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TsaConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT 'https://timestamp.digicert.com',
    "hashAlgorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "authType" TEXT NOT NULL DEFAULT 'none',
    "username" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" DATETIME,
    "lastTestStatus" TEXT,
    "lastTestLatencyMs" INTEGER,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TsaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EsignPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EsignPreferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFrom" TEXT NOT NULL DEFAULT 'Docurama Sign <notifications@docurama.eu>',
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpLastTestAt" DATETIME,
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
    "reminderJobLastRunAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsGateway" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "lastTestAt" DATETIME,
    "lastTestStatus" TEXT,
    "lastTestTo" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsGateway_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "McpConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "transport" TEXT NOT NULL DEFAULT 'streamable-http',
    "allowedTools" TEXT NOT NULL DEFAULT 'envelope_list,document_verify,template_list',
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mrrEur" INTEGER NOT NULL DEFAULT 0,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "renewalAt" DATETIME NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'SEPA ••4291',
    "lastInvoiceAt" DATETIME,
    "failedPayment" BOOLEAN NOT NULL DEFAULT false,
    "termMonths" INTEGER NOT NULL DEFAULT 1,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "carriedForwardEnvelopes" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT DEFAULT 'manual',
    "providerRef" TEXT,
    "seatLimitOverride" INTEGER,
    "envelopeLimitOverride" INTEGER,
    "monthlyEurOverride" INTEGER,
    CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "protocol" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "issuerUrl" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "idpMetadataXml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SsoConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnterpriseLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "convertedTenantId" TEXT,
    "convertedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DsarRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "subjectEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DmcaNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complainant" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "works" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'NORMAL',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDueAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT
);

-- CreateTable
CREATE TABLE "Control" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "framework" TEXT NOT NULL DEFAULT 'SOC 2',
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPLEMENTED',
    "owner" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'DELETE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSweepAt" DATETIME
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issuedBy" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "LegalHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectEmail" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'signup',
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "withdrawnAt" DATETIME
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'SEV3',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quarter" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "findings" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL DEFAULT 'MEDIUM',
    "impact" TEXT NOT NULL DEFAULT 'MEDIUM',
    "score" INTEGER NOT NULL DEFAULT 9,
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "owner" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "description" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decisionAt" DATETIME
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "dpdSigned" BOOLEAN NOT NULL DEFAULT false,
    "lastAuditAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'APPROVED'
);

-- CreateTable
CREATE TABLE "RestoreDrill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "rtoTarget" TEXT NOT NULL,
    "rtoActual" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PASS',
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "Subprocessor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "dpaSigned" BOOLEAN NOT NULL DEFAULT true,
    "transferMechanism" TEXT NOT NULL DEFAULT 'SCC'
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "effectiveFrom" DATETIME,
    "nextReviewAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "controlRefs" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ComplianceDocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'READONLY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "secretMasked" TEXT NOT NULL,
    "successRate" INTEGER NOT NULL DEFAULT 100,
    "lastDeliveryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "secret" TEXT,
    CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "nextAttemptAt" DATETIME,
    CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "tenantName" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "ip" TEXT NOT NULL,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "actor" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "envelopesCreated" INTEGER NOT NULL DEFAULT 0,
    "envelopesSealed" INTEGER NOT NULL DEFAULT 0,
    "signersActive" INTEGER NOT NULL DEFAULT 0,
    "activeTenants" INTEGER NOT NULL DEFAULT 0,
    "mrrEur" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "smtpHost" TEXT NOT NULL DEFAULT 'smtp.eu.mailprovider.io',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL DEFAULT 'notifications@docurama.eu',
    "smtpFrom" TEXT NOT NULL DEFAULT 'Docurama Sign <notifications@docurama.eu>',
    "smtpTls" BOOLEAN NOT NULL DEFAULT true,
    "tsaUrl" TEXT NOT NULL DEFAULT 'https://timestamp.digicert.com',
    "tsaReachable" BOOLEAN NOT NULL DEFAULT true,
    "certFingerprint" TEXT NOT NULL DEFAULT '3A:F2:88:1B:6C:9E:44:D0:A7:2E:5F:B1:C3:98:0D:64:71:AA:29:5C',
    "certExpiryAt" DATETIME NOT NULL,
    "signingConformance" TEXT NOT NULL DEFAULT 'B-LT',
    "trialLengthDays" INTEGER NOT NULL DEFAULT 14,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "featureFlags" TEXT NOT NULL DEFAULT '{"smsDelivery":true,"bulkSend":true,"webhooks":true,"passkeys":true,"aiFieldDetect":false,"euResidencyOnly":false}',
    "provisioningState" TEXT NOT NULL DEFAULT '{}',
    "sweeperLastRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queueDepth" INTEGER NOT NULL DEFAULT 3,
    "apiReplicas" INTEGER NOT NULL DEFAULT 2,
    "diskUsedPct" INTEGER NOT NULL DEFAULT 41,
    "lastDeployAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT NOT NULL DEFAULT '4.2.1',
    "auditChainSealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditChainBlockHeight" INTEGER NOT NULL DEFAULT 1842,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

