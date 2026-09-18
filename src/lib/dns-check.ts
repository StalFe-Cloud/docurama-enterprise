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

/* ── Email deliverability posture ──────────────────────────────────────────────
 *
 * Domain verification (above) proves ownership. Posture check answers the
 * neighbouring question a sender actually cares about: "will my mail
 * authenticate?" — SPF and DMARC are queried generically (their records live
 * at well-known names), DKIM is best-effort because selectors are
 * provider-specific; we probe the common `default._domainkey` and report
 * "unknown" rather than a false negative when it is absent.
 */

/** Find the SPF record among a domain's TXT records (at most one is legal). */
export function parseSpfRecord(records: string[]): string | null {
  const spf = records.find((r) => r.trim().toLowerCase().startsWith("v=spf1"));
  return spf ?? null;
}

/** SPF enforcement level from the `all` mechanism. */
const SPF_POLICIES: Record<string, "strict" | "soft" | "neutral" | "permissive"> = {
  "-": "strict", "~": "soft", "?": "neutral", "+": "permissive",
};
export function spfPolicy(spf: string | null): "strict" | "soft" | "neutral" | "permissive" | "none" {
  if (!spf) return "none";
  const m = spf.match(/([+\-~?])all\b/i);
  if (!m) return "none";
  return SPF_POLICIES[m[1]] ?? "none";
}

/** Find the DMARC policy value among _dmarc TXT records. */
export function parseDmarcPolicy(records: string[]): string | null {
  const dmarc = records.find((r) => r.trim().toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) return null;
  return dmarc.match(/\bp=([a-z]+)/i)?.[1]?.toLowerCase() ?? null;
}

export type EmailPosture = {
  domain: string;
  spf: { found: boolean; policy: string };
  dmarc: { found: boolean; policy: string | null };
  dkim: { status: "found" | "not-found" | "unknown"; note: string };
};

/** Live posture check for a domain (SPF + DMARC + best-effort DKIM probe). */
export async function checkEmailPosture(domain: string): Promise<EmailPosture> {
  const host = domain.toLowerCase().trim();
  const [rootRes, dmarcRes, dkimRes] = await Promise.all([
    lookupTxt(host),
    lookupTxt(`_dmarc.${host}`),
    lookupTxt(`default._domainkey.${host}`),
  ]);
  const spf = rootRes.ok ? parseSpfRecord(rootRes.records) : null;
  return {
    domain: host,
    spf: { found: !!spf, policy: spfPolicy(spf) },
    dmarc: {
      found: dmarcRes.ok && dmarcRes.records.some((r) => r.trim().toLowerCase().startsWith("v=dmarc1")),
      policy: dmarcRes.ok ? parseDmarcPolicy(dmarcRes.records) : null,
    },
    dkim: !dkimRes.ok
      ? { status: "unknown", note: "DNS lookup failed" }
      : dkimRes.records.length > 0
        ? { status: "found", note: "Selector `default` publishes a key" }
        : { status: "unknown", note: "No key at `default._domainkey` — DKIM selectors are provider-specific, this is not a failure" },
  };
}
