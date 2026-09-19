/** Server-side installation policy. Dedicated installations are invitation-only. */
export function isSingleTenantDeployment(): boolean {
  return ["selfhost", "self_hosted", "self-hosted", "private_cloud", "private-cloud"].includes(
    (process.env.DOCURAMA_DEPLOYMENT_MODE ?? "saas").trim().toLowerCase(),
  );
}

export function publicRegistrationAllowed(): boolean {
  return !isSingleTenantDeployment() &&
    (process.env.DOCURAMA_PUBLIC_REGISTRATION ?? "true").trim().toLowerCase() === "true";
}

/**
 * Call inside the transaction that creates a tenant. A dedicated installation
 * can bootstrap its first tenant only through a pre-provisioned platform admin.
 * Registration never bootstraps an installation, even when its database is empty.
 */
export function tenantCreationAllowed(actorRole: string, tenantCount: number): boolean {
  if (isSingleTenantDeployment()) return actorRole === "PLATFORM_ADMIN" && tenantCount === 0;
  return actorRole === "PLATFORM_ADMIN" || publicRegistrationAllowed();
}
