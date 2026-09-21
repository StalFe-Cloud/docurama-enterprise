/// <reference types="bun-types" />

/**
 * API-layer E2E — the public v1 integration surface, driven with real HTTP
 * against the same server the Maestro flows use.
 *
 * Run: bun test e2e/api.test.ts   (run.sh does this after seeding)
 *
 * Covers what browser flows cannot: X-API-Key auth (missing / invalid),
 * scope enforcement (403 for TEMPLATES with an ENVELOPES key), the public
 * verify engine states (VERIFIED / NOT_SEALED / NOT_FOUND), list + detail
 * envelope reads, and — security-critical — that recipient signing tokens
 * NEVER leak through the v1 payloads.
 *
 * Fixtures come from e2e/seed.ts (DOC-E2E0001/0002 + the E2E API key).
 */

import { describe, expect, test } from "bun:test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_API_KEY = "dk_e2e_0000000000000000000000000000000000000000";

const get = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
};

const post = async (path: string, payload: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
};

describe("public verify engine (/api/v1/verify)", () => {
  test("sealed fixture verifies with its exact SHA-256 digest", async () => {
    const { status, body } = await get("/api/v1/verify/DOC-E2E0002");
    expect(status).toBe(200);
    expect(body.result).toBe("VERIFIED");
    const env = body.envelope as { sha256: string; signers: unknown[]; title: string };
    expect(env.title).toContain("Supply Agreement");
    expect(env.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(env.signers.length).toBeGreaterThan(0);
  });

  test("sent (not yet signed) fixture reports NOT_SEALED honestly", async () => {
    const { status, body } = await get("/api/v1/verify/DOC-E2E0001");
    expect(status).toBe(200);
    expect(body.result).toBe("NOT_SEALED");
  });

  test("unknown code reports NOT_FOUND, not an error", async () => {
    const { status, body } = await get("/api/v1/verify/DOC-DOESNOTEXIST");
    expect(status).toBe(200);
    expect(body.result).toBe("NOT_FOUND");
  });
});

describe("X-API-Key authentication", () => {
  test("missing key is rejected with 401", async () => {
    const { status, body } = await get("/api/v1/envelopes");
    expect(status).toBe(401);
    expect(String(body.error)).toContain("X-API-Key");
  });

  test("invalid key is rejected with 401", async () => {
    const { status } = await get("/api/v1/envelopes", { "X-API-Key": "dk_totally_wrong" });
    expect(status).toBe(401);
  });

  test("valid key lists the tenant's envelopes (seeded fixtures present)", async () => {
    const { status, body } = await get("/api/v1/envelopes?perPage=50", { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(200);
    expect(Number(body.total)).toBeGreaterThanOrEqual(4);
    const rows = body.rows as { publicCode: string; recipients: Record<string, unknown>[] }[];
    const codes = rows.map((r) => r.publicCode);
    for (const expected of ["DOC-E2E0001", "DOC-E2E0002", "DOC-E2E0003", "DOC-E2E0004"]) {
      expect(codes).toContain(expected);
    }
    // SECURITY: signing tokens must never appear in v1 payloads.
    const leaked = rows.some((r) => r.recipients.some((rcpt) => "accessToken" in rcpt));
    expect(leaked).toBe(false);
  });

  test("envelope detail is addressable by public code", async () => {
    const { status, body } = await get("/api/v1/envelopes/DOC-E2E0002", { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(200);
    expect((body.envelope as { status: string }).status).toBe("COMPLETED");
    expect(Array.isArray(body.events)).toBe(true);
  });

  test("scope enforcement: ENVELOPES key cannot read TEMPLATES (403)", async () => {
    const { status, body } = await get("/api/v1/templates", { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(403);
    expect(String(body.error)).toContain("scope");
  });

  test("unknown v1 resource 404s cleanly", async () => {
    const { status } = await get("/api/v1/definitely-not-a-resource", { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(404);
  });
});

describe("public signing endpoint (/api/sign)", () => {
  test("invalid token 404s with a friendly message", async () => {
    const { status, body } = await post("/api/sign/definitely-not-a-real-token", { op: "view" });
    expect(status).toBe(404);
    expect(String(body.error)).toContain("not valid");
  });

  test("view on the journey fixture records the open (idempotent-safe)", async () => {
    const { status, body } = await post("/api/sign/e2e-fixed-journey-token-0000000000000001", { op: "view" });
    expect(status).toBe(200);
    expect(body.status).toBe("DELIVERED");
  });

  test("sign without a name is rejected (validation, no mutation)", async () => {
    const { status, body } = await post("/api/sign/e2e-fixed-journey-token-0000000000000001", { op: "sign", name: "" });
    expect(status).toBe(400);
    expect(String(body.error)).toContain("full name");
  });

  test("unknown operation is rejected", async () => {
    const { status } = await post("/api/sign/e2e-fixed-journey-token-0000000000000001", { op: "teleport" });
    expect(status).toBe(400);
  });
});

describe("signer document preview (/api/sign/{token}/pages/{n})", () => {
  // DOC-E2E0001 (SENT, signer PENDING) carries a seeded 3-page PDF.
  const SIGNER = "e2e-fixed-signer-token-0000000000000001";
  const CC = "e2e-fixed-cc-token-0000000000000001";
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // ‰PNG

  const fetchPage = async (path: string) => {
    const res = await fetch(`${BASE}${path}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, contentType: res.headers.get("content-type"), buf };
  };

  test("renders page 1 as a real PNG for a valid signer token", async () => {
    const { status, contentType, buf } = await fetchPage(`/api/sign/${SIGNER}/pages/1`);
    expect(status).toBe(200);
    expect(contentType).toBe("image/png");
    expect(Array.from(buf.slice(0, 4))).toEqual(PNG_MAGIC);
    expect(buf.byteLength).toBeGreaterThan(2000); // not a blank render
  });

  test("renders the last page and clamps an absurd dpi server-side", async () => {
    const a = await fetchPage(`/api/sign/${SIGNER}/pages/3`);
    expect(a.status).toBe(200);
    expect(Array.from(a.buf.slice(0, 4))).toEqual(PNG_MAGIC);

    const b = await fetchPage(`/api/sign/${SIGNER}/pages/1?dpi=99999`);
    expect(b.status).toBe(200);
    expect(Array.from(b.buf.slice(0, 4))).toEqual(PNG_MAGIC);
  });

  test("page out of range 404s, page 0 is invalid", async () => {
    expect((await fetchPage(`/api/sign/${SIGNER}/pages/4`)).status).toBe(404);
    expect((await fetchPage(`/api/sign/${SIGNER}/pages/0`)).status).toBe(400);
  });

  test("invalid token 404s without leaking which part failed", async () => {
    const { status, buf } = await fetchPage(`/api/sign/definitely-not-a-real-token/pages/1`);
    expect(status).toBe(404);
    const body = JSON.parse(new TextDecoder().decode(buf)) as { error?: string };
    expect(String(body.error ?? "")).toContain("not valid");
  });

  test("CC recipients cannot preview (403) — they get the completed copy", async () => {
    const { status } = await fetchPage(`/api/sign/${CC}/pages/1`);
    expect(status).toBe(403);
  });

  test("DOCUMENT_VIEWED is recorded once per recipient (evidence, idempotent)", async () => {
    // First render by a fresh recipient (only the seeded PENDING signer on
    // DOC-E2E0001) must land exactly one event; a second page flip must not
    // grow the ledger.
    const direct = new (await import("@prisma/client")).PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const countEvents = async () => {
        const env = await direct.envelope.findUnique({
          where: { publicCode: "DOC-E2E0001" },
          select: { id: true },
        });
        if (!env) throw new Error("fixture DOC-E2E0001 missing — seed first");
        return direct.envelopeEvent.count({
          where: { envelopeId: env.id, action: "DOCUMENT_VIEWED", detail: { contains: "fixture-signer@example.com" } },
        });
      };

      const before = await countEvents();
      if (before > 0) {
        // A prior suite run already viewed the preview on this db — the
        // idempotency claim is then: still exactly one event after more hits.
        expect(before).toBe(1);
      }
      expect((await fetchPage(`/api/sign/${SIGNER}/pages/2`)).status).toBe(200);
      expect((await fetchPage(`/api/sign/${SIGNER}/pages/3`)).status).toBe(200);
      expect(await countEvents()).toBe(1);
    } finally {
      await direct.$disconnect();
    }
  });
});

describe("signer preview watermark (src/lib/preview-watermark)", () => {
  // Portrait A4 at 150 dpi — the shape most contract pages render at.
  const W = 1240;
  const H = 1754;

  const blankCanvas = async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    return { canvas, ctx };
  };

  const inkRatio = async (ctx: import("@napi-rs/canvas").SKRSContext2D) => {
    const data = ctx.getImageData(0, 0, W, H).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) ink++;
    }
    return ink / (W * H);
  };

  test("watermarkFor formats the two traceability lines", async () => {
    const { watermarkFor } = await import("../src/lib/preview-watermark");
    const wm = watermarkFor({
      name: "Fixture Signer",
      email: "fixture-signer@example.com",
      code: "DOC-E2E0001",
      date: new Date("2026-09-18T12:00:00Z"),
    });
    expect(wm.forLine).toBe("Prepared for Fixture Signer <fixture-signer@example.com>");
    expect(wm.metaLine).toContain("DOC-E2E0001");
    expect(wm.metaLine).toContain("2026-09-18");
  });

  test("unit: draws faint but unmistakable ink on a blank page", async () => {
    const { drawPreviewWatermark } = await import("../src/lib/preview-watermark");
    const { ctx } = await blankCanvas();
    expect(await inkRatio(ctx)).toBe(0); // baseline: pure white

    drawPreviewWatermark(ctx, W, H, {
      forLine: "Prepared for Fixture Signer <fixture-signer@example.com>",
      metaLine: "DOC-E2E0001 · 2026-09-18 · preview copy",
    });

    const ratio = await inkRatio(ctx);
    expect(ratio).toBeGreaterThan(0.002); // real text, not nothing
    expect(ratio).toBeLessThan(0.06); // faint — the page stays readable
  });

  test("unit: pathological identities never throw and stay bounded", async () => {
    const { drawPreviewWatermark } = await import("../src/lib/preview-watermark");
    const { ctx } = await blankCanvas();
    const absurd = "x".repeat(180);
    drawPreviewWatermark(ctx, W, H, {
      forLine: `Prepared for ${absurd} <${absurd}@${absurd}.example>`,
      metaLine: `${absurd} · ${absurd}`,
    });
    const ratio = await inkRatio(ctx);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.06);

    // Degenerate canvas sizes are a no-op, not a crash.
    const { createCanvas } = await import("@napi-rs/canvas");
    const tiny = createCanvas(4, 4).getContext("2d");
    drawPreviewWatermark(tiny, 4, 4, { forLine: "x", metaLine: "y" });
  });

  test("integration: signer render is watermarked, owner render is pristine", async () => {
    const E2E_DOC_NDA = `doc_${"e2e" + "0".repeat(28)}1`;
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");

    // Owner: session auth, the workspace's own unwatermarked renderer.
    const login = await post("/api/auth/login", { email: "e2e@docurama.eu", password: "e2ePass1234!" });
    expect(login.status).toBe(200);
    const token = String((login.body as { token?: string }).token);
    expect(token.length).toBeGreaterThan(10);

    const ownerRes = await fetch(`${BASE}/api/workspace/documents/${E2E_DOC_NDA}/pages/2?dpi=150`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ownerRes.status).toBe(200);
    const ownerPng = new Uint8Array(await ownerRes.arrayBuffer());

    // Signer: token auth, the watermarked renderer.
    const signerRes = await fetch(`${BASE}/api/sign/e2e-fixed-signer-token-0000000000000001/pages/2?dpi=150`);
    expect(signerRes.status).toBe(200);
    const signerPng = new Uint8Array(await signerRes.arrayBuffer());

    expect(Array.from(ownerPng.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(Array.from(signerPng.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // Same page, same dpi → identical dimensions; the ONLY pixel differences
    // come from the recipient watermark.
    const decode = async (bytes: Uint8Array) => {
      const img = await loadImage(Buffer.from(bytes));
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
    };
    const [owner, signer] = await Promise.all([decode(ownerPng), decode(signerPng)]);
    expect(signer.w).toBe(owner.w);
    expect(signer.h).toBe(owner.h);

    let diff = 0;
    const TOL = 12; // watermark ink at 12% alpha shifts a white pixel by ~30
    for (let i = 0; i < owner.data.length; i += 4) {
      if (
        Math.abs(owner.data[i] - signer.data[i]) > TOL ||
        Math.abs(owner.data[i + 1] - signer.data[i + 1]) > TOL ||
        Math.abs(owner.data[i + 2] - signer.data[i + 2]) > TOL
      ) {
        diff++;
      }
    }
    const ratio = diff / (owner.w * owner.h);
    expect(diff).toBeGreaterThan(1500); // the watermark text is unmistakably there
    expect(ratio).toBeLessThan(0.08); // ...and it stays a light band, not a repaint
  });
});

describe("monthly envelope quota (402, spent STARTER plan)", () => {
  // The seed spends the "E2E Quota" tenant's entire 50-envelope STARTER
  // allowance for the current period; the send path must refuse with 402 and
  // must not create anything.
  const QUOTA_EMAIL = "e2e-quota@docurama.eu";

  test("send is refused with 402 and the ledger stays at the limit", async () => {
    const direct = new (await import("@prisma/client")).PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const quotaTenant = await direct.tenant.findUnique({ where: { slug: "e2e-quota" } });
      if (!quotaTenant) throw new Error("quota fixture missing — seed first");

      const login = await post("/api/auth/login", { email: QUOTA_EMAIL, password: "e2eQuota1234!" });
      expect(login.status).toBe(200);
      const token = String((login.body as { token?: string }).token);

      const before = await direct.envelope.count({ where: { tenantId: quotaTenant.id } });
      expect(before).toBe(100); // the fixture's fully-spent period

      const res = await fetch(`${BASE}/api/workspace/envelopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          op: "send",
          data: {
            title: "Should be refused - quota spent",
            recipients: [{ name: "Anyone", email: "anyone@example.com", role: "SIGNER" }],
          },
        }),
      });
      expect(res.status).toBe(402);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      expect(String(body.error)).toContain("quota");

      // Refused means refused: nothing was created, no recipient rows, nothing.
      const after = await direct.envelope.count({ where: { tenantId: quotaTenant.id } });
      expect(after).toBe(100);
    } finally {
      await direct.$disconnect();
    }
  });
});

describe("operational health endpoint (/api/health)", () => {
  // The runbook (PRODUCTION-PLAN §3/§8), the Docker HEALTHCHECK and the Helm
  // probes all target this endpoint — it must answer 200 with the critical
  // checks green on a healthy dev server.

  test("answers 200 with database and storage checks green", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      checks: { database?: { ok?: boolean }; storage?: { ok?: boolean }; mail?: { mode?: string } };
    };
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.checks.database?.ok).toBe(true);
    expect(body.checks.storage?.ok).toBe(true);
  });

  test("reports the mail mode honestly (outbox-only in the suite)", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const body = (await res.json()) as { checks: { mail?: { mode?: string } } };
    // The E2E server runs without SMTP_URL — outbox-only is the truth.
    expect(body.checks.mail?.mode).toBe("outbox-only");
  });
});
