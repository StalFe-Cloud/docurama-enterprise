/**
 * Geometry probe: why does the table demo canvas clip at the top of its
 * bento cell? Prints the box geometry of every layer: grid, figure, cell,
 * canvas outer/inner, and the grid's computed row tracks.
 */
import { chromium } from "playwright";
import path from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = path.join(process.env.HOME!, ".cache/ms-playwright/chromium-1234/chrome-linux64/chrome");

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
  await page.locator("#product").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);

  const report = await page.evaluate(`(() => {
    const fig = document.querySelector("#product figure");
    const cell = fig && fig.querySelector(":scope > div");
    const demoWrap = cell && cell.querySelector(":scope > div");
    const outer = demoWrap && demoWrap.querySelector(":scope > div");
    const inner = outer && outer.querySelector(":scope > div");
    const grid = fig && fig.parentElement;
    function box(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    }
    return {
      grid: box(grid),
      gridRows: grid ? getComputedStyle(grid).gridTemplateRows : "",
      figure: box(fig),
      cell: box(cell),
      demoWrap: box(demoWrap),
      outer: box(outer),
      inner: box(inner),
      outerScroll: outer ? { clientH: outer.clientHeight, scrollH: outer.scrollHeight, clientW: outer.clientWidth, scrollW: outer.scrollWidth, overflowY: getComputedStyle(outer).overflowY } : null,
    };
  })()`);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
