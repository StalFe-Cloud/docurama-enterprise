/// <reference types="bun-types" />

/**
 * Public surfaces — browser suite (Playwright).
 *
 * Ports e2e/flows/public/*.yaml off Maestro. Behaviour is preserved flow for
 * flow; only the driver changed. Notes on the translation:
 *
 *  - The tolerant " ?Text ?" regexes existed because Maestro's accessibility
 *    tree carried leading spaces from icon-adjacent text nodes. Playwright
 *    normalises whitespace, so plain strings/regexes are used here.
 *  - extendedWaitUntil is gone: Playwright locators auto-wait. Explicit
 *    timeouts are kept only where a route cold-compiles in dev mode.
 *  - scrollUntilVisible is only needed where the flow asserts on something
 *    below the fold without clicking it; Playwright scrolls before acting.
 *
 * Run: bun test e2e/browser/public.test.ts   (needs a server at E2E_BASE_URL)
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser } from "playwright";
import {
  BASE, clickByName, clickText, closeBrowser, goto, launchBrowser,
  scrollToText, seeText, withPage,
} from "./harness";

const SKIP = process.env.E2E_SKIP_BROWSER === "1";

describe("public surfaces", () => {
  let browser: Browser | null = null;

  // Cold Chromium start on a loaded shared runner far exceeds bun:test's 5s
  // default hook timeout (same note as e2e/visual.test.ts).
  beforeAll(async () => {
    if (SKIP) return;
    browser = await launchBrowser();
  }, 90_000);

  // 30s: bun:test's default hook timeout is 5s, but closing Chromium races a
  // 10s guard (see closeBrowser) and on Windows the close itself can exceed
  // 5s — which surfaced as an "(unnamed)" afterAll failure plus a dangling
  // process, with every actual flow green.
  afterAll(async () => {
    await closeBrowser(browser);
    browser = null;
  }, 30_000);

  const flow = (name: string, fn: (b: Browser) => Promise<void>, timeout = 120_000) =>
    test(name, async () => {
      if (SKIP) return;
      if (!browser) throw new Error("No Chromium browser — see beforeAll");
      await fn(browser);
    }, timeout);

  /* ── marketing.yaml ────────────────────────────────────────────────────── */
  flow("marketing home renders and the CTA routes to signup", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/");
      // 30s: this page cold-compiles slowly and the hero animates in.
      await seeText(page, /Sign documents/, 30_000);
      await seeText(page, "Prove everything.");
      await seeText(page, "Product");
      await seeText(page, "Pricing");
      await seeText(page, "Documentation");
      await clickByName(page, /Start free trial/);
      await seeText(page, "Welcome to Docurama", 30_000);
    }));

  /* ── pricing.yaml ──────────────────────────────────────────────────────── */
  flow("pricing shows plans, term discounts and outcome framing", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/marketing");
      // Jump via the nav anchor: the hero-fold layout makes raw scrolling flaky.
      await clickByName(page, /^Pricing$/);
      await seeText(page, "Simple, EU-priced plans", 20_000);

      for (const plan of ["Solo", "Starter", "Business", "Enterprise"]) {
        await seeText(page, plan);
      }
      await seeText(page, /no engagement/);

      // The promotional term switch applies the 12-month discount.
      await clickText(page, /12 months/);
      await seeText(page, /20%/);
      await clickText(page, /^Monthly/);

      // Outcome framing replaced the old "most popular" highlight.
      await scrollToText(page, /With Solo you/);
      await seeText(page, /With Starter you/);
      await scrollToText(page, /weekends are on us/);
    }));

  /* ── blog.yaml ─────────────────────────────────────────────────────────── */
  flow("blog index and article render the launch posts", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/blog");
      await seeText(page, "Evidence-grade signing, explained.", 30_000);

      await clickText(page, /Docurama is live/);
      await seeText(page, /Docurama is live: sign documents, prove everything/);
      await seeText(page, "Docurama Team");

      // Markdown body rendered, not raw markdown text.
      await scrollToText(page, /What we built/);
      // The pricing table inside the post renders its rows.
      await scrollToText(page, /Business/);

      await clickByName(page, /All posts/);
      await seeText(page, "Evidence-grade signing, explained.");
    }));

  /* ── platform-pages.yaml ───────────────────────────────────────────────── */
  flow("docs, developers and status pages render", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/docs");
      await seeText(page, "Documentation");

      await goto(page, "/developers");
      await seeText(page, "Built API-first");

      await goto(page, "/status");
      await seeText(page, "System status");
      await seeText(page, /All systems operational/);
    }));

  /* ── modeles-de-contrats.yaml ──────────────────────────────────────────── */
  flow("french contract catalog renders with statutory templates", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/modeles-de-contrats");
      // The 8 built-in Droit Français templates are reachable without an account.
      await seeText(page, "Modèles de Contrats Prêts à Signer");
      await seeText(page, /Droit Français & Code Civil/);
      await seeText(page, /Utiliser ce modèle/);
    }));

  /* ── enterprise-lead.yaml ──────────────────────────────────────────────── */
  flow("enterprise lead form submits and confirms", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/enterprise");
      await seeText(page, /Enterprise/, 30_000);

      // Unique address per run: the endpoint soft-throttles a repeat from the
      // same address for 10 minutes and answers 429. A fixed address made this
      // flow pass only on a freshly-copied database, which is how the Maestro
      // runner happened to work; e2e/seed.ts sweeps the e2e-lead- prefix.
      await page.getByLabel(/Your name/).fill("Erika Werner");
      await page.getByLabel(/Work email/).fill(`e2e-lead-${Date.now()}@example.com`);
      await page.getByLabel(/Company/).fill("Werner Stahlbau GmbH");

      await clickByName(page, /Send to the Enterprise team/);
      await seeText(page, /Request received/, 20_000);
    }));

  /* ── sign-invalid-token.yaml ───────────────────────────────────────────── */
  flow("signer portal rejects invalid links gracefully", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/sign/definitely-not-a-real-token");
      // 30s: on a freshly-booted dev server this compiles /sign/{token}.
      await seeText(page, "This signing link is not valid", 30_000);
      await seeText(page, "Secure signing");
    }));

  /* ── verify-sealed.yaml ────────────────────────────────────────────────── */
  flow("verify portal confirms a sealed document", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/verify");
      await seeText(page, "Verify a document");
      await page.getByLabel(/Verification code/).fill("DOC-E2E0002");
      await clickByName(page, /^Verify$/);
      await seeText(page, /Completion record found/, 20_000);
      await seeText(page, "E2E Fixture — Supply Agreement (sealed)");
    }));

  /* ── verify-notfound.yaml ──────────────────────────────────────────────── */
  flow("verify portal reports unknown codes honestly", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/verify");
      await seeText(page, "Verify a document");
      await page.getByLabel(/Verification code/).fill("DOC-DOESNOTEXIST");
      await clickByName(page, /^Verify$/);
      await seeText(page, /No sealed document with this code/);
    }));

  /* ── verify-attested.yaml ──────────────────────────────────────────────── */
  flow("verify portal serves self-hosted attestations honestly", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/verify");
      await seeText(page, "Verify a document");
      await page.getByLabel(/Verification code/).fill("DOC-E2EATST");
      await clickByName(page, /^Verify$/);

      await seeText(page, /Verified - attested by a self-hosted Docurama instance/, 20_000);
      await seeText(page, "Acme Corp (self-hosted fixture)");

      await scrollToText(page, /Sender domain verified via DNS TXT: acme-corp\.example/);

      // Honest labelling: fingerprint only, no local document claim.
      await seeText(page, "Signers on record");
      await seeText(page, "SHA-256 digest (as attested)");

      // Transparency registry: the fixture is witnessed in the append-only log.
      await seeText(page, "Transparency registry");
      await seeText(page, "Entry #1 in the public append-only log");
      await scrollToText(page, /\/api\/transparency\/proof\/DOC-E2EATST/);
    }));

  test("base URL is configured", () => {
    expect(BASE).toMatch(/^https?:\/\//);
  });
});
