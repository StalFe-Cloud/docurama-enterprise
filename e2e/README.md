# Docurama E2E — browser suite

End-to-end coverage of the critical user journeys. Everything runs under
`bun test`; the browser suites drive Chromium through Playwright.

> Previously these journeys ran on [Maestro](https://github.com/mobile-dev-inc/Maestro)
> as YAML flows under `e2e/flows/`. Maestro drove its own bundled browser over
> CDP and flaked on roughly one flow per CI run — a different flow each time —
> while the Playwright suites ran green, and a full pass took ~19 minutes
> against ~95 seconds. All 29 flows were ported and Maestro was removed.
> `e2e/browser/harness.ts` carries the detail.


## Quick start

```bash
bun run test:e2e                 # boots a dev server (if needed), seeds, runs everything
```

To iterate on one browser suite against a server that is already up:

```bash
E2E_BASE_URL=http://127.0.0.1:3000 bun test e2e/browser/public.test.ts
```

Requirements: `bun` and a Chrome/Chromium binary. Resolution order is
`CHROME_BIN`, then a Playwright-managed build in `~/.cache/ms-playwright`
(`bunx playwright install chromium`), then `PATH`, then the well-known Windows
install locations. In unprivileged containers Chrome needs `--no-sandbox`,
which the harness passes for you.

## Layout

```
e2e/
  browser/       Playwright browser suites (bun test) — the critical user
                 journeys. harness.ts holds the shared browser lifecycle,
                 Chromium resolution and locator helpers;
                 public/auth/workspace/admin.test.ts cover the four surfaces.
                 The workspace suite mutates seeded fixtures and needs a fresh
                 `bun e2e/seed.ts` per run. E2E_SKIP_BROWSER=1 skips them.
                 Target origin: E2E_BASE_URL.
  seed.ts        Idempotent Prisma seed. Dedicated "E2E Testing" tenant,
                 e2e@docurama.eu / e2ePass1234! (workspace) and
                 e2e-admin@docurama.eu / e2eAdmin1234! (platform admin),
                 fixed-code fixtures DOC-E2E0001 (SENT), DOC-E2E0002
                 (COMPLETED + sealed), DOC-E2E0003 (decline flow) and
                 DOC-E2E0004 (signer journey), fixed signing tokens for the
                 signer-portal flows, an API key (ENVELOPES scope) plus a
                 cold-bucket MCP rate key for the API-layer tests, an MCP
                 config (enabled, all 4 tools, 120/min) + a workspace
                 template fixture for the MCP suite, a spent "E2E Quota"
                 STARTER tenant (25/25 envelopes this month,
                 e2e-quota@docurama.eu / e2eQuota1234!) for the 402 test,
                 and an attested-verification fixture
                 DOC-E2EATST (remote "self-hosted instance" registry row
                 with a real openssl key, a real transparency chain claim,
                 and a portal-log witnessing entry). Wipes its own fixtures
                 and the portal registry tables on every run — demo data is
                 never touched.
  api.test.ts    API-layer suite (bun test): X-API-Key auth, scope 403s,
                 verify-engine states, list/detail reads, sign-endpoint
                 validation, and a leak check that signing tokens never
                 appear in v1 payloads. Also: the signer-preview watermark
                 (unit ink-bounds + an owner-vs-signer pixel diff that locks
                 the watermark into the rendered page) and the spent-plan
                 quota 402 (a STARTER tenant whose month the seed fills).
  evidence.test.ts  Evidence-layer suite (bun test): downloads an evidence
                 pack over the v1 API, parses the raw ZIP itself, re-verifies
                 the manifest signature + every artifact hash (what
                 verify.html does in a browser); runs the /api/attestations
                 receiver loopback (TOFU registration, idempotent re-push,
                 tampered signature, stolen thumbprint, pinned-key swap,
                 cross-instance code claim 409); pure-function tests for the
                 SPF/DMARC posture parsers.
  transparency.test.ts  Transparency-registry suite (bun test): pack
                 transparency block verified offline (commitment recomputed
                 from manifest-only fields → chain → signed checkpoint),
                 tampered commitment/segment detection, receiver chain-claim
                 validation (commitment mismatch 400, inconsistent entry
                 400), **chain rewrite detection 409**, idempotent no-grow,
                 signed checkpoint verification, and inclusion proofs for the
                 seeded fixture (incl. a tamper path).
  mcp.test.ts    MCP server suite (bun test): JSON-RPC handshake, tools/list
                 with the tenant allowlist, real tool calls against the
                 seeded fixtures, 401/403 gates, RPC error codes, and the
                 per-key rate limit (429) — config mutations always restore.
  plans.test.ts  Pricing/onboarding/billing suite (bun test, cycle 10): the
                 shared plan catalog (SOLO = Starter at one seat, 50-envelope
                 STARTER, incremental term discounts 0/5/10/15%, rollover
                 caps, outcome framing instead of "most popular"), the
                 pricing + /enterprise pages, signup plan prefill with hard
                 seat limits (SOLO invite → 403), the public enterprise-lead
                 pipeline (outbox copy to sales@, 429 throttle, admin
                 triage), envelope rollover on renewal (carry-forward incl.
                 the one-allowance cap and idempotency), and small-team-group
                 ops (create/assign/delete, non-admin 403).
  webhooks.test.ts  Webhook dispatcher suite (bun test, in-process lib + real
                 server): signed delivery with HMAC-SHA256 verification over
                 the raw body, subscription filtering, a 500 → retry-pass
                 recovery that must be byte-identical (same payload snapshot,
                 same HMAC), the documented backoff schedule, and one
                 full-path check — an envelope sent over the workspace API
                 produces a signed envelope.sent webhook at the receiver.
  mail.test.ts   Mail delivery engine suite (bun test, own process — it owns
                 DATABASE_URL + SMTP_URL): a miniature SMTP relay over
                 node:net captures real dialogs. Covers outbox-only mode,
                 delivery + SENT transitions, temporary-failure backoff and
                 deferral of not-due rows, recovery on retry, terminal FAILED
                 at 5 attempts, and SMTP_URL parsing (tls=off, garbage
                 degrades to outbox-only).
  visual.test.ts Visual-regression smoke (bun test + Playwright): every
                 public route screenshotted in a frozen context (fixed
                 viewport, reduced motion, animations finished, dev overlay
                 hidden) and diffed against e2e/baselines/. Also measures
                 LCP on / and /templates with a generous dev-mode budget.
  baselines/     Committed PNG baselines for visual.test.ts (see below).
  run.sh         Orchestrator: env guard → server (DOCURAMA_WORKER=off so
                 retry passes are explicit, not raced with the 30s worker) →
                 warm-up → seed → tsc gate → API + evidence + transparency +
                 MCP + webhooks tests → mail suite (own process) → browser →
                 report. Accepts zero or more flow paths (default: all).
  flows/
    public/      No-auth surfaces: marketing, French catalog, verify portal
                 (NOT_FOUND + seeded VERIFIED + attested DOC-E2EATST),
                 docs/developers/status, signer-portal invalid-link state.
    auth/        Typed sign-in, demo one-click buttons, wrong password,
                 forgot password, sign-out.
    workspace/   Documents table, templates catalog, template→send→SENT
                 journey, envelope detail→void, in-app verify, per-signer
                 link copy + QR handoff, evidence-pack export entry point,
                 and the signer journeys: sign→seal→public-verify and
                 decline-with-reason.
    admin/       Platform overview, users directory, platform settings.
```

## Selector conventions

Prefer accessible locators — `getByRole`, `getByLabel`, `getByText` — over
`data-testid`, and add a testid only where no accessible name exists. The
helpers in `e2e/browser/harness.ts` (`seeText`, `clickByName`, `clickText`,
`seePlaceholder`, `scrollToText`) cover most cases.

Three things are not rendered text and need their own locator:

| what | locator |
| --- | --- |
| input placeholders (`Search documents…`) | `seePlaceholder` / `getByPlaceholder` |
| icon-button `aria-label`s (`Void <title>`) | `getByRole("button", { name })` |
| `data-testid` (`font-great-vibes`, `evidence-pack-download`) | `getByTestId` |

Playwright normalises whitespace and auto-waits, so neither the tolerant
`" ?Text ?"` regexes nor explicit wait steps are needed. Keep an explicit
timeout only where a route cold-compiles in dev mode.

`withPage` fails a flow on any uncaught page error, so a spec cannot pass
against a page that is throwing. Next.js dev hydration warnings are filtered
as dev-server noise — see the note on `DEV_SERVER_NOISE` in the harness.


## CI

`.github/workflows/e2e.yml` runs the suite on push/PR against `quality` and
`main`: bun install → prisma generate → seed → `bash e2e/run.sh`. The CI image needs a
`chromium` wrapper that injects `--no-sandbox --disable-dev-shm-usage` (the
workflow creates one), and downloads the **SeaweedFS** binary so
`e2e/s3-seaweed.test.ts` exercises the S3 storage backend against a real
`weed server -s3` (skipped locally when no `weed` is on PATH — set `WEED_BIN`
to enable it, `E2E_SKIP_S3=1` to force off).

## Visual baselines (e2e/visual.test.ts)

The visual suite screenshots the public routes in a deterministic context and
compares against the committed baselines (`e2e/baselines/*.png`): per-pixel
tolerance 25, at most 1.5% of pixels may differ. The marketing surfaces use
Geist via next/font (self-hosted webfont), so rendering does not depend on
system fonts and the threshold has ample headroom for antialiasing noise —
its job is to catch layout catastrophes (blank page, missing hero), not
subpixel drift.

- A route without a baseline is baselined and passes (fail-only-on-drift).
- After an intentional redesign: `UPDATE_BASELINES=1 bun test e2e/visual.test.ts`,
  then commit the new PNGs. Never edit baselines by hand.
- Chromium discovery: `CHROME_BIN` env → the ms-playwright cache →
  `google-chrome`/`chromium` on PATH. CI exports `CHROME_BIN`.
- No Chromium in an environment? `E2E_SKIP_VISUAL=1` skips the file honestly
  (an honest skip, not a silent pass).
- LCP is measured on every route and gated (<6s, dev-server budget) on `/`
  and `/templates` — the gate catches catastrophic asset regressions, it
  does not benchmark (dev-mode compile inflates the number).
- The suite always runs right after the seed and before the browser suites —
  pages that render DB counts (e.g. `/status`) are deterministic at that
  point in the pipeline.

## Writing new specs

Add to the file matching the surface (`public`, `auth`, `workspace`,
`admin`), using the `flow(...)` helper already in each file so the skip flag
and timeout are handled. Keep each spec self-contained: build the state it
needs, or rely on a seeded fixture, and prefer a unique identifier per run
over a fixed one where the endpoint deduplicates (see the enterprise-lead
spec).

Two properties are worth preserving:

- **State.** The workspace suite spends seeded fixtures — it declines
  DOC-E2E0003 and seals DOC-E2E0004 — so it needs a fresh `bun e2e/seed.ts`
  per run. `e2e/run.sh` seeds before it.
- **Order.** The signer-journey spec must precede the seal-verification spec,
  which asserts the seal it creates. `bun test` runs specs in declaration
  order within a file; keep dependent pairs in one file and in order.
