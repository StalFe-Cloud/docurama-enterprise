/**
 * QA captures for the live-examples + bento demo + /developers work.
 *
 * Runs a local headless Chromium (Playwright) against the dev server and
 * captures:
 *  - the marketing hero fold at 1440x900 and 390x844
 *  - the bento table demo and verify demo mid-animation
 *  - every live-examples tab, mid-flow and at the end state
 *  - the /developers page
 *  - a video of one full examples loop + tab switches
 * plus any console errors encountered along the way.
 *
 * Usage: npx tsx scripts/qa-live-examples.ts [base]
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT = path.resolve("download/examples-qa");
fs.mkdirSync(OUT, { recursive: true });

const CHROME = path.join(
  process.env.HOME!,
  ".cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
);

type ConsoleMsg = { type: string; text: string };

async function newPage(browser: Awaited<ReturnType<typeof chromium.launch>>, w: number, h: number) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors: ConsoleMsg[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push({ type: m.type(), text: m.text() });
  });
  page.on("pageerror", (e) => errors.push({ type: "pageerror", text: String(e) }));
  return { ctx, page, errors };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  /* ── Desktop pass ─────────────────────────────────────────────── */
  {
    const { ctx, page, errors } = await newPage(browser, 1440, 900);
    await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });

    // Hero fold (mid-animation, cursor out)
    await page.waitForTimeout(4200);
    await page.screenshot({ path: path.join(OUT, "desktop-hero-4s.png") });

    // Bento: scroll to the product section with the section heading visible,
    // then let the table demo run. (scrollIntoViewIfNeeded overshot by ~67px,
    // which made earlier captures look top-clipped.)
    const scrollToHeading = async (sel: string) => {
      await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo(0, y);
      })()`);
    };
    await scrollToHeading("#product");
    await page.waitForTimeout(6500);
    await page.screenshot({ path: path.join(OUT, "desktop-bento-table-6s.png") });

    // Verify demo
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(OUT, "desktop-bento-verify-12s.png") });

    // Examples section: default tab mid-flow and end
    await scrollToHeading("#examples");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, "examples-quotation-2.5s.png") });
    await page.waitForTimeout(5500);
    await page.screenshot({ path: path.join(OUT, "examples-quotation-8s.png") });

    // Switch through every tab, capturing mid-flow and end state
    const tabs = ["NDA", "Change control", "CAD approval", "Supply agreement"];
    const waits: [number, number][] = [[3500, 5000], [3000, 4000], [4500, 3500], [3500, 6000]];
    for (let i = 0; i < tabs.length; i++) {
      await page.getByRole("tab", { name: tabs[i] }).click();
      await page.waitForTimeout(waits[i][0]);
      await page.screenshot({ path: path.join(OUT, `examples-${tabs[i].toLowerCase().replace(/[^a-z]+/g, "-")}-mid.png`) });
      await page.waitForTimeout(waits[i][1]);
      await page.screenshot({ path: path.join(OUT, `examples-${tabs[i].toLowerCase().replace(/[^a-z]+/g, "-")}-end.png`) });
    }

    // Developers page
    await page.goto(`${BASE}/developers`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "developers-top.png"), fullPage: false });
    await page.screenshot({ path: path.join(OUT, "developers-full.png"), fullPage: true });

    fs.writeFileSync(path.join(OUT, "desktop-console.json"), JSON.stringify(errors, null, 2));
    console.log("desktop console errors/warnings:", errors.length);
    errors.slice(0, 10).forEach((e) => console.log("  ", e.type, e.text.slice(0, 160)));
    await ctx.close();
  }

  /* ── Video pass: one full quotation loop + tab switches ───────── */
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
    await page.evaluate(`(() => {
      const el = document.querySelector("#examples");
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76);
    })()`);
    await page.waitForTimeout(1000);
    // Full quotation loop (~11s)
    await page.waitForTimeout(11500);
    await page.getByRole("tab", { name: "CAD approval" }).click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: "NDA" }).click();
    await page.waitForTimeout(10000);
    const video = await (await ctx.newPage()).video(); // keep handle alive
    void video;
    await ctx.close().catch(() => {});
    // Rename the recorded file deterministically
    const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm")).sort();
    if (files.length) {
      const src = path.join(OUT, files[files.length - 1]);
      fs.renameSync(src, path.join(OUT, "examples-loop.webm"));
      console.log("video saved:", "examples-loop.webm");
    }
  }

  /* ── Mobile pass ──────────────────────────────────────────────── */
  {
    const { ctx, page, errors } = await newPage(browser, 390, 844);
    await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, "mobile-hero.png") });

    await page.evaluate(`(() => {
      const el = document.querySelector("#product");
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
    })()`);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, "mobile-bento.png") });

    // Examples on mobile: readability floor means a scrollable canvas
    await page.evaluate(`(() => {
      const el = document.querySelector("#examples");
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
    })()`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, "mobile-examples.png") });

    // Measure the demo canvas: does it scroll horizontally (scale floor)?
    const metrics = await page.evaluate(`(() => {
      const scroller = document.querySelector("#examples .overflow-x-auto");
      if (!scroller) return null;
      return {
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        canScroll: scroller.scrollWidth > scroller.clientWidth,
      };
    })()`);
    console.log("mobile examples canvas:", JSON.stringify(metrics));

    fs.writeFileSync(path.join(OUT, "mobile-console.json"), JSON.stringify(errors, null, 2));
    console.log("mobile console errors/warnings:", errors.length);
    errors.slice(0, 10).forEach((e) => console.log("  ", e.type, e.text.slice(0, 160)));
    await ctx.close();
  }

  await browser.close();
  console.log("captures in", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
