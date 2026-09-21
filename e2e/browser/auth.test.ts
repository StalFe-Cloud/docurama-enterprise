/// <reference types="bun-types" />

/**
 * Authentication surfaces — browser suite (Playwright).
 *
 * Ports e2e/flows/auth/*.yaml off Maestro. See e2e/browser/public.test.ts for
 * the translation conventions.
 *
 * login-demo requires NEXT_PUBLIC_DEMO_MODE=true (the default in .env.example
 * and in CI; e2e/run.sh forces it on when it boots the server).
 *
 * Run: bun test e2e/browser/auth.test.ts   (needs a server at E2E_BASE_URL)
 */

import { afterAll, beforeAll, describe, test } from "bun:test";
import type { Browser } from "playwright";
import {
  ACCOUNTS, clickByName, clickText, closeBrowser, goto, launchBrowser,
  seeText, withPage,
} from "./harness";

const SKIP = process.env.E2E_SKIP_BROWSER === "1";

describe("authentication", () => {
  let browser: Browser | null = null;

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

  /* ── login.yaml ────────────────────────────────────────────────────────── */
  flow("signing in with E2E credentials reaches the workspace", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/login");
      await seeText(page, "Sign in to your portal", 30_000);

      await page.locator("#email").fill(ACCOUNTS.workspace.email);
      await page.locator("#password").fill(ACCOUNTS.workspace.password);
      await clickByName(page, /Sign in securely/);

      // Workspace shell: welcome header + section nav.
      await seeText(page, /Welcome back/, 30_000);
      await seeText(page, "Documents");
      await seeText(page, "Templates");
      await seeText(page, "Verify");
    }));

  /* ── login-wrong-password.yaml ─────────────────────────────────────────── */
  flow("a wrong password shows an inline error and keeps the user out", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/login");
      await seeText(page, "Sign in to your portal", 30_000);

      await page.locator("#email").fill(ACCOUNTS.workspace.email);
      await page.locator("#password").fill("definitely-not-the-password");
      await clickByName(page, /Sign in securely/);

      await seeText(page, "Invalid email or password");
      // Still on the sign-in screen.
      await seeText(page, "Sign in to your portal");
    }));

  /* ── login-demo.yaml ───────────────────────────────────────────────────── */
  flow("demo one-click buttons enter the platform admin console", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/login");
      await seeText(page, /Demo accounts/, 30_000);
      await seeText(page, /Platform Admin/);

      // One click, no typing.
      await clickByName(page, /Platform Admin/);

      // PLATFORM_ADMIN lands in the admin shell (overview section).
      await seeText(page, "Platform overview", 30_000);
      await seeText(page, "Active tenants");
    }));

  /* ── logout.yaml ───────────────────────────────────────────────────────── */
  flow("signing out returns to the sign-in screen", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/login");
      await seeText(page, "Sign in to your portal", 30_000);

      await page.locator("#email").fill(ACCOUNTS.workspace.email);
      await page.locator("#password").fill(ACCOUNTS.workspace.password);
      await clickByName(page, /Sign in securely/);
      await seeText(page, /Welcome back/, 30_000);

      // Account menu — the avatar carries the signed-in name.
      await clickText(page, "Ella Tester");
      await clickByName(page, /Sign out/);

      // Session gone — back to the sign-in form.
      await seeText(page, "Sign in to your portal", 30_000);
    }));

  /* ── forgot-password.yaml ──────────────────────────────────────────────── */
  flow("the forgot-password flow shows the inbox confirmation", async (b) =>
    withPage(b, async (page) => {
      await goto(page, "/login");
      await seeText(page, "Sign in to your portal", 30_000);

      await clickText(page, "Forgot password?");
      await seeText(page, "Reset your password");

      await page.locator("#forgot-email").fill(ACCOUNTS.workspace.email);
      await clickByName(page, /Send reset link/);

      // Anti-enumeration: the same screen whether or not the account exists.
      await seeText(page, "Check your inbox");

      await clickByName(page, /Back to sign in/);
      await seeText(page, "Sign in to your portal");
    }));
});
