/**
 * Reproduce the client-side crash in the envelope detail sheet.
 * (Found by e2e/flows/workspace/envelope-void.yaml — "Application error:
 * a client-side exception has occurred" after opening a fresh SENT envelope.)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}\n${e.stack ?? ""}`));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "e2e@docurama.eu");
  await page.fill("#password", "e2ePass1234!");
  await page.click('button:has-text("Sign in securely")');
  await page.waitForSelector('text=Welcome back', { timeout: 15000 });

  // Send a fresh envelope
  await page.click('a:has-text("Documents"), button:has-text("Documents")');
  await page.waitForSelector('button:has-text("New envelope")');
  await page.click('button:has-text("New envelope")');
  await page.waitForSelector('text=Send a document for signature');
  await page.click("#doc-title");
  await page.fill("#doc-title", "Crash Probe");
  await page.fill("#recipient-1-name", "Karla Blanc");
  await page.fill("#recipient-1-email", "karla.blanc@example.com");
  await page.click('button:has-text("Send for signature")');
  await page.waitForSelector('text=Sent to 1 recipient', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Open the detail sheet for the new row
  await page.click('text=Crash Probe');
  await page.waitForTimeout(3000);

  console.log("=== page state ===");
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log(bodyText);
  console.log("=== console/page errors ===");
  for (const e of errors) console.log(e.slice(0, 2000));
  if (errors.length === 0) console.log("(none)");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
