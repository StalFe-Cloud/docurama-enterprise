/** Explicit admin response allowlists: adding database columns cannot expose credentials. */
const USER_FIELDS = [
  "id", "email", "firstName", "lastName", "role", "status", "totpEnabled",
  "lastActiveAt", "createdAt", "activeTenantId", "emailVerifiedAt", "passwordChangedAt",
] as const;

export const publicAdminUserSelect = Object.fromEntries(USER_FIELDS.map((key) => [key, true])) as {
  [K in typeof USER_FIELDS[number]]: true;
};

function project(row: Record<string, unknown> | null, fields: readonly string[]): Record<string, unknown> | null {
  if (!row) return null;
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(row, key)).map((key) => [
    key, row[key] instanceof Date ? row[key].toISOString() : row[key],
  ]));
}

export function publicAdminUser(row: Record<string, unknown>): Record<string, unknown> {
  return project(row, USER_FIELDS)!;
}

export function publicAdminTenant(row: Record<string, unknown>): Record<string, unknown> {
  return project(row, [
    "id", "name", "slug", "planCode", "status", "suspendedReason", "billingEmail",
    "storageUsedMb", "createdAt", "trialEndsAt", "enforceTwoFactor", "industry", "companySize",
  ])!;
}

export function publicAdminSettings(row: Record<string, unknown> | null): Record<string, unknown> | null {
  return project(row, [
    "id", "smtpHost", "smtpPort", "smtpUser", "smtpFrom", "smtpTls", "tsaUrl", "tsaReachable",
    "certFingerprint", "certExpiryAt", "signingConformance", "trialLengthDays", "maintenanceMode",
    "featureFlags", "provisioningState", "companyProfile", "sweeperLastRunAt", "queueDepth",
    "apiReplicas", "diskUsedPct", "lastDeployAt", "version", "auditChainSealedAt",
    "auditChainBlockHeight", "updatedAt",
  ]);
}

export function publicAdminApiKey(row: Record<string, unknown>): Record<string, unknown> {
  return project(row, ["id", "tenantId", "name", "prefix", "scope", "status", "createdBy", "lastUsedAt", "createdAt"])!;
}

export function publicAdminWebhook(row: Record<string, unknown>): Record<string, unknown> {
  return project(row, ["id", "tenantId", "url", "events", "status", "secretMasked", "successRate", "lastDeliveryAt", "createdAt"])!;
}
