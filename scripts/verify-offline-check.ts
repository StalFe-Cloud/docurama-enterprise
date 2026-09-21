/**
 * Offline-verifier deep check — runs the pack's verify.html in a real
 * headless Chromium and asserts it validates the pack it shipped with.
 *
 * Not part of the automated suite (it needs playwright + a browser); run it
 * manually when the verifier or the manifest format changes:
 *
 *   DATABASE_URL=... E2E_BASE_URL=http://127.0.0.1:3000 \
 *     bun scripts/verify-offline-check.ts
 *
 * Flow: download a pack over the v1 API → unzip to a temp dir → open
 * verify.html via file:// → attach every file to its input → read the verdict.
 */

import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { chromium } from "playwright";

const run = promisify(execFile);
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const API_KEY = process.env.E2E_API_KEY ?? "dk_e2e_0000000000000000000000000000000000000000";
const CODE = process.env.PACK_CODE ?? "DOC-E2E0002";

async function main() {
  // 1. Download the pack
  const res = await fetch(`${BASE}/api/v1/envelopes/${CODE}/evidence-pack`, {
    headers: { "X-API-Key": API_KEY },
  });
  if (!res.ok) throw new Error(`pack download failed: HTTP ${res.status}`);
  const zipBytes = Buffer.from(await res.arrayBuffer());
  console.log(`pack downloaded: ${zipBytes.length} bytes`);

  // 2. Unzip (STORE method — plain unzip handles it; parseZip lives in the tests)
  const dir = await mkdtemp(join(tmpdir(), "docurama-pack-"));
  const zipPath = join(dir, "pack.zip");
  const filesDir = join(dir, "files");
  await writeFile(zipPath, zipBytes);
  await mkdir(filesDir);
  await run("unzip", ["-o", "-j", zipPath, "-d", filesDir]);
  const { readdir } = await import("fs/promises");
  const names = await readdir(filesDir);
  console.log(`unzipped ${names.length} files: ${names.join(", ")}`);

  // 3. Open verify.html in Chromium and attach the files
  const browser = await chromium.launch({
    executablePath: "/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`file://${join(filesDir, "verify.html")}`);

    await page.setInputFiles("#files", names.map((n) => join(filesDir, n)));

    // 4. Wait for the verdict banners + table. Two banners are expected:
    //    the manifest signature, then the transparency-registry chain check.
    await page.waitForSelector(".banner", { timeout: 15000 });
    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".banner").length >= 2,
      { timeout: 15000 },
    ).catch(() => undefined); // older packs (pre-registry) have only one
    const banners = await page.locator(".banner").allTextContents();
    const bannerText = banners.join("\n");
    const okRows = await page.locator(".tag.ok").count();
    const badRows = await page.locator(".tag.bad").count();
    const rows = await page.locator("table tbody tr").count();

    for (const b of banners) console.log(`banner: ${b.trim()}`);
    console.log(`artifact rows: ${rows} · OK: ${okRows} · BAD: ${badRows}`);
    if (errors.length) console.log("page errors:", errors);

    const pass =
      banners.length >= 2 &&
      banners.every((b) => b.includes("VALID")) &&
      bannerText.includes("Registre de transparence VALIDE") &&
      badRows === 0 && okRows === rows && rows > 0 && errors.length === 0;
    console.log(pass ? "OFFLINE VERIFIER: PASS" : "OFFLINE VERIFIER: FAIL");
    process.exitCode = pass ? 0 : 1;
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
