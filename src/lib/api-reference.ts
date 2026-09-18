/**
 * Public API reference - the catalogue behind Settings → API.
 *
 * Everything documented here is a live endpoint on this deployment:
 *  - /api/auth/*      - session auth (cookie or bearer)
 *  - /api/v1/*        - integration surface, authenticated with X-API-Key
 *  - /api/mcp         - MCP server (JSON-RPC 2.0), X-API-Key
 *  - /api/workspace/* - portal UI surface (session auth), documented for
 *                       completeness; integrations should prefer /api/v1.
 */

export type ApiParam = { name: string; type: string; description: string };

export type ApiEndpoint = {
  method: "GET" | "POST";
  path: string;
  auth: "session" | "api-key" | "none" | "signature";
  summary: string;
  params?: ApiParam[];
  request?: string;
  response: string;
};

export type ApiGroup = {
  name: string;
  description: string;
  endpoints: ApiEndpoint[];
};

export const API_REFERENCE: ApiGroup[] = [
  {
    name: "Authentication",
    description: "Session lifecycle for interactive clients. The login response returns a bearer token for embedding contexts where cookies are unavailable.",
    endpoints: [
      {
        method: "POST", path: "/api/auth/login", auth: "none",
        summary: "Sign in with email + password (returns { ok, token, user }; 2FA-enabled accounts get { requiresOtp, challenge })",
        request: `{
  "email": "alex@stalfe.example",
  "password": "••••••••",
  "otp": "123456",          // required when the account has 2FA
  "challenge": "challenge-id" // from the requiresOtp response
}`,
        response: `{
  "ok": true,
  "token": "sess_9f3…",
  "user": { "id": "…", "email": "…", "role": "WORKSPACE_ADMIN", "name": "Alexandra Fischer" }
}`,
      },
      {
        method: "GET", path: "/api/auth/me", auth: "session",
        summary: "Current session, active organization and memberships",
        response: `{
  "user": {
    "email": "alex@stalfe.example",
    "tenantName": "StålFe AB",
    "orgs": [ { "id": "…", "name": "StålFe AB", "role": "OWNER" } ]
  }
}`,
      },
      {
        method: "POST", path: "/api/auth/logout", auth: "session",
        summary: "Revoke the current session and clear credentials",
        response: `{ "ok": true }`,
      },
    ],
  },
  {
    name: "Envelopes",
    description: "Read access to the workspace envelope store. Authenticated with the X-API-Key header (Settings → API).",
    endpoints: [
      {
        method: "GET", path: "/api/v1/envelopes", auth: "api-key",
        summary: "List envelopes (newest first)",
        params: [
          { name: "status", type: "string", description: "Filter: SENT, PARTIALLY_SIGNED, COMPLETED, VOIDED, DECLINED" },
          { name: "page", type: "number", description: "1-based page index (default 1)" },
          { name: "perPage", type: "number", description: "5-100 items per page (default 20)" },
        ],
        response: `{
  "total": 42, "page": 1, "perPage": 20,
  "rows": [ { "publicCode": "DOC-8F3K2M9P", "title": "Service Agreement", "status": "COMPLETED" } ]
}`,
      },
      {
        method: "GET", path: "/api/v1/envelopes/{id}", auth: "api-key",
        summary: "Envelope detail with recipients, full audit event timeline and seal state",
        response: `{
  "envelope": { "publicCode": "DOC-8F3K2M9P", "sha256": "3a2f…", "sealedAt": "2026-09-14T16:42:07Z" },
  "recipients": [ { "name": "Ravi Patel", "email": "ravi@acme.example", "status": "SIGNED" } ],
  "events": [ { "action": "SENT", "at": "2026-09-12T09:00:00Z" } ]
}`,
      },
      {
        method: "GET", path: "/api/v1/envelopes/{id}/evidence-pack", auth: "api-key",
        summary: "Download the signed evidence pack (ZIP) for a completed, sealed envelope: sealed document, event-ledger CSV, bilingual certificate, X.509 evidence key, offline verifier and a signed manifest",
        response: `HTTP 200
content-type: application/zip
content-disposition: attachment; filename="evidence-DOC-8F3K2M9P.zip"

evidence/event-ledger.csv   CERTIFICATE-OF-COMPLETION.html
document/contract.pdf       verify.html
manifest.json               README.txt
certificate/evidence-key.pem`,
      },
    ],
  },
  {
    name: "Verification",
    description: "Public verification of sealed documents - the same engine behind verify.docurama.eu.",
    endpoints: [
      {
        method: "GET", path: "/api/v1/verify/{code}", auth: "none",
        summary: "Verify a document by its public code (DOC-XXXXXX). Cloud envelopes return VERIFIED; codes sealed on self-hosted instances return VERIFIED_ATTESTED (the signed fingerprint the instance pushed — see docs/SELF-HOSTED-ATTESTATION.md)",
        response: `{
  "result": "VERIFIED",
  "envelope": {
    "title": "Service Agreement", "status": "COMPLETED",
    "sealedAt": "2026-09-14T16:42:07Z", "sha256": "3a2f…",
    "signers": [ { "name": "Ravi Patel", "signedAt": "2026-09-14T16:42:07Z" } ]
  }
}`,
      },
      {
        method: "POST", path: "/api/attestations", auth: "signature",
        summary: "Public-portal receiver for self-hosted instances: push a signed minimal fingerprint for a sealed envelope. Trust-on-first-use key registration; idempotent per code; the fingerprint must carry a consistent transparency-chain claim (rewrite attempts are refused with 409)",
        response: `{
  "payload": { "format": "docurama-attestation", "version": 1,
    "instance": { "keyId": "ek_…", "label": "Company SAS", "verifiedDomain": "mail.company.com" },
    "envelope": { "code": "DOC-XXXXXXXX", "sha256": "…", "sealedAt": "…", "conformance": "B-T", "pages": 5, "signerCount": 2 },
    "publicKeyPem": "…", "certificatePem": "…", "keyThumbprint": "…",
    "transparency": { "format": "docurama-transparency-v1", "seq": 12, "payloadHash": "…", "prevHead": "…", "entryHash": "…", "at": "…" } },
  "signature": "base64 RSA-SHA-256"
}
→ 201 { "ok": true, "registered": true, "log": { "seq": 48, "head": "…" } }`,
      },
      {
        method: "GET", path: "/api/transparency/checkpoint", auth: "none",
        summary: "Signed checkpoint of the portal's append-only attestation log — poll it, pin keyFingerprint (TOFU), keep every checkpoint: a shrinking or re-anchored log is provable. When a witness block is present, the portal key's fingerprint is anchored in Sigstore Rekor (neutral third-party log) — verify the statement signature under the checkpoint key (see docs/TRANSPARENCY-LOG.md)",
        response: `{
  "log": { "size": 214, "head": "a1b2…" },
  "checkpoint": { "format": "docurama-transparency-checkpoint", "size": 214, "head": "a1b2…",
    "at": "2026-09-17T10:00:00Z", "signature": "base64 RSA-SHA-256", "publicKeyPem": "…", "keyFingerprint": "…" },
  "witness": { "rekorUrl": "https://rekor.sigstore.dev", "entryUUID": "…", "entryUrl": "…/log/entries?logIndex=N",
    "logIndex": 2879324631, "treeSize": 2757420430, "integratedTime": "…",
    "statement": { "format": "docurama-portal-key-witness-v1", "keyId": "portal", "keyFingerprint": "…", "createdAt": "…" },
    "statementHash": "…", "signature": "base64 RSA-SHA-256", "inclusionProof": { … } }
}`,
      },
      {
        method: "GET", path: "/api/transparency/proof/{code}", auth: "none",
        summary: "Public inclusion proof that a code's attestation is committed in the append-only log: the log entry, the chain segment to the current head, the signed checkpoint, and (when present) the Rekor witness block — re-hash it all, trust only the key you pinned",
        response: `{
  "code": "DOC-XXXXXXXX",
  "entry": { "seq": 48, "code": "DOC-XXXXXXXX", "instanceThumbprint": "…", "sha256": "…", "instanceEntryHash": "…", "prevHead": "…", "head": "…", "at": "…" },
  "segment": [ … ],
  "truncated": false,
  "checkpoint": { "format": "docurama-transparency-checkpoint", "size": 214, "head": "…", "signature": "…", "publicKeyPem": "…" },
  "witness": { … }
}`,
      },
      {
        method: "POST", path: "/api/transparency/witness", auth: "session",
        summary: "Witness the portal transparency key in Sigstore Rekor now (platform-admin; idempotent per key generation; audited). Firewalled deployments return the reason and keep serving TOFU checkpoints. GET returns the current witness state without triggering anything",
        response: `{ "ok": true, "witnessed": true, "witness": { "entryUUID": "…", "logIndex": 2879324631, … } }`,
      },
    ],
  },
  {
    name: "Templates",
    description: "Workspace template catalogue, authenticated with the X-API-Key header.",
    endpoints: [
      {
        method: "GET", path: "/api/v1/templates", auth: "api-key",
        summary: "List templates ordered by usage",
        response: `{
  "rows": [ { "name": "NDA (FR)", "category": "Legal", "usageCount": 38 } ]
}`,
      },
    ],
  },
  {
    name: "MCP Server",
    description: "Model Context Protocol endpoint for AI assistants (Claude, Cursor, custom agents). JSON-RPC 2.0 over HTTP, authenticated with the X-API-Key header.",
    endpoints: [
      {
        method: "POST", path: "/api/mcp", auth: "api-key",
        summary: "JSON-RPC 2.0 - methods: initialize, tools/list, tools/call",
        request: `{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "document_verify", "arguments": { "code": "DOC-8F3K2M9P" } }
}`,
        response: `{
  "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "VERIFIED - Service Agreement, sealed 2026-09-14" } ] }
}`,
      },
    ],
  },
];

export const WEBHOOK_EVENTS = [
  { event: "envelope.sent", when: "Signing invitations dispatched" },
  { event: "envelope.viewed", when: "A signer opened the document" },
  { event: "envelope.signed", when: "A signer completed their signature" },
  { event: "envelope.completed", when: "All parties signed - document sealed" },
  { event: "envelope.declined", when: "A signer declined, with reason" },
  { event: "envelope.voided", when: "The sender voided the envelope" },
  { event: "reminder.sent", when: "A reminder (manual or scheduled job) was sent" },
];

export function quickstartSnippets(base: string, keyPlaceholder = "dk_live_xxxx"): { lang: string; code: string }[] {
  return [
    {
      lang: "curl",
      code: `# 1. List envelopes
curl -s "${base}/api/v1/envelopes?status=SENT" \\
  -H "X-API-Key: ${keyPlaceholder}"

# 2. Verify any sealed document (public, no key needed)
curl -s "${base}/api/v1/verify/DOC-8F3K2M9P"`,
    },
    {
      lang: "javascript",
      code: `const res = await fetch("${base}/api/v1/envelopes?perPage=50", {
  headers: { "X-API-Key": process.env.DOCURAMA_API_KEY! },
});
const { rows } = await res.json();
console.log(rows.map((e) => \`\${e.publicCode} - \${e.title} [\${e.status}]\`));`,
    },
    {
      lang: "python",
      code: `import os, requests

r = requests.get(
    "${base}/api/v1/envelopes",
    params={"status": "SENT", "perPage": 50},
    headers={"X-API-Key": os.environ["DOCURAMA_API_KEY"]},
)
for e in r.json()["rows"]:
    print(e["publicCode"], e["title"], e["status"])`,
    },
  ];
}
