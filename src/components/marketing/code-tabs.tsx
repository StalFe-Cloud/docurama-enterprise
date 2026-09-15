"use client";

/**
 * Tabbed code examples for the /developers page. Three languages for the
 * same envelope send, plus a webhook payload tab. The tabs are real buttons
 * with keyboard support; the active sample is copied into the panel.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

type Sample = {
  id: string;
  label: string;
  file: string;
  note: string;
  code: string;
};

const SAMPLES: Sample[] = [
  {
    id: "curl",
    label: "curl",
    file: "send.sh",
    note: "send an envelope",
    code: `curl -X POST https://api.docurama.eu/api/v1/envelopes \\
  -H "X-API-Key: dk_live_••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "EN 10204 3.1 Mill Certificate · S355J2 Plates",
    "recipients": [
      { "name": "Lars Bergström",
        "email": "lars@nordjarm.example",
        "role": "SIGNER" }
    ]
  }'

# 201 Created
# { "publicCode": "DOC-7K2M9XQA", ... }`,
  },
  {
    id: "ts",
    label: "TypeScript",
    file: "send.ts",
    note: "typed client, no SDK needed",
    code: `const res = await fetch("https://api.docurama.eu/api/v1/envelopes", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.DOCURAMA_API_KEY!,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "Quotation QT-2026-114 · Cast Housings",
    recipients: [
      { name: "Elisa Righi", email: "elisa@fonderia-padana.example", role: "SIGNER" },
    ],
  }),
});

const envelope = await res.json();
console.log(envelope.publicCode); // "DOC-2K9W4C"`,
  },
  {
    id: "py",
    label: "Python",
    file: "send.py",
    note: "requests works fine too",
    code: `import os, requests

res = requests.post(
    "https://api.docurama.eu/api/v1/envelopes",
    headers={"X-API-Key": os.environ["DOCURAMA_API_KEY"]},
    json={
        "title": "Supply Agreement 2026 · Nordjärm Gjuteri",
        "recipients": [
            {"name": "Lars Bergström",
             "email": "lars@nordjarm.example",
             "role": "SIGNER"},
        ],
    },
    timeout=10,
)

print(res.json()["publicCode"])  # "DOC-4N7Q2K"`,
  },
  {
    id: "webhook",
    label: "Webhook",
    file: "event.json",
    note: "signed event, delivered once",
    code: `POST /your-endpoint
X-Docurama-Signature: sha256=8f14e45fceea167a5a36dedd4bea2543…

{
  "id": "evt_01J8ZK3M9Q",
  "type": "envelope.completed",
  "created": "2026-09-15T08:41:12Z",
  "data": {
    "envelope": {
      "publicCode": "DOC-8P4K2M",
      "title": "EN 10204 3.1 Mill Certificate · S355J2 Plates",
      "status": "COMPLETED",
      "sealed": true,
      "digest": "sha256:9f2c7e41a8b3d6f0c2e5a7d8…"
    }
  }
}`,
  },
];

export function CodeTabs() {
  const [active, setActive] = useState(SAMPLES[0].id);
  const current = SAMPLES.find((s) => s.id === active) ?? SAMPLES[0];

  return (
    <div className="overflow-hidden rounded-xl border bg-foreground text-background">
      <div role="tablist" aria-label="Code examples" className="flex items-center gap-1 border-b border-background/10 px-3 pt-2">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={active === s.id}
            onClick={() => setActive(s.id)}
            className={cn(
              "rounded-t-lg px-3.5 py-2 font-mono text-xs transition-colors",
              active === s.id
                ? "text-background"
                : "text-background/45 hover:text-background/75",
            )}
            style={active === s.id ? { background: "rgba(255,255,255,.08)" } : undefined}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto pb-2 pr-2 font-mono text-[11px] text-background/35">{current.note}</span>
      </div>
      <div className="flex items-center justify-between border-b border-background/10 px-4 py-2">
        <span className="font-mono text-[11px] text-background/60">{current.file}</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-relaxed text-background/85"><code>{current.code}</code></pre>
    </div>
  );
}
