/// <reference types="bun-types" />

/**
 * Platform admin console — browser suite (Playwright).
 *
 * Ports e2e/flows/admin/*.yaml off Maestro. See e2e/browser/public.test.ts for
 * the translation conventions.
 *
 * Run: bun test e2e/browser/admin.test.ts   (needs a server at E2E_BASE_URL)
 */

import { afterAll, beforeAll, describe, test } from "bun:test";
import type { Browser } from "playwright";
import {
  ACCOUNTS, clickByName, clickText, closeBrowser, launchBrowser,
  seePlaceholder, seeText, signInAdmin, withPage,
} from "./harness";

const SKIP = process.env.E2E_SKIP_BROWSER === "1";

describe("platform admin console", () => {
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

  const flow = (name: string, fn: (b: Browser) => Promise<void>, timeout = 120_000) =>
    test(name, async () => {
      if (SKIP) return;
      if (!browser) throw new Error("No Chromium browser — see beforeAll");
      await fn(browser);
    }, timeout);

  /* ── overview.yaml ─────────────────────────────────────────────────────── */
  flow("the overview shows platform KPIs", async (b) =>
    withPage(b, async (page) => {
      await signInAdmin(page);
      await seeText(page, "Active tenants");
      await seeText(page, "Platform users");
      await seeText(page, "Envelopes (30d)");
    }));

  /* ── users.yaml ────────────────────────────────────────────────────────── */
  flow("the users directory lists and searches users", async (b) =>
    withPage(b, async (page) => {
      await signInAdmin(page);

      await clickText(page, "Users");
      // A placeholder, not rendered text — see seePlaceholder.
      await seePlaceholder(page, "Search by name, email or tenant…");

      // The E2E seed account is in the directory.
      await seeText(page, ACCOUNTS.workspace.email);
    }));

  /* ── settings.yaml ─────────────────────────────────────────────────────── */
  flow("platform settings render the SMTP and TSA cards", async (b) =>
    withPage(b, async (page) => {
      await signInAdmin(page);

      await clickText(page, /Platform Settings/);
      await seeText(page, /Email delivery \(SMTP\)/);
      await seeText(page, /Save SMTP/);
      await seeText(page, /Save TSA/);
    }));
});
