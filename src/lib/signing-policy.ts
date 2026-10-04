/** Policy shared by token signing and document reads. A bearer invitation does
 * not prove reauthentication or the additional controls of Part 11 mode. */
export type SigningTenant = {
  status: string;
  esignPrefs?: { requireReauth: boolean; part11Mode: boolean } | null;
};

export function signerReadRestriction(tenant: SigningTenant): string | null {
  return tenant.status === "SUSPENDED" ? "This document is not available for signing." : null;
}

export function signerAuthenticationRestriction(tenant: SigningTenant): string | null {
  if (tenant.esignPrefs?.requireReauth || tenant.esignPrefs?.part11Mode) {
    return "This workspace requires signer reauthentication. This signing flow does not support that authentication; contact the sender.";
  }
  return null;
}
