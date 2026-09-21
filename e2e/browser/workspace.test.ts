/// <reference types="bun-types" />

/**
 * Workspace and signer surfaces — browser suite (Playwright).
 *
 * Ports e2e/flows/workspace/*.yaml off Maestro. See e2e/browser/public.test.ts
 * for the translation conventions.
 *
 * STATE: unlike the public and auth suites, these flows mutate seeded
 * fixtures — they send envelopes, void one, decline DOC-E2E0003 and sign
 * DOC-E2E0004. Run `bun e2e/seed.ts` first; a second run against the same
 * database without reseeding will fail (you cannot decline an envelope twice).
 * That was equally true under Maestro, which relied on e2e/run.sh copying a
 * fresh db/custom.db for every run.
 *
 * ORDER: "signs an envelope end to end" must run before "verifies the sealed
 * signer-journey envelope" — the latter asserts DOC-E2E0004 is sealed, which
 * is what the former does. bun:test runs tests in declaration order, so the
 * dependency is preserved here, the same way the old runner's alphabetical
 * `find | sort` happened to order signer-journey before signer-verify-seal.
 * (e2e/README.md claims flow order never matters; for this pair it does.)
 *
 * Run: bun test e2e/browser/workspace.test.ts   (needs a server + fresh seed)
 */

import { afterAll, beforeAll, describe, test } from "bun:test";
import type { Browser } from "playwright";
import {
  clickByName, clickText, closeBrowser, goto, launchBrowser,
  seePlaceholder, seeText, signIn, textGone, withPage,
} from "./harness";

const SKIP = process.env.E2E_SKIP_BROWSER === "1";

describe("workspace and signer surfaces", () => {
  let browser: Browser | null = null;

  beforeAll(async () => {
    if (SKIP) return;
    browser = await launchBrowser();
  }, 90_000);

  // 30s: see the note in e2e/browser/auth.test.ts.
  afterAll(async () => {
    await closeBrowser(browser);
    browser = null;
  }, 30_000);

  const flow = (name: string, fn: (b: Browser) => Promise<void>, timeout = 180_000) =>
    test(name, async () => {
      if (SKIP) return;
      if (!browser) throw new Error("No Chromium browser — see beforeAll");
      await fn(browser);
    }, timeout);

  /* ── documents.yaml ────────────────────────────────────────────────────── */
  flow("the documents workspace renders its table and controls", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Documents/);
      await seeText(page, /New envelope/);
      await seeText(page, "All");
      await seeText(page, "Sent");
      await seePlaceholder(page, "Search documents…");
      await seeText(page, "E2E Fixture — Mutual NDA (sent)");
    }));

  /* ── templates-catalog.yaml ────────────────────────────────────────────── */
  flow("the templates catalog lists the statutory French templates", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Templates/);
      await seeText(page, /Use template/);
      await seeText(page, /Droit Français/);
    }));

  /* ── settings-billing.yaml ─────────────────────────────────────────────── */
  flow("settings billing shows plan, usage meters and payment history", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Settings/);
      await seeText(page, /Account/);
      await clickByName(page, /Billing/);

      await seeText(page, /Current plan/);
      await seeText(page, /Usage this period/);
      await seeText(page, /Envelopes/);
      await seeText(page, /Seats/);

      await seeText(page, /Change plan/);
      await seeText(page, /Request activation/);
      await seeText(page, /Payment history/);
    }));

  /* ── verify-sent.yaml ──────────────────────────────────────────────────── */
  flow("in-app verify shows the not-yet-sealed state for a sent envelope", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Verify/);
      await seeText(page, "Verify a document");

      await page.locator("#verify-code").fill("DOC-E2E0001");
      await page.locator('button[type="submit"]').first().click();

      await seeText(page, "Document found - not yet sealed");
    }));

  /* ── evidence-pack-export.yaml ─────────────────────────────────────────── */
  flow("a sealed envelope detail offers the evidence pack export", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Documents/);
      await seeText(page, /New envelope/);

      await clickText(page, "E2E Fixture — Supply Agreement (sealed)");
      await seeText(page, "Cryptographic evidence");

      await page.getByTestId("evidence-pack-download").first()
        .waitFor({ state: "visible", timeout: 15_000 });
      await seeText(page, /Evidence pack/);
      await seeText(page, "Conformance");
      await seeText(page, "SHA-256 digest");
    }));

  /* ── sign-link-handoff.yaml ────────────────────────────────────────────── */
  flow("envelope detail offers per-signer link copy and QR handoff", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Documents/);
      await seeText(page, /New envelope/);

      await clickText(page, /E2E Fixture — Mutual NDA/);
      await seeText(page, "Signers");

      // Both are icon buttons whose aria-label is the addressable name.
      for (const label of [
        "Copy signing link for Fixture Signer",
        "Show signing QR for Fixture Signer",
      ]) {
        await page.getByRole("button", { name: label }).first()
          .waitFor({ state: "visible", timeout: 15_000 });
      }
    }));

  /* ── envelope-send.yaml ────────────────────────────────────────────────── */
  flow("sends an envelope from a template end to end", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Templates/);
      await seeText(page, /Use template/);
      await clickByName(page, /Use template/);

      await seeText(page, "Send a document for signature");
      // fill() replaces the field outright — the old runner needed eraseText.
      await page.locator("#doc-title").fill("E2E Playwright NDA");
      await page.locator("#recipient-1-name").fill("Jonas Weber");
      await page.locator("#recipient-1-email").fill("jonas.weber@example.com");

      await clickByName(page, /Send for signature/);
      await seeText(page, /Sent to 1 recipient/);

      await clickByName(page, /Documents/);
      await seeText(page, "E2E Playwright NDA");
    }));

  /* ── envelope-void.yaml ────────────────────────────────────────────────── */
  flow("envelope detail shows signers and voiding works", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Documents/);
      await seeText(page, /New envelope/);
      await clickByName(page, /New envelope/);

      await seeText(page, "Send a document for signature");
      await page.locator("#doc-title").fill("E2E Void Fixture");
      await page.locator("#recipient-1-name").fill("Karla Blanc");
      await page.locator("#recipient-1-email").fill("karla.blanc@example.com");
      await clickByName(page, /Send for signature/);
      await seeText(page, /Sent to 1 recipient/);

      await clickText(page, "E2E Void Fixture");
      await seeText(page, "Signers");
      await seeText(page, "Karla Blanc");
      await seeText(page, "Audit trail");
      await clickByName(page, /^Close$/);
      await seeText(page, /New envelope/);

      // Icon button; its aria-label is `Void ${title}`.
      await page.getByRole("button", { name: "Void E2E Void Fixture" }).first().click();
      await seeText(page, "Void this envelope?");
      await page.getByRole("textbox").last().fill("E2E-fixture-voided-by-playwright-suite");
      await clickByName(page, /Void envelope/);
      await seeText(page, "Envelope voided");
    }));

  /* ── signer-decline.yaml ───────────────────────────────────────────────── */
  flow("a signer can decline to sign with a reason", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/sign/e2e-fixed-decline-token-0000000000000001");
      await seeText(page, /Document for your signature/, 30_000);

      await clickByName(page, /Decline to sign/);
      await seeText(page, /Decline to sign this document\?/);

      await page.locator("#decline-reason").fill("e2e-wrong-terms");
      await clickByName(page, /Confirm decline/);
      await seeText(page, "You declined to sign");
    }));

  /* ── signer-journey.yaml ───────────────────────────────────────────────── */
  // Must precede the seal verification below — it is what seals DOC-E2E0004.
  flow("a signer signs an envelope end to end and it seals", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/sign/e2e-fixed-journey-token-0000000000000001");
      await seeText(page, /Document for your signature/, 30_000);
      await seeText(page, /Service Agreement/);
      await seeText(page, "Signing now");

      // The pager sits below a bounded reader pane. Waiting for the spinner to
      // clear is the page's interactivity gate: the overlay only goes away once
      // client JS ran and the first page actually rendered.
      await seeText(page, /Document preview/);
      await seeText(page, "Page 1 of 4");
      await textGone(page, /Rendering page/, 30_000);

      await page.getByRole("button", { name: "Next page" }).first().click();
      await seeText(page, "Page 2 of 4");
      await page.getByRole("button", { name: "Previous page" }).first().click();
      await seeText(page, "Page 1 of 4");

      // Name comes prefilled from the invitation; pick a signature style.
      // The style swatches carry data-testid, not a DOM id (public-sign.tsx).
      await seeText(page, /Adopt your signature/);
      await page.getByTestId("font-great-vibes").click();

      await page.locator("#consent").click();
      await clickByName(page, /Sign document/);

      // Single signer, so the envelope seals immediately.
      await seeText(page, "Document signed");
      await seeText(page, /Envelope sealed/);
      await seeText(page, "DOC-E2E0004");
      await seeText(page, /Verify the seal/);
    }));

  /* ── signer-verify-seal.yaml ───────────────────────────────────────────── */
  // Depends on the signer journey above having sealed DOC-E2E0004.
  flow("the sealed signer-journey envelope verifies on the public portal", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/verify?code=DOC-E2E0004");
      await seeText(page, /Verified - cryptographic evidence found/, 30_000);
      await seeText(page, "E2E Fixture — Service Agreement (signer journey)");
      await seeText(page, "E2E Testing");
    }));
});
