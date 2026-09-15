/**
 * Real DNS verification over DNS-over-HTTPS (Google + Cloudflare JSON APIs).
 * Used by the workspace sending-domain verification flow - the TXT record the
 * customer publishes is actually queried, never simulated.
 */

export type TxtLookupResult = {
  ok: boolean;
  records: string[];
  provider: string;
  error?: string;
};

async function dohQuery(endpoint: string, name: string, timeoutMs = 6000): Promise<{ Status: number; Answer?: { data: string }[] }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${endpoint}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: "application/dns-json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`DoH endpoint returned HTTP ${res.status}`);
    return (await res.json()) as { Status: number; Answer?: { data: string }[] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve TXT records for a hostname. Tries Google DoH first, then Cloudflare.
 * Returns ok:false only when both providers fail - a NXDOMAIN (Status 3) is a
 * valid, honest "no records" answer, not an error.
 */
export async function lookupTxt(name: string): Promise<TxtLookupResult> {
  const endpoints: [string, string][] = [
    ["https://dns.google/resolve", "Google"],
    ["https://cloudflare-dns.com/dns-query", "Cloudflare"],
  ];
  let lastError = "unknown error";
  for (const [endpoint, provider] of endpoints) {
    try {
      const json = await dohQuery(endpoint, name);
      const records = (json.Answer ?? [])
        .map((a) => a.data.replace(/^"|"$/g, ""));
      return { ok: true, records, provider };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, records: [], provider: "none", error: lastError };
}

/**
 * Verify the Docurama ownership TXT record for a sending domain:
 *   _docurama.<domain>  TXT  "docurama-verify=<token>"
 */
export async function verifySendingDomain(domain: string, token: string): Promise<{
  verified: boolean;
  note: string;
  records: string[];
}> {
  const host = `_docurama.${domain.toLowerCase().trim()}`;
  const result = await lookupTxt(host);
  if (!result.ok) {
    return { verified: false, note: `DNS lookup failed (${result.error}) - check again in a moment`, records: [] };
  }
  const expected = `docurama-verify=${token}`;
  const match = result.records.find((r) => r.trim() === expected);
  if (match) {
    return { verified: true, note: `TXT record confirmed via ${result.provider} DoH - domain authenticated for sending`, records: result.records };
  }
  if (result.records.length === 0) {
    return { verified: false, note: `No TXT records found at ${host} yet - DNS propagation can take up to 24h`, records: [] };
  }
  return {
    verified: false,
    note: `TXT records exist at ${host} but the expected value was not found - make sure it matches exactly`,
    records: result.records,
  };
}
