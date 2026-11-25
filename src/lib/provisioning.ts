/**
 * Docurama platform provisioning catalog for docurama.eu.
 *
 * Single source of truth for:
 *  - Company identity: VOIRIA SASU, 1 Rue Marguerin, 75014 Paris, France (Docurama is a product of VOIRIA).
 *    Fields marked "to be updated" are placeholders the operator completes later.
 *  - The 12 role-based email addresses (transactional, business, legal/privacy,
 *    RFC 5321/2142 standards) with mailbox vs alias semantics.
 *  - Every DNS sub-domain on docurama.eu and its purpose.
 *  - The full DNS record set for GDPR/eIDAS/RFC-compliant mail deliverability
 *    (MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, CAA) and the BIND zone export.
 */

// ─── Company identity ────────────────────────────────────────────────────────

export const COMPANY = {
  legalName: "VOIRIA SASU",
  productName: "Docurama",
  productRelationship: "Docurama is a product of VOIRIA",
  address: "1 Rue Marguerin, 75014 Paris, France",
  country: "France",
  registrationNumber: "131 914 012 R.C.S. Paris (SIRET 131 914 012 00011)",
  vatNumber: "FR90131914012",
  shareCapital: "Société par Actions Simplifiée Unipersonnelle (SASU)",
  dpoEmail: "legal@voiria.com",
  legalEmail: "legal@voiria.com",
  securityEmail: "technology@voiria.com",
  adminEmail: "admin@docurama.eu",
  phone: "+33 1 42 68 53 00",
  dataResidency: "EU (Paris / EU-West)",
} as const;

// ─── Email accounts ──────────────────────────────────────────────────────────

export type EmailKind = "MAILBOX_SMTP" | "MAILBOX" | "SHARED_INBOX" | "ALIAS" | "REPORTS";
export type EmailCategory = "Transactional & System" | "Business & Support" | "Legal, Privacy & Compliance" | "RFC Standards & Reputation";

export interface EmailAccount {
  address: string;
  displayName: string;
  kind: EmailKind;
  category: EmailCategory;
  purpose: string;
  forwardsTo?: string;
  rfc?: string;
  priority: "P0" | "P1" | "P2";
  notes?: string;
}

export const EMAIL_ACCOUNTS: EmailAccount[] = [
  // 1. Essential transactional and system
  {
    address: "notifications@docurama.eu",
    displayName: "Docurama Sign",
    kind: "MAILBOX_SMTP",
    category: "Transactional & System",
    purpose:
      "Outbound signing invitations, OTPs, verification emails, completion certificates, envelope audit events and password resets. Configured in Platform Settings → SMTP.",
    rfc: "SMTP submission",
    priority: "P0",
    notes: "Sender identity: “Docurama Sign <notifications@docurama.eu>” for deliverability and trust. Real mailbox with SMTP credentials.",
  },
  {
    address: "admin@docurama.eu",
    displayName: "Docurama Administration",
    kind: "MAILBOX",
    category: "Transactional & System",
    purpose:
      "Platform administrator alerts, database/certificate expiry warnings, security ledger notices and system bootstrap.",
    forwardsTo: "docurama@voiria.com",
    priority: "P0",
    notes: "Real mailbox, or forwarder to docurama@voiria.com.",
  },
  // 2. Business, sales and support
  {
    address: "support@docurama.eu",
    displayName: "Docurama Support",
    kind: "SHARED_INBOX",
    category: "Business & Support",
    purpose: "Customer technical support, user inquiries and onboarding assistance.",
    priority: "P1",
    notes: "Real mailbox or shared inbox (support team).",
  },
  {
    address: "sales@docurama.eu",
    displayName: "Docurama Sales",
    kind: "ALIAS",
    category: "Business & Support",
    purpose: "Enterprise sales inquiries, custom self-hosted deployments and high-volume quota requests.",
    forwardsTo: "admin@docurama.eu",
    priority: "P1",
  },
  {
    address: "billing@docurama.eu",
    displayName: "Docurama Billing",
    kind: "ALIAS",
    category: "Business & Support",
    purpose: "Invoices, VAT receipts, payment notifications and subscription inquiries.",
    forwardsTo: "admin@docurama.eu",
    priority: "P1",
  },
  {
    address: "contact@docurama.eu",
    displayName: "Docurama Contact",
    kind: "ALIAS",
    category: "Business & Support",
    purpose: "General inquiries, partnership requests and website contact-form fallback.",
    forwardsTo: "support@docurama.eu",
    priority: "P2",
    notes: "hello@docurama.eu reserved as an equivalent alias.",
  },
  // 3. Legal, privacy and compliance (GDPR / eIDAS)
  {
    address: "privacy@docurama.eu",
    displayName: "Docurama Privacy (DPO)",
    kind: "ALIAS",
    category: "Legal, Privacy & Compliance",
    purpose: "GDPR data subject requests (DSAR/DSR: access, erasure, portability and export).",
    forwardsTo: "admin@docurama.eu",
    rfc: "GDPR Art. 13/14, Art. 30",
    priority: "P0",
    notes: "dpo@docurama.eu reserved as an equivalent alias.",
  },
  {
    address: "legal@docurama.eu",
    displayName: "Docurama Legal",
    kind: "ALIAS",
    category: "Legal, Privacy & Compliance",
    purpose: "Terms of Service, MSA agreements, NDAs and official legal notices.",
    forwardsTo: "admin@docurama.eu",
    priority: "P1",
  },
  {
    address: "security@docurama.eu",
    displayName: "Docurama Security",
    kind: "ALIAS",
    category: "Legal, Privacy & Compliance",
    purpose: "Vulnerability disclosure, security bug reports and audit verifications.",
    forwardsTo: "admin@docurama.eu",
    rfc: "RFC 9116 (security.txt)",
    priority: "P0",
    notes: "Referenced from https://docurama.eu/.well-known/security.txt.",
  },
  // 4. RFC internet standards and reputation
  {
    address: "postmaster@docurama.eu",
    displayName: "Postmaster",
    kind: "ALIAS",
    category: "RFC Standards & Reputation",
    purpose: "Mail server administration, bounce handling and deliverability correspondence.",
    forwardsTo: "admin@docurama.eu",
    rfc: "RFC 5321 §4.5.1 (mandatory)",
    priority: "P0",
  },
  {
    address: "abuse@docurama.eu",
    displayName: "Abuse",
    kind: "ALIAS",
    category: "RFC Standards & Reputation",
    purpose: "Phishing, spam and malicious document reports.",
    forwardsTo: "admin@docurama.eu",
    rfc: "RFC 2142 (mandatory)",
    priority: "P0",
  },
  {
    address: "dmarc@docurama.eu",
    displayName: "DMARC Reports",
    kind: "REPORTS",
    category: "RFC Standards & Reputation",
    purpose: "Destination for incoming DMARC aggregate (rua) and failure (ruf) reports to monitor SPF/DKIM alignment.",
    rfc: "RFC 7489",
    priority: "P2",
    notes: "Can be a blackhole after alignment is verified; keep monitored during onboarding.",
  },
];

// ─── Sub-domains ─────────────────────────────────────────────────────────────

export interface Subdomain {
  host: string; // "" = apex
  fqdn: string;
  purpose: string;
  recordType: "A" | "AAAA" | "CNAME";
  target: string;
  audience: "Public" | "Internal";
  env: "Production" | "Staging";
  tls: string;
}

export const SUBDOMAINS: Subdomain[] = [
  { host: "", fqdn: "docurama.eu", purpose: "Marketing site, legal pages (privacy, terms, imprint) and 301 redirect to www", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "www", fqdn: "www.docurama.eu", purpose: "Primary marketing hostname served by the same origin", recordType: "CNAME", target: "docurama.eu", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "app", fqdn: "app.docurama.eu", purpose: "Enterprise portal and admin console: this application (signing workspaces)", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "verify", fqdn: "verify.docurama.eu", purpose: "Public cryptographic verification portal. Anyone can validate a sealed document.", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "api", fqdn: "api.docurama.eu", purpose: "REST API for integrations, API keys and webhook deliveries", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "admin", fqdn: "admin.docurama.eu", purpose: "Hardened internal operations entry with IP allowlist and SSO enforcement.", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Internal", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "mail", fqdn: "mail.docurama.eu", purpose: "Outbound SMTP relay FQDN (rDNS/PTR target) and webmail administration", recordType: "A", target: "51.75.124.20 (mail relay)", audience: "Internal", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "mta-sts", fqdn: "mta-sts.docurama.eu", purpose: "MTA-STS policy host, serves /.well-known/mta-sts.txt over HTTPS.", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "status", fqdn: "status.docurama.eu", purpose: "Public status & uptime page with incident history", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "docs", fqdn: "docs.docurama.eu", purpose: "Product guides, public API documentation and the legal pack", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "security", fqdn: "security.docurama.eu", purpose: "Security hub: disclosure policy, platform security practices, RFC 9116 security.txt", recordType: "A", target: "51.75.20.14 (EU-West origin)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "assets", fqdn: "assets.docurama.eu", purpose: "Static asset CDN origin (brand files, screenshots, well-known images), long-lived cache", recordType: "CNAME", target: "cdn-eu.docurama.eu (CDN edge)", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "autoconfig", fqdn: "autoconfig.docurama.eu", purpose: "Thunderbird / K-9 mail client autoconfiguration (config-v1.1.xml)", recordType: "CNAME", target: "docurama.eu", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "autodiscover", fqdn: "autodiscover.docurama.eu", purpose: "Outlook Autodiscover endpoint (autodiscover.xml) for mailbox setup", recordType: "CNAME", target: "docurama.eu", audience: "Public", env: "Production", tls: "Let's Encrypt (ACME)" },
  { host: "staging", fqdn: "staging.docurama.eu", purpose: "Pre-production environment for release verification before deploy", recordType: "A", target: "51.75.20.15 (EU-West staging)", audience: "Internal", env: "Staging", tls: "Let's Encrypt (staging CA)" },
];

// ─── DNS records (deliverability & trust) ────────────────────────────────────

export interface DnsRecord {
  id: string;
  group: "MX" | "SPF" | "DKIM" | "DMARC" | "MTA-STS" | "TLS-RPT" | "CAA" | "PTR";
  name: string;
  type: "MX" | "TXT" | "CNAME" | "A" | "CAA" | "PTR";
  value: string;
  priority?: number;
  ttl: number;
  purpose: string;
  rfc?: string;
}

export const DNS_RECORDS: DnsRecord[] = [
  { id: "mx-primary", group: "MX", name: "docurama.eu", type: "MX", value: "mail.docurama.eu", priority: 10, ttl: 3600, purpose: "Primary inbound mail exchanger (self-hosted relay).", rfc: "RFC 5321" },
  { id: "mx-backup", group: "MX", name: "docurama.eu", type: "MX", value: "mx-backup.eu.mailrelay.io", priority: 20, ttl: 3600, purpose: "Secondary queue exchanger from the EU relay provider (to be updated with the chosen provider).", rfc: "RFC 5321" },
  { id: "spf", group: "SPF", name: "docurama.eu", type: "TXT", value: "v=spf1 include:spf.eu.mailrelay.io -all", ttl: 3600, purpose: "Authorises the outbound relay to send as docurama.eu; hard-fail everything else.", rfc: "RFC 7208" },
  { id: "dkim-s1", group: "DKIM", name: "s1._domainkey.docurama.eu", type: "CNAME", value: "s1.domainkey.docurama.eu.mailrelay.io", ttl: 3600, purpose: "DKIM signing key selector 1 (2048-bit RSA), published by the relay provider.", rfc: "RFC 6376" },
  { id: "dkim-s2", group: "DKIM", name: "s2._domainkey.docurama.eu", type: "CNAME", value: "s2.domainkey.docurama.eu.mailrelay.io", ttl: 3600, purpose: "DKIM signing key selector 2 (rotation).", rfc: "RFC 6376" },
  { id: "dmarc", group: "DMARC", name: "_dmarc.docurama.eu", type: "TXT", value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@docurama.eu; ruf=mailto:dmarc@docurama.eu; adkim=s; aspf=s; fo=1; pct=100", ttl: 3600, purpose: "Strict DMARC enforcement with aggregate + forensic reporting to dmarc@docurama.eu.", rfc: "RFC 7489" },
  { id: "mta-sts", group: "MTA-STS", name: "_mta-sts.docurama.eu", type: "TXT", value: "v=STSv1; id=2026091501", ttl: 3600, purpose: "Signals MTA-STS policy availability; policy served at https://mta-sts.docurama.eu/.well-known/mta-sts.txt (mode: enforce, mx: mail.docurama.eu).", rfc: "RFC 8460" },
  { id: "tls-rpt", group: "TLS-RPT", name: "_smtp._tls.docurama.eu", type: "TXT", value: "v=TLSRPTv1; rua=mailto:dmarc@docurama.eu", ttl: 3600, purpose: "SMTP TLS reporting for delivery failures of TLS on inbound mail.", rfc: "RFC 8460" },
  { id: "caa-le", group: "CAA", name: "docurama.eu", type: "CAA", value: '0 issue "letsencrypt.org"', ttl: 3600, purpose: "Only Let's Encrypt may issue certificates for the zone.", rfc: "RFC 8659" },
  { id: "caa-iodef", group: "CAA", name: "docurama.eu", type: "CAA", value: '0 iodef "mailto:security@docurama.eu"', ttl: 3600, purpose: "Certificate issuance violations reported to security@docurama.eu.", rfc: "RFC 8659" },
  { id: "ptr", group: "PTR", name: "20.124.75.51.in-addr.arpa", type: "PTR", value: "mail.docurama.eu", ttl: 3600, purpose: "Reverse DNS for the outbound relay IP. Must match the SMTP HELO/EHLO name.", rfc: "RFC 1912 §2.1" },
];

// ─── Provisioning state ──────────────────────────────────────────────────────

export interface ProvisioningState {
  provisionedEmails: string[];
  liveSubdomains: string[];
  verifiedRecords: string[];
}

export const DEFAULT_PROVISIONING_STATE: ProvisioningState = {
  provisionedEmails: [
    "notifications@docurama.eu",
    "admin@docurama.eu",
    "privacy@docurama.eu",
    "security@docurama.eu",
    "postmaster@docurama.eu",
    "abuse@docurama.eu",
  ],
  liveSubdomains: ["", "www", "app", "verify", "api", "admin", "mta-sts", "status", "docs", "security", "mail"],
  verifiedRecords: ["mx-primary", "spf", "dkim-s1", "dmarc", "caa-le"],
};

export function parseProvisioningState(raw: string | null | undefined): ProvisioningState {
  if (!raw) return { ...DEFAULT_PROVISIONING_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<ProvisioningState>;
    return {
      provisionedEmails: Array.isArray(parsed.provisionedEmails) ? parsed.provisionedEmails : DEFAULT_PROVISIONING_STATE.provisionedEmails,
      liveSubdomains: Array.isArray(parsed.liveSubdomains) ? parsed.liveSubdomains : DEFAULT_PROVISIONING_STATE.liveSubdomains,
      verifiedRecords: Array.isArray(parsed.verifiedRecords) ? parsed.verifiedRecords : DEFAULT_PROVISIONING_STATE.verifiedRecords,
    };
  } catch {
    return { ...DEFAULT_PROVISIONING_STATE };
  }
}

// ─── BIND zone export ────────────────────────────────────────────────────────

export function buildZoneFile(state: ProvisioningState): string {
  const serial = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "01";
  const subLines = SUBDOMAINS.map((s) => {
    const live = state.liveSubdomains.includes(s.host);
    const label = s.host === "" ? "@" : s.host;
    const target = s.recordType === "CNAME" ? `${s.target.endsWith(".") ? s.target : s.target + "."}` : s.target.split(" ")[0];
    return `${label.padEnd(12)} ${s.recordType.padEnd(6)} ${target.padEnd(34)} ; ${live ? "LIVE" : "PENDING"} - ${s.purpose}`;
  });
  const mxLines = DNS_RECORDS.filter((r) => r.type === "MX").map(
    (r) => `@            MX     ${String(r.priority).padEnd(4)} ${r.value}.`.padEnd(47) + ` ; ${r.purpose}`,
  );
  const txtLines = DNS_RECORDS.filter((r) => r.type === "TXT" && r.group !== "CAA").map(
    (r) => `${(r.name === "docurama.eu" ? "@" : r.name.replace(/\.docurama\.eu$/, "")).padEnd(24)} TXT    "${r.value}"`.padEnd(80) + ` ; ${r.group}${state.verifiedRecords.includes(r.id) ? " [verified]" : ""}`,
  );
  const cnameLines = DNS_RECORDS.filter((r) => r.type === "CNAME" && r.group === "DKIM").map(
    (r) => `${r.name.replace(/\.docurama\.eu$/, "").padEnd(24)} CNAME  ${r.value}.`.padEnd(60) + ` ; ${r.purpose}`,
  );
  const caaLines = DNS_RECORDS.filter((r) => r.group === "CAA").map(
    (r) => `@            CAA    ${r.value}`.padEnd(40) + ` ; ${r.purpose}`,
  );

  return `; ─────────────────────────────────────────────────────────────────────────────
; VOIRIA SASU — 1 Rue Marguerin, 75014 Paris, France
; Product: Docurama (docurama.eu) — Docurama is a product of VOIRIA
; SIREN 131 914 012 · SIRET 131 914 012 00011 · RCS Paris · TVA FR90131914012
; DNS zone: docurama.eu — generated by the Docurama platform console
; Provisioned: ${new Date().toISOString()}
; Replace 51.75.20.14 / 51.75.124.20 with production origin IPs and
; spf.eu.mailrelay.io / domainkey targets with your chosen mail provider.
; ─────────────────────────────────────────────────────────────────────────────
$ORIGIN docurama.eu.
$TTL 3600

@            SOA    ns1.docurama.eu. hostmaster.docurama.eu. (
                    ${serial}   ; serial YYYYMMDDnn
                    7200        ; refresh
                    3600        ; retry
                    1209600     ; expire
                    3600 )      ; negative TTL

; ── Nameservers ──
@            NS     ns1.docurama.eu.
@            NS     ns2.docurama.eu.
ns1          A      51.75.20.14
ns2          A      51.75.20.15

; ── Hosts & sub-domains ──
${subLines.join("\n")}

; ── Mail exchangers ──
${mxLines.join("\n")}

; ── SPF / DMARC / MTA-STS / TLS-RPT (TXT) ──
${txtLines.join("\n")}

; ── DKIM (CNAME to provider) ──
${cnameLines.join("\n")}

; ── Certificate Authority Authorisation ──
${caaLines.join("\n")}

; ── Reverse DNS for the outbound relay (at the provider / ARIN zone) ──
; 20.124.75.51.in-addr.arpa. 3600 IN PTR mail.docurama.eu.
`;
}
