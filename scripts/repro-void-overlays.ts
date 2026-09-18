/**
 * Repro: void-envelope flow with real-user clicks.
 * Checks overlay states after each step:
 *   - detail sheet open? (radix sheet content)
 *   - alert dialog open? (Void this envelope?)
 *   - activeElement id
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;

async function state(page: import("playwright").Page) {
  return page.evaluate(() => {
    const sheet = [...document.querySelectorAll("[data-slot='sheet-content'], [role='dialog']")].length;
    const alert = !!document.querySelector("[data-slot='alert-dialog-content']");
    const reason = document.querySelector("#confirm-reason") as HTMLInputElement | null;
    return {
      dialogs: sheet,
      alertOpen: alert,
      alertText: alert ? (document.querySelector("[data-slot='alert-dialog-content']")?.textContent ?? "").slice(0, 40) : null,
      active: document.activeElement?.id || document.activeElement?.tagName,
      reasonValue: reason?.value ?? null,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "e2e@docurama.eu");
  await page.fill("#password", "e2ePass1234!");
  await page.click('button:has-text("Sign in securely")');
  await page.waitForSelector('text=Welcome back', { timeout: 15000 });

  await page.click('nav button:has-text("Documents"), nav a:has-text("Documents")');
  await page.waitForSelector('button:has-text("New envelope")');

  // Create a fresh envelope
  await page.click('button:has-text("New envelope")');
  await page.waitForSelector('text=Send a document for signature');
  await page.click("#doc-title");
  await page.fill("#doc-title", "Overlay Probe");
  await page.fill("#recipient-1-name", "Karla Blanc");
  await page.fill("#recipient-1-email", "karla.blanc@example.com");
  await page.click('button:has-text("Send for signature")');
  await page.waitForSelector('text=Sent to 1 recipient', { timeout: 15000 });
  await page.waitForTimeout(1200);

  // Open detail sheet
  await page.click('td:has-text("Overlay Probe")');
  await page.waitForSelector('h3#signers');
  console.log("after row click      :", JSON.stringify(await state(page)));

  // Close the sheet via its X button
  await page.click('button:has(span:sr-only("Close"))').catch(async () => {
    await page.click('[data-slot="sheet-content"] button:has(span:text("Close"))');
  });
  await page.waitForTimeout(600);
  console.log("after sheet close    :", JSON.stringify(await state(page)));

  // Click the row's void button (the icon button with aria-label)
  await page.click('button[aria-label="Void Overlay Probe"]');
  await page.waitForTimeout(600);
  console.log("after void button    :", JSON.stringify(await state(page)));

  // Type the reason
  await page.fill("#confirm-reason", "probe reason");
  await page.waitForTimeout(300);
  console.log("after typing reason  :", JSON.stringify(await state(page)));

  // Confirm
  await page.click('button:has-text("Void envelope")');
  await page.waitForSelector('text=Envelope voided', { timeout: 15000 });
  await page.waitForTimeout(800);
  console.log("after confirm        :", JSON.stringify(await state(page)));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
