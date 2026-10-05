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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser } from "playwright";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import {
  BASE, clickByName, clickText, closeBrowser, goto, launchBrowser,
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
      await seeText(page, /Envelope prepared for 1 recipients; the first signing invitation and copy notices are queued/);

      await clickByName(page, /Documents/);
      await seeText(page, "E2E Playwright NDA");
    }));

  /* ── envelope-void.yaml ────────────────────────────────────────────────── */
  flow("envelope detail shows signers and voiding works", async (b) =>
    withPage(b, async (page) => {
      await signIn(page);
      await clickByName(page, /Templates/);
      await seeText(page, /Use template/);
      await clickByName(page, /Use template/);

      await seeText(page, "Send a document for signature");
      await page.locator("#doc-title").fill("E2E Void Fixture");
      // Switch a selected template to a real uploaded PDF. The typed title
      // remains intact; the actual UI send must choose only the new source.
      const pdf = await PDFDocument.create();
      pdf.addPage([595.28, 841.89]).drawText("E2E uploaded source replaces selected template", { x: 40, y: 760 });
      const originalBytes = Buffer.from(await pdf.save());
      const originalSha256 = createHash("sha256").update(originalBytes).digest("hex");
      const uploaded = page.waitForResponse(response => response.request().method() === "POST" &&
        response.url().endsWith("/api/workspace/documents"), { timeout: 30_000 });
      await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({
        name: "source-switch-e2e.pdf", mimeType: "application/pdf", buffer: originalBytes,
      });
      const uploadResponse = await uploaded;
      expect(uploadResponse.status()).toBe(201);
      const document = await uploadResponse.json();
      expect(document.sha256).toBe(originalSha256);
      expect(document.pageCount).toBe(1);
      await seeText(page, "Uploaded source-switch-e2e.pdf (1 page)");
      expect(await page.locator("#doc-title").inputValue()).toBe("E2E Void Fixture");
      await page.locator("#recipient-1-name").fill("Karla Blanc");
      await page.locator("#recipient-1-email").fill("karla.blanc@example.com");
      const sent = page.waitForResponse(response => response.request().method() === "POST" &&
        response.url().endsWith("/api/workspace/envelopes") && response.request().postDataJSON()?.op === "send",
        { timeout: 30_000 });
      await clickByName(page, /Send for signature/);
      const sendResponse = await sent;
      expect(sendResponse.status()).toBe(200);
      const source = sendResponse.request().postDataJSON().data;
      expect(source.documentId).toBe(document.id);
      expect(Object.hasOwn(source, "templateId")).toBe(false);
      const persisted = await page.evaluate(async () => {
        const response = await fetch("/api/workspace/envelopes?search=E2E%20Void%20Fixture");
        if (!response.ok) throw new Error("Sent source verification failed");
        const body = await response.json();
        const envelope = body.rows.find((row: {title: string}) => row.title === "E2E Void Fixture");
        if (!envelope) throw new Error("Uploaded-source envelope was not listed");
        return { documentId: envelope.documentId, templateId: envelope.templateId,
          contractSnapshot: envelope.contractSnapshot, sha256: envelope.sha256, pages: envelope.pages };
      });
      expect(persisted).toEqual({ documentId: document.id, templateId: null,
        contractSnapshot: null, sha256: originalSha256, pages: 1 });
      await seeText(page, /Envelope prepared for 1 recipients; the first signing invitation and copy notices are queued/);

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
      await seeText(page, /Completion record found/, 30_000);
      await seeText(page, "E2E Fixture — Service Agreement (signer journey)");
      await seeText(page, "E2E Testing");
    }));
  // Uses the existing CI server/scratch database and real UI submission. API
  // calls set up the contract and read owner-authorized handoff links only.
  flow("two signers complete all field types on desktop and mobile with private PDFs", async (b) => {
    const title = `E2E mobile signing ${crypto.randomUUID()}`;
    const reviewedConsent = { text: "Browser fixture consent: I reviewed this agreement and adopt my typed signature for it.", version: "browser-fixture-v7" };
    const reviewedConsentDigest = createHash("sha256").update(JSON.stringify({ purpose: "DOCURAMA_CONSENT_V1", ...reviewedConsent }), "utf8").digest("hex");
    const recipients = [
      { name: "Alex Mobile", email: "alex.mobile@example.test", role: "SIGNER" },
      { name: "Jamie Desktop", email: "jamie.desktop@example.test", role: "SIGNER" },
    ];
    const fields = recipients.flatMap((recipient, recipientIndex) =>
      ["signature", "initials", "text", "date", "checkbox"].map((type, index) => ({
        id: `workflow-${recipientIndex}-${type}`, type, pageNumber: 1,
        x: recipientIndex === 0 ? 5 : 53, y: 25 + index * 12,
        width: type === "checkbox" ? 5 : 40, height: 6,
        recipientIndex, recipientEmail: recipient.email, recipientName: recipient.name,
        label: `${recipient.name} ${type}`, required: true,
      })));
    let links: string[] = [];
    await withPage(b, async (page) => {
      await signIn(page);
      links = await page.evaluate(async ({ title, recipients, fields, reviewedConsent }) => {
        const preferencesResponse = await fetch("/api/workspace/settings-esign");
        if (!preferencesResponse.ok) throw new Error("Consent policy setup read failed");
        const { prefs: originalPreferences } = await preferencesResponse.json();
        const savePreferences = async (preferences: Record<string, unknown>) => {
          const response = await fetch("/api/workspace/settings", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ op: "esign.save", data: preferences }) });
          if (!response.ok) throw new Error(`Consent policy save failed: ${response.status}`);
        };
        await savePreferences({ ...originalPreferences, consentText: reviewedConsent.text, consentVersion: reviewedConsent.version });
        const templatesResponse = await fetch("/api/workspace/templates");
        if (!templatesResponse.ok) throw new Error("Template setup read failed");
        const templates = await templatesResponse.json();
        const template = templates.rows.find((row: {name: string}) => row.name === "E2E Clause Library");
        if (!template) throw new Error("Missing isolated contract fixture");
        const sent = await fetch("/api/workspace/envelopes", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "send", data: { title, recipients, fields, templateId: template.id } }),
        });
        if (!sent.ok) throw new Error(`Send failed: ${sent.status}`);
        // Settings changed after send must not rewrite this envelope's consent.
        await savePreferences(originalPreferences);
        const listed = await fetch(`/api/workspace/envelopes?search=${encodeURIComponent(title)}`);
        const list = await listed.json();
        const envelope = list.rows.find((row: {title: string}) => row.title === title);
        if (!envelope) throw new Error("Sent envelope was not listed");
        const detailResponse = await fetch(`/api/workspace/envelope-detail?id=${encodeURIComponent(envelope.id)}`);
        if (!detailResponse.ok) throw new Error("Owner handoff read failed");
        const detail = await detailResponse.json();
        return detail.recipients.map((recipient: {signLink: string | null}) => recipient.signLink);
      }, { title, recipients, fields, reviewedConsent });
      expect(links).toHaveLength(2);
      expect(links.every(link => typeof link === "string" && link.startsWith("/sign/"))).toBe(true);
    });
    const completedPath = (link: string) => `/api${link}/completed`;
    await withPage(b, async (page) => {
      await goto(page, links[1]);
      await seeText(page, "It is not your turn to sign yet");
      expect((await page.request.get(`${BASE}${completedPath(links[1])}`)).status()).toBe(409);
    });
    for (let index = 0; index < recipients.length; index++) {
      await withPage(b, async (page) => {
        if (index === 0) await page.setViewportSize({ width: 390, height: 844 });
        const viewed = page.waitForResponse(response => response.request().method() === "POST" &&
          response.url().endsWith(`/api${links[index]}`) && response.request().postDataJSON()?.op === "view",
          { timeout: 30_000 });
        await goto(page, links[index]);
        expect((await viewed).status()).toBe(200);
        await seeText(page, /Adopt your signature/);
        expect(await page.getByTestId("consent-text").textContent()).toBe(reviewedConsent.text);
        expect(await page.getByTestId("consent-version").textContent()).toBe(`Consent version: ${reviewedConsent.version}`);
        await page.locator("#sign-name-input").fill(recipients[index].name);
        await page.getByTestId("font-great-vibes").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="font-great-vibes"]')?.getAttribute("aria-checked") === "true");
        await page.locator(`#value-workflow-${index}-text`).fill(`Reviewed by ${recipients[index].name}`);
        await page.locator(`#value-workflow-${index}-date`).fill("2026-10-04");
        const checkbox = page.locator(`#value-workflow-${index}-checkbox`);
        await checkbox.check();
        await page.waitForFunction(id => document.getElementById(id)?.getAttribute("aria-checked") === "true", `value-workflow-${index}-checkbox`);
        await page.locator("#consent").check();
        await page.waitForFunction(() => document.getElementById("consent")?.getAttribute("aria-checked") === "true");
        const signed = page.waitForResponse(response => response.request().method() === "POST" &&
          response.url().endsWith(`/api${links[index]}`) && response.request().postDataJSON()?.op === "sign", { timeout: 30_000 });
        await page.getByTestId("sign-submit").click();
        const response = await signed;
        expect(response.status()).toBe(200);
        const payload = response.request().postDataJSON();
        expect(payload.consent).toBe(true);
        expect(payload.consentVersion).toBe(reviewedConsent.version);
        expect(payload.consentDigest).toBe(reviewedConsentDigest);
        expect(payload.name).toBe(recipients[index].name);
        expect(payload.font).toBe("great-vibes");
        expect(payload.values).toEqual({
          [`workflow-${index}-text`]: `Reviewed by ${recipients[index].name}`,
          [`workflow-${index}-date`]: "2026-10-04",
          [`workflow-${index}-checkbox`]: true,
        });
        expect((await response.json()).sealed).toBe(index === 1);
        await seeText(page, "Document signed");
        if (index === 0) {
          expect((await page.request.get(`${BASE}${completedPath(links[0])}`)).status()).toBe(409);
          expect(await page.getByRole("link", {name: "Download completed PDF", exact: true}).count()).toBe(0);
        }
      });
    }
    // A mobile signer returning after the second signature can download both
    // genuine PDF artifacts through the recipient-only links.
    await withPage(b, async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await goto(page, links[0]);
      await seeText(page, "Document signed");
      const recordResponse = await page.request.get(`${BASE}${completedPath(links[0])}?format=record`);
      expect(recordResponse.status()).toBe(200);
      const record = await recordResponse.json();
      expect(record.status).toBe("COMPLETED");
      expect(record.signers.map((signer: {adoptedName: string}) => signer.adoptedName)).toEqual(recipients.map(recipient => recipient.name));
      expect(record.signers.every((signer: {consentAcceptedAt: string; authMethod: string}) => !!signer.consentAcceptedAt && signer.authMethod === "EMAIL_LINK")).toBe(true);
      expect(record.signers.every((signer: {consentText: string}) => signer.consentText === reviewedConsent.text)).toBe(true);
      for (const [label, hash, pages] of [
        ["Download completed PDF", record.finalDocumentSha256, 2],
        ["Download completion record PDF", record.completionRecordSha256, null],
      ] as const) {
        const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
        await page.getByRole("link", {name: label, exact: true}).click();
        const download = await downloadPromise;
        expect(await download.failure()).toBeNull();
        const path = await download.path();
        if (!path) throw new Error("Missing browser download artifact");
        const bytes = await readFile(path);
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
        const pdf = await PDFDocument.load(bytes);
        if (pages !== null) expect(pdf.getPageCount()).toBe(pages);
        else expect(pdf.getPageCount()).toBeGreaterThan(0);
      }
    });
  });

});
