/// <reference types="bun-types" />

/**
 * Visual regression smoke for the public surfaces + an LCP budget.
 *
 * Run: bun test e2e/visual.test.ts   (run.sh wires it after the API suites)
 *
 * Each route is loaded in a frozen, deterministic Chromium context (fixed
 * viewport, light scheme, reduced motion, animations finished, dev overlay
 * hidden), screenshotted, and compared against the committed baseline in
 * e2e/baselines/. Per-pixel tolerance 32 with at most 5% of pixels
 * differing. The budget is cross-ENVIRONMENT: baselines are captured with
 * one Chromium build and CI runs another, and text rasterization
 * (antialiasing/hinting) differs measurably between them — untouched pages
 * drifted 2.8–4.1% between the local Chrome-for-Testing and the GitHub
 * runner's system Chrome (cycle-8 CI run). 5% clears that noise with margin
 * and stays far below any real layout break (a missing hero section moves
 * 15-60% of pixels). Locally, unchanged pages re-diff at 0.00%.
 *
 * Chromium resolution is shared with the browser suites — see findChrome in
 * e2e/browser/harness.ts (CHROME_BIN, then a Playwright-managed build, then
 * PATH, then the well-known Windows install locations).
 *
 * Baselines are part of the repo. After an INTENTIONAL redesign, regenerate
 * and commit them:
 *
 *   UPDATE_BASELINES=1 bun test e2e/visual.test.ts
 *
 * A route with no baseline yet is screenshotted, baselined and passes — the
 * suite fails only when a page drifts away from its committed look.
 *
 * LCP: measured on the two marketing conversion surfaces (/ and /templates)
 * with a 6s gate after explicit dev-route compilation in a discarded browser
 * context. Each measured navigation uses a fresh client, so browser caching
 * cannot hide heavy assets. This is not a production performance benchmark.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { join, dirname } from "path";
import { findChrome } from "./browser/harness";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const BASELINES_DIR = join(dirname(import.meta.path), "baselines");
const UPDATE = process.env.UPDATE_BASELINES === "1";

/**
 * The committed baselines are captured on Linux (CI is the reference
 * environment). The 5% budget below covers Chromium-build variation on the
 * SAME platform — measured 2.8-4.1%. Cross-platform is a different scale:
 * Windows DirectWrite vs Linux FreeType rasterises text differently enough to
 * drift 7-12% on untouched pages, so comparing there reports failures that say
 * nothing about the page.
 *
 * Off-platform we still drive the browser, load every route, assert no page
 * error and enforce the LCP budget — only the pixel comparison is skipped, and
 * loudly. Set VISUAL_COMPARE=1 to force it (e.g. after regenerating baselines
 * locally, which you should not commit from a non-Linux machine).
 */
const BASELINE_PLATFORM = "linux";
const CAN_COMPARE =
  process.platform === BASELINE_PLATFORM || process.env.VISUAL_COMPARE === "1" || UPDATE;

const VIEWPORT = { width: 1280, height: 800 };
const PIXEL_TOLERANCE = 32; // max per-channel shift that still counts as "same"
const MAX_DIFF_RATIO = 0.05; // ≤5% of pixels may differ (cross-Chromium font rasterization; see header)
const LCP_BUDGET_MS = 6000;

const ROUTES: { name: string; path: string; lcpBudget?: boolean }[] = [
  { name: "home", path: "/", lcpBudget: true },
  { name: "templates", path: "/templates", lcpBudget: true },
  { name: "modeles-de-contrats", path: "/modeles-de-contrats" },
  { name: "docs", path: "/docs" },
  { name: "developers", path: "/developers" },
  { name: "status", path: "/status" },
  { name: "login", path: "/login" },
];

/** Decode a PNG into raw RGBA pixels via napi-canvas (no new deps). */
async function decodePng(bytes: Buffer) {
  const { loadImage, createCanvas } = await import("@napi-rs/canvas");
  const img = await loadImage(bytes);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return {
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width,
    height: canvas.height,
  };
}

function countDiff(
  a: { data: Uint8ClampedArray; width: number; height: number },
  b: { data: Uint8ClampedArray; width: number; height: number },
): { diff: number; ratio: number } {
  if (a.width !== b.width || a.height !== b.height) {
    return { diff: Infinity, ratio: Infinity };
  }
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > PIXEL_TOLERANCE ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > PIXEL_TOLERANCE ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > PIXEL_TOLERANCE
    ) {
      diff++;
    }
  }
  return { diff, ratio: diff / (a.width * a.height) };
}

/** Sanity for fresh baselines: the page must not be a blank/uniform sheet. */
function distinctColors(img: { data: Uint8ClampedArray }): number {
  const seen = new Set<number>();
  for (let i = 0; i < img.data.length; i += 4 * 7) {
    const key = ((img.data[i] >> 4) << 8) | ((img.data[i + 1] >> 4) << 4) | (img.data[i + 2] >> 4);
    seen.add(key);
    if (seen.size > 512) break; // plenty
  }
  return seen.size;
}

describe("visual regression smoke (marketing surfaces)", () => {
  // One shared browser for the whole file — launching a fresh Chromium per
  // route is slow and, in constrained CI containers, prone to teardown
  // deadlocks. Each route still gets its own pristine context.
  let browser: import("playwright").Browser | null = null;

  beforeAll(async () => {
    if (process.env.E2E_SKIP_VISUAL === "1") return;
    const executablePath = findChrome();
    if (!executablePath) {
      throw new Error(
        "No Chromium found — set CHROME_BIN, install one via `bunx playwright install chromium`, " +
          "or skip this suite explicitly with E2E_SKIP_VISUAL=1.",
      );
    }
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
  }, 90_000); // cold Chromium start on a loaded shared runner can far exceed
  // bun:test's 5s default hook timeout (observed as a flaky beforeAll abort
  // on GitHub runners — the suite itself then "fails" unnamed).

  afterAll(async () => {
    if (browser) {
      // Race the close: a wedged Chromium must not hang the whole suite.
      await Promise.race([
        browser.close().catch(() => undefined),
        new Promise((r) => setTimeout(r, 10_000)),
      ]);
      browser = null;
    }
  });

  for (const route of ROUTES) {
    test(
      `${route.name}: matches its committed baseline${route.lcpBudget ? " (LCP budget)" : ""}`,
      async () => {
        if (process.env.E2E_SKIP_VISUAL === "1") return; // explicit opt-out
        if (!browser) throw new Error("No Chromium browser — see beforeAll");

        // Compile this owned dev route and its browser chunks immediately
        // before measuring. Discard the warm client so the actual navigation
        // still pays network/decoding/rendering costs with empty browser caches.
        const warmContext = await browser.newContext({ viewport: VIEWPORT });
        try {
          const warmPage = await warmContext.newPage();
          const response = await warmPage.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 60_000 });
          expect(response?.ok()).toBe(true);
        } finally {
          await warmContext.close();
        }

        const context = await browser.newContext({
          viewport: VIEWPORT,
          deviceScaleFactor: 1,
          reducedMotion: "reduce",
          colorScheme: "light",
          locale: "en-US",
          timezoneId: "Europe/Paris",
        });
        try {
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push(String(e)));

          await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 60000 });
          await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

          // Determinism: hide the Next.js dev overlay and fast-forward every
          // animation to its final state before the screenshot.
          await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
          await page.evaluate(() => {
            (document as any).getAnimations?.().forEach?.((a: any) => {
              try {
                a.finish();
              } catch {
                /* infinite/undecorated animations are left as-is */
              }
            });
          });
          await page.waitForTimeout(400);

          // LCP (informational everywhere, gated on the conversion surfaces).
          const lcp = await Promise.race([
            page.evaluate(() =>
              new Promise<number>((resolve) => {
                const seen = performance.getEntriesByType("largest-contentful-paint") as PerformanceEntry[];
                if (seen.length) return resolve(seen[seen.length - 1].startTime);
                const obs = new PerformanceObserver((list) => {
                  const es = list.getEntries();
                  if (es.length) resolve(es[es.length - 1].startTime);
                });
                obs.observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
                setTimeout(() => resolve(-1), 2500);
              }),
            ),
            new Promise<number>((r) => setTimeout(() => r(-1), 8000)),
          ]);

          const shot = Buffer.from(await page.screenshot({ type: "png", fullPage: false }));
          expect(errors).toEqual([]); // a page that threw is a failed render

          const live = await decodePng(shot);
          expect(distinctColors(live)).toBeGreaterThan(24); // not a blank sheet

          const baselinePath = join(BASELINES_DIR, `${route.name}.png`);
          if (!CAN_COMPARE && existsSync(baselinePath)) {
            // Off the baseline platform: skip the pixel diff, keep the LCP gate.
            console.log(
              `   ⚠ ${route.name}: baseline comparison skipped on ${process.platform} ` +
                `(baselines are ${BASELINE_PLATFORM}-captured; VISUAL_COMPARE=1 to force)`,
            );
          } else if (UPDATE || !existsSync(baselinePath)) {
            mkdirSync(BASELINES_DIR, { recursive: true });
            writeFileSync(baselinePath, shot);
            console.log(
              `   📸 ${route.name}: baseline ${UPDATE ? "regenerated" : "created"} (${live.width}x${live.height}` +
                `${lcp >= 0 ? `, LCP ${Math.round(lcp)}ms` : ""})`,
            );
          } else {
            const baseline = await decodePng(readFileSync(baselinePath));
            const { diff, ratio } = countDiff(baseline, live);
            if (ratio > MAX_DIFF_RATIO) {
              const failPath = join(BASELINES_DIR, `${route.name}.FAILED.png`);
              writeFileSync(failPath, shot);
              throw new Error(
                `${route.name} drifted from its baseline: ${(ratio * 100).toFixed(2)}% of pixels differ ` +
                  `(budget ${(MAX_DIFF_RATIO * 100).toFixed(1)}%, ${diff} px). ` +
                  `If the change is intentional: UPDATE_BASELINES=1 bun test e2e/visual.test.ts, then commit ` +
                  `e2e/baselines/. Current shot saved to ${failPath}.`,
              );
            }
            console.log(
              `   ✔ ${route.name}: diff ${(ratio * 100).toFixed(2)}%` +
                `${lcp >= 0 ? `, LCP ${Math.round(lcp)}ms` : ", LCP n/a"}`,
            );
          }

          // Reached on every path now. Previously the baseline-create/regenerate
          // branch returned early and silently skipped this gate.
          if (route.lcpBudget) {
            expect(lcp).toBeGreaterThan(0);
            expect(lcp).toBeLessThan(LCP_BUDGET_MS);
          }
        } finally {
          await context.close().catch(() => undefined);
        }
      },
      120_000, // cold route compile in dev mode can be slow
    );
  }
});
