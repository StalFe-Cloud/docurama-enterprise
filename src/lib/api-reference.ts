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
  auth: "session" | "api-key" | "none";
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
    ],
  },
  {
    name: "Verification",
    description: "Public verification of sealed documents - the same engine behind verify.docurama.eu.",
    endpoints: [
      {
        method: "GET", path: "/api/v1/verify/{code}", auth: "none",
        summary: "Verify a document by its public code (DOC-XXXXXX)",
        response: `{
  "result": "VERIFIED",
  "envelope": {
    "title": "Service Agreement", "status": "COMPLETED",
    "sealedAt": "2026-09-14T16:42:07Z", "sha256": "3a2f…",
    "signers": [ { "name": "Ravi Patel", "signedAt": "2026-09-14T16:42:07Z" } ]
  }
}`,
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
