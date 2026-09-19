/// <reference types="bun-types" />

/**
 * Bot guard unit + route tests — src/lib/bot-guard.ts.
 *
 * Hermetic: the lib is exercised directly (time trap, honeypot, forged
 * timestamps, Turnstile against a local stub) plus the enterprise-lead
 * route's rejection paths. Runs in its own process because it owns
 * NEXT_PUBLIC_DEMO_MODE and TURNSTILE_SECRET_KEY.
 */

import { describe, expect, test, afterAll } from "bun:test";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Database } from "bun:sqlite";

const SCRATCH = join(mkdtempSync(join(tmpdir(), "botguard-e2e-")), "scratch.db");
process.env.DATABASE_URL = `file:${SCRATCH.replace(/\\/g, "/")}`;
new Database(SCRATCH, { create: true }).close();
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: process.env, stdio: "pipe" });
process.env.NEXT_PUBLIC_DEMO_MODE = "false"; // the timing path stays ON here
delete process.env.TURNSTILE_SECRET_KEY;

const lib = await import("../src/lib/bot-guard");
const leadRoute = await import("../src/app/api/enterprise-lead/route");
const { db } = await import("../src/lib/db");

// A local siteverify stub for the Turnstile layer.
const turnstileStub = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const body = new URLSearchParams(await req.text());
    if (req.method !== "POST" || body.get("secret") !== "stub-secret" || !body.get("response") || body.has("token")) {
      return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
    }
    if (url.pathname === "/siteverify-ok") return Response.json({ success: true });
    if (url.pathname === "/siteverify-fail") return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
    if (url.pathname === "/siteverify-malformed") return Response.json({ success: "false" });
    if (url.pathname === "/siteverify-network-fail") return new Response("unavailable", { status: 503 });
    return new Response("not found", { status: 404 });
  },
});

afterAll(async () => {
  await db.$disconnect();
  turnstileStub.stop(true);
  rmSync(join(SCRATCH, ".."), { recursive: true, force: true });
});

const startedAgo = (ms: number) => Date.now() - ms;

describe("bot guard (lib)", () => {
  test("a human-paced, honeypot-empty submission passes", async () => {
    const v = await lib.checkBotGuard({ website: "", formStartedAt: startedAgo(8_000) });
    expect(v.ok).toBe(true);
  });

  test("a filled honeypot is rejected 403", async () => {
    const v = await lib.checkBotGuard({ website: "http://spam.example", formStartedAt: startedAgo(8_000) });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(403);
  });

  test("a machine-speed submission is rejected 400", async () => {
    const v = await lib.checkBotGuard({ website: "", formStartedAt: startedAgo(400) });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(400);
    expect(v.error).toContain("too fast");
  });

  test("a missing formStartedAt (scripted post) is rejected 400", async () => {
    const v = await lib.checkBotGuard({ website: "" });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(400);
  });

  test("a forged far-future timestamp is rejected 403", async () => {
    const v = await lib.checkBotGuard({ website: "", formStartedAt: Date.now() + 7_200_000 });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(403);
  });

  test("demo mode disables the time trap but keeps the honeypot", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    expect((await lib.checkBotGuard({ website: "", formStartedAt: startedAgo(10) })).ok).toBe(true);
    expect((await lib.checkBotGuard({ website: "spam" })).ok).toBe(false);
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  });

  test("Turnstile: a valid token passes, an invalid one is rejected", async () => {
    process.env.TURNSTILE_SECRET_KEY = "stub-secret";
    process.env.TURNSTILE_SITEVERIFY_URL = `http://127.0.0.1:${turnstileStub.port}/siteverify-ok`;
    const ok = await lib.checkBotGuard({ website: "", formStartedAt: startedAgo(8_000), turnstileToken: "tok" });
    expect(ok.ok).toBe(true);

    process.env.TURNSTILE_SITEVERIFY_URL = `http://127.0.0.1:${turnstileStub.port}/siteverify-fail`;
    const bad = await lib.checkBotGuard({ website: "", formStartedAt: startedAgo(8_000), turnstileToken: "tok" });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(403);

    for (const path of ["siteverify-malformed", "siteverify-network-fail"]) {
      process.env.TURNSTILE_SITEVERIFY_URL = `http://127.0.0.1:${turnstileStub.port}/${path}`;
      expect((await lib.checkBotGuard({ formStartedAt: startedAgo(8_000), turnstileToken: "tok" })).ok).toBe(false);
    }
    expect((await lib.checkBotGuard({ formStartedAt: startedAgo(8_000) })).status).toBe(400);
    expect((await lib.checkBotGuard({ formStartedAt: startedAgo(8_000), turnstileToken: "x".repeat(2049) })).status).toBe(400);

    delete process.env.TURNSTILE_SITEVERIFY_URL;
    delete process.env.TURNSTILE_SECRET_KEY;
  });
});

describe("bot guard (enterprise-lead route)", () => {
  const post = (body: unknown) =>
    leadRoute.POST(
      new Request("http://127.0.0.1:3000/api/enterprise-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

  test("a honeypot-filled lead is rejected before any validation", async () => {
    const res = await post({
      company: "Bot Industries", contactName: "Bot", email: "bot@bots.example",
      website: "http://spam.example", formStartedAt: startedAgo(8_000),
    });
    expect(res.status).toBe(403);
    const lead = await db.enterpriseLead.findFirst({ where: { email: "bot@bots.example" } });
    expect(lead).toBeNull();
  });

  test("a scripted (no timestamp) lead is rejected 400", async () => {
    const res = await post({ company: "Bot Industries", contactName: "Bot", email: "bot2@bots.example" });
    expect(res.status).toBe(400);
  });

  test("a machine-speed lead is rejected 400", async () => {
    const res = await post({
      company: "Bot Industries", contactName: "Bot", email: "bot3@bots.example",
      website: "", formStartedAt: startedAgo(200),
    });
    expect(res.status).toBe(400);
  });
});
