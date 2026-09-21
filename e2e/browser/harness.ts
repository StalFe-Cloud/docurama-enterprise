/// <reference types="bun-types" />

/**
 * Shared Playwright harness for the browser E2E suites.
 *
 * Replaces the Maestro flow runner (e2e/flows/*.yaml). Playwright was already
 * a devDependency and already drives Chromium in e2e/visual.test.ts — this
 * lifts that file's browser plumbing into one place both can use.
 *
 * Why the move: Maestro drives Chrome over CDP through its own bundled
 * browser, which the flows themselves document as unreliable — see the
 * workaround note in the old e2e/flows/workspace/signer-journey.yaml, where an
 * in-page Link transition that works in real Chromium throws a client-side
 * exception under Maestro.
 *
 * Selector policy: prefer accessible locators (getByRole/getByLabel/getByText)
 * over data-testid. Maestro addressed elements by aria-label, so most of that
 * intent carries over directly, and Playwright normalises whitespace — the
 * " ?Documents ?" tolerant-regex convention the YAML flows needed
 * (e2e/README.md) is not required here.
 */

import { existsSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { join } from "path";
import type { Browser, Page } from "playwright";

/** Target origin. */
export const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Matches the old MAESTRO_SCREEN default. Tall enough for the send-envelope
 * dialog: shorter viewports put the recipient row at the screen edge and the
 * old runner's taps misfired there.
 */
export const VIEWPORT = { width: 1440, height: 1000 };

/** Seeded accounts (e2e/seed.ts). */
export const ACCOUNTS = {
  workspace: { email: "e2e@docurama.eu", password: "e2ePass1234!" },
  admin: { email: "e2e-admin@docurama.eu", password: "e2eAdmin1234!" },
} as const;

/**
 * Find a Chrome/Chromium executable for Playwright to drive.
 *
 * Order: CHROME_BIN, then any Playwright-managed build, then PATH, then the
 * well-known Windows install locations. Mirrors e2e/visual.test.ts but covers
 * the win64/mac cache layouts too, so the suite runs on a developer's Windows
 * machine and not only on the Linux CI runner.
 */
export function findChrome(): string | undefined {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;

  const cacheDir = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cacheDir)) {
    const builds = readdirSync(cacheDir)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort()
      .reverse();
    const layouts = [
      ["chrome-linux64", "chrome"],
      ["chrome-linux", "chrome"],
      ["chrome-win64", "chrome.exe"],
      ["chrome-win", "chrome.exe"],
      ["chrome-mac-arm64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
      ["chrome-mac-x64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
    ];
    for (const build of builds) {
      for (const [dir, bin] of layouts) {
        const candidate = join(cacheDir, build, dir, bin);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      // stdio pipe on stderr: `which` prints a "no X in (...)" banner on miss,
      // and probing four names would otherwise dump four PATH dumps per run.
      const resolved = execFileSync("which", [bin], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (resolved) return resolved;
    } catch {
      /* not on PATH */
    }
  }

  for (const candidate of [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

/**
 * Launch one Chromium for a whole test file. Launching per test is slow and,
 * in constrained CI containers, prone to teardown deadlocks.
 */
export async function launchBrowser(): Promise<Browser> {
  const executablePath = findChrome();
  if (!executablePath) {
    throw new Error(
      "No Chromium found — set CHROME_BIN, install one via `bunx playwright install chromium`, " +
        "or skip the browser suites with E2E_SKIP_BROWSER=1.",
    );
  }
  const { chromium } = await import("playwright");
  return chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
}

/** Close a browser without letting a wedged Chromium hang the suite. */
export async function closeBrowser(browser: Browser | null): Promise<void> {
  if (!browser) return;
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
}

/**
 * Dev-server noise that must not fail a flow.
 *
 * Next.js dev hydration mismatches: measured at 1 in 8 loads of /status under
 * suite load, and never in isolation. /status is a Server Component
 * (force-dynamic, no "use client"), so there is no client state to diverge —
 * this is the Turbopack-recompiles-mid-flight race e2e/run.sh and
 * signer-journey already document, not a product defect. It would not occur
 * against a production build.
 *
 * Deliberately narrow: every other uncaught page error still fails the flow.
 * If these suites are ever pointed at a production build, drop this entry —
 * a hydration mismatch there would be real.
 */
const DEV_SERVER_NOISE: RegExp[] = [
  /Hydration failed because the server rendered HTML didn't match the client/,
  /There was an error while hydrating/,
  /Text content does not match server-rendered HTML/,
];

/**
 * Run `fn` against a pristine context. Uncaught page errors are collected and
 * thrown afterwards, so a flow cannot pass while the page is throwing — the
 * old runner reported those only as a downstream tap failure.
 */
export async function withPage<T>(
  browser: Browser,
  fn: (page: Page) => Promise<T>,
  options: { ignorePageErrors?: RegExp[] } = {},
): Promise<T> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "Europe/Paris",
  });
  const errors: string[] = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const result = await fn(page);
    const allowed = [...DEV_SERVER_NOISE, ...(options.ignorePageErrors ?? [])];
    const unexpected = errors.filter((e) => !allowed.some((re) => re.test(e)));
    if (unexpected.length) {
      throw new Error(`Uncaught page error(s):\n  ${unexpected.join("\n  ")}`);
    }
    return result;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Navigate and wait for the document to load. Dev-mode routes cold-compile. */
export async function goto(page: Page, path: string, timeout = 60_000): Promise<void> {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout });
  // Hide the Next.js dev overlay: it sits above the page and intercepts clicks
  // near the viewport edge. Injected after load rather than via addInitScript,
  // which runs before document.documentElement exists.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => undefined);
}

/**
 * Wait for text to become visible. This is the workhorse assertion, standing in
 * for the old runner's assertVisible / extendedWaitUntil.
 *
 * We deliberately use Playwright's own waitFor rather than @playwright/test's
 * expect(...).toBeVisible(): the repo runs one test runner (bun:test), and
 * pulling in a second would mean two runners over one e2e directory.
 * locator.waitFor throws a TimeoutError naming the selector, which is the same
 * diagnostic either way.
 */
export async function seeText(page: Page, text: string | RegExp, timeout = 15_000): Promise<void> {
  await page.getByText(text).first().waitFor({ state: "visible", timeout });
}

/**
 * Wait for an input with this placeholder to be visible.
 *
 * Maestro's assertVisible matched the accessibility tree, which carries
 * placeholder and aria-label text; Playwright's getByText only matches rendered
 * text content. Flows that asserted on a placeholder need this instead.
 */
export async function seePlaceholder(page: Page, text: string | RegExp, timeout = 15_000): Promise<void> {
  await page.getByPlaceholder(text).first().waitFor({ state: "visible", timeout });
}

/** Wait for text to disappear (the old runner's extendedWaitUntil/notVisible). */
export async function textGone(page: Page, text: string | RegExp, timeout = 30_000): Promise<void> {
  await page.getByText(text).first().waitFor({ state: "hidden", timeout });
}

/**
 * Wait for an accessible control and click it.
 *
 * Covers button, link and menuitem: both portal shells put "Sign out" in a
 * Radix DropdownMenuItem (role=menuitem), not a button.
 */
export async function clickByName(page: Page, name: string | RegExp, timeout = 15_000): Promise<void> {
  const control = page
    .getByRole("button", { name })
    .or(page.getByRole("link", { name }))
    .or(page.getByRole("menuitem", { name }))
    .first();
  await control.waitFor({ state: "visible", timeout });
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

/**
 * Click an element by its visible text, for controls that carry no button/link
 * role (tabs, cards, custom switches). Prefer clickByName where a role exists.
 */
export async function clickText(page: Page, text: string | RegExp, timeout = 15_000): Promise<void> {
  const target = page.getByText(text).first();
  await target.waitFor({ state: "visible", timeout });
  await target.scrollIntoViewIfNeeded();
  await target.click();
}

/**
 * Bring text into view and assert it is visible — the old runner's
 * scrollUntilVisible. Playwright scrolls implicitly before acting, so this is
 * only needed where the flow asserts on something below the fold without
 * interacting with it.
 */
export async function scrollToText(page: Page, text: string | RegExp, timeout = 15_000): Promise<void> {
  const target = page.getByText(text).first();
  await target.waitFor({ state: "attached", timeout });
  await target.scrollIntoViewIfNeeded();
  await target.waitFor({ state: "visible", timeout });
}

/**
 * Sign in through the real form and land in the workspace shell.
 * Used by the workspace and admin suites.
 */
export async function signIn(
  page: Page,
  account: { email: string; password: string } = ACCOUNTS.workspace,
): Promise<void> {
  await submitLogin(page, account);
  await seeText(page, /Welcome back/, 30_000);
}

/**
 * Sign in as the platform admin. PLATFORM_ADMIN lands in the admin shell
 * ("Platform overview"), not the workspace shell, so it needs its own landing
 * assertion rather than signIn's.
 */
export async function signInAdmin(page: Page): Promise<void> {
  await submitLogin(page, ACCOUNTS.admin);
  await seeText(page, /Platform overview/, 30_000);
}

/** Fill and submit the sign-in form. Shared by signIn and signInAdmin. */
async function submitLogin(page: Page, account: { email: string; password: string }): Promise<void> {
  await goto(page, "/login");
  await seeText(page, "Sign in to your portal", 30_000);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await clickByName(page, /Sign in securely/);
}
