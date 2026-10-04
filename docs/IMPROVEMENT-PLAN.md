# Improvement Plan — Cycle 2026-09: Maestro E2E & Release-Quality Baseline

> Historical implementation plan and receipts. Maestro entries below describe past work;
> current browser coverage uses Playwright under `e2e/browser/`. Use `e2e/README.md`
> and fresh revision-specific evidence for current acceptance. Historical results
> remain unchanged and do not certify a later release.

> Branch: `e2e/maestro-suite` (forked from `quality` @ `298ce1d`)
> Owner: Engineering · Status: **In execution**

---

## 1. Context & Problem Statement

Docurama's `quality` branch carries a feature-complete Next.js 16 e-signature
platform: marketing site, auth + onboarding, envelope workspace, admin console,
public verify portal, API v1 + MCP. Verification today is **manual and
ad-hoc**: per-feature Playwright capture scripts (`scripts/qa-*.ts`) that
screenshot pages for human/VLM review, plus API smoke shells
(`test-onboarding-api.sh`, `test-prod-settings-api.sh`).

This has three costs:

1. **No regression net.** Nothing fails when a journey breaks — the hero demo,
   the send-envelope dialog, the verify portal. Defects surface only when a
   human happens to look at a screenshot.
2. **No executable spec.** The README describes behaviour that no test
   enforces; docs and product can silently drift apart.
3. **No CI gate.** Every push to `quality` ships on trust.

The user-mandated direction for this cycle: **use Maestro
(github.com/mobile-dev-inc/Maestro) to perform end-to-end testing**, starting
from the current `quality` state.

## 2. Objectives

| # | Objective | Success criterion |
|---|-----------|-------------------|
| O1 | Maestro E2E suite covering the critical user journeys | ≥ 15 committed flows, all green against the dev server |
| O2 | Deterministic, isolated test data | Idempotent seed script; E2E traffic confined to a dedicated tenant; zero pollution of demo datasets |
| O3 | One-command local run | `bun run test:e2e` boots/uses the dev server, seeds, runs the suite, exits non-zero on any failure |
| O4 | CI gate | GitHub Actions workflow runs the suite on push/PR against `quality` and `main` |
| O5 | Fix what the suite surfaces | Bugs found by flows are fixed or explicitly logged in §6 |

## 3. Environment Findings (validated before writing the plan)

- **Maestro 2.10.0 web mode works in this environment.** ChromeDriver 151 +
  Playwright's "Chrome for Testing" binary, launched headless
  (`maestro test --headless`). The container has no KVM and no X server, so
  Android emulators and headed Chrome are both unavailable — browser flows are
  the correct Maestro strategy here.
- A `chromium` wrapper on `PATH` injects `--no-sandbox --disable-dev-shm-usage`
  (required in unprivileged containers).
- **Env quirk (real bug class #0):** this sandbox exports a global
  `DATABASE_URL` that overrides the repo `.env`, making Prisma open the wrong
  SQLite file and every DB-backed route 500. The runner must pin
  `DATABASE_URL` explicitly — this is now handled in `e2e/run.sh` and documented
  in `.env.example`.
- Maestro `${MAESTRO_*}` env substitution works in the `url:` flow header —
  `MAESTRO_BASE_URL` makes the suite target-portable (local, staging, prod).

## 4. What We're Building

### 4.1 Suite layout

```
e2e/
  README.md            # how to run, how to write flows, selector conventions
  seed.ts              # idempotent Prisma seed: E2E tenant + users + fixtures
  run.sh               # orchestrates: env guard → server → seed → maestro → report
  flows/
    public/            # marketing home, templates, modeles-de-contrats, verify,
                       # docs, developers, status   (no auth)
    auth/              # sign-in (typed + demo buttons), wrong password,
                       # forgot password, sign-out
    workspace/         # documents table, template→send→SENT journey,
                       # envelope detail→void, verify code end-to-end
    admin/             # overview, users directory, platform settings
```

### 4.2 Test data policy

- Dedicated tenant **E2E Testing** (plan: ENTERPRISE, high envelope quota) —
  all flows' writes land there and the seed wipes its envelopes on each run.
- `e2e@docurama.eu` (WORKSPACE_ADMIN, OWNER of the E2E tenant) — used by every
  workspace flow. Demo accounts (`admin@docurama.eu`, `alex@stalfe.example`)
  are **read-only** asserts only (demo-button flow), never used for writes.
- `e2e-admin@docurama.eu` (PLATFORM_ADMIN) — admin flows.
- Fixed-code fixture envelopes (`DOC-E2E0001` SENT, `DOC-E2E0002` COMPLETED +
  sealed) so the verify-portal flow is deterministic without scraping codes
  out of the UI.

### 4.3 Journey coverage matrix

| Journey | Flow file | Asserts |
|---|---|---|
| Marketing home renders, CTA works | `public/marketing.yaml` | hero copy, nav, footer |
| Templates catalog | `public/templates.yaml` | 8 statutory templates, Droit Français badge, Use template CTA |
| French catalog | `public/modeles-de-contrats.yaml` | page renders in French, template cards |
| Verify portal — unknown code | `public/verify-notfound.yaml` | NOT_FOUND result state |
| Verify portal — sealed code | `public/verify-sealed.yaml` | VERIFIED + digest (seeded) |
| Docs / Developers / Status | `public/platform-pages.yaml` | each page's h1 content |
| Sign-in happy path | `auth/login.yaml` | typed credentials → workspace shell |
| Demo one-click buttons | `auth/login-demo.yaml` | DEMO_MODE block, admin entry |
| Wrong password | `auth/login-wrong-password.yaml` | inline error, stays on /login |
| Forgot password | `auth/forgot-password.yaml` | inbox-confirmation screen, back nav |
| Sign out | `auth/logout.yaml` | menu → Sign out → back to sign-in |
| Documents workspace | `workspace/documents.yaml` | header, status tabs, table/search |
| Template → send envelope | `workspace/envelope-send.yaml` | dialog → SENT row visible |
| Envelope detail + void | `workspace/envelope-void.yaml` | detail sheet, signers, void → VOIDED |
| Verify sent code | `workspace/verify-sent.yaml` | NOT_SEALED for fresh SENT envelope |
| Admin overview | `admin/overview.yaml` | KPI cards render |
| Admin users | `admin/users.yaml` | directory + search |
| Admin settings | `admin/settings.yaml` | SMTP/TSA sections render |

### 4.4 Tooling around the suite

- `package.json`: `test:e2e` (full), `test:e2e:seed` (seed only).
- `.github/workflows/e2e.yml`: bun install → prisma generate → seed →
  `maestro test --headless` → JUnit-style report upload on failure.
- The runner tolerates an already-running dev server (CI starts its own).

## 5. Known Issues Found While Setting Up (fix list)

| # | Issue | Status |
|---|-------|--------|
| F1 | `DATABASE_URL` env collision: inherited shell env silently overrides `.env`, all DB routes 500 | Fixed in `e2e/run.sh` + `.env.example` note |
| F2 | `/modeles-de-contrats` 500s when the DB path is wrong (see F1) — page itself has no try/catch around Prisma | **Fixed**: try/catch + French empty-state card; same class fixed on `/docs/legal` (verified 200 + empty state with a broken `DATABASE_URL`) |
| F3 | `next.config.ts` has `typescript.ignoreBuildErrors: true` | **Fixed**: flag removed; `tsc --noEmit` gate runs in `e2e/run.sh` (step 2b) before every suite and fails the run; production build now enforces types |
| F4 | No public signer-facing signing page yet (recipients get queued mail only) — limits E2E to send/void/verify, no sign-step | **Fixed**: full signer portal shipped (`/sign/{token}`) — see §7 below |

## 6. Bugs Surfaced by the Suite

Every flow failure was triaged to root cause. Three were **real product
bugs**, all fixed and regression-locked by the suite:

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| B1 | **Critical** | Opening any envelope's detail sheet white-screened the app (`Cannot read properties of undefined (reading 'map')`). The WS9a security refactor moved `recipients` out of the `envelope` object in the API response, but the sheet still read `env.recipients`. | `user-documents.tsx` reads `detail.data?.recipients`; type updated (`e2e/flows/workspace/envelope-void.yaml` + `documents.yaml` lock it) |
| B2 | High | Row-action buttons (Details / Remind / Void) didn't `stopPropagation()` — every action click ALSO opened the detail sheet underneath, producing two stacked Radix overlays fighting over focus. Real users hit this as "cancel the void dialog → unexpectedly in the detail sheet". | All three buttons stop propagation (`user-documents.tsx`) |
| B3 | Medium | Destructive ConfirmDialog with a required reason auto-focused the **Cancel** button (Radix default) instead of the required input — keyboard users had to tab backwards to type the reason. | `ConfirmDialog` owns `onOpenAutoFocus` and focuses `#confirm-reason` (`shared.tsx`) |
| B4 | Low | Send-dialog recipient inputs had no `id` (only `aria-label`) — ambiguous for automation and styling hooks. | Stable ids `recipient-{n}-name/email` (`user-documents.tsx`) |

Tooling quirks documented (not app bugs): Maestro's per-char `sendKeys`
chokes on **spaces** inside Radix dialogs ("element not interactable") —
flows use hyphenated strings; see `e2e/README.md`.

## 6c. Cycle 2 — signer portal & platform hardening (executed)

The gap that kept Docurama behind every competitor (F4) is closed, plus
the first two next-cycle items:

- **Public signer portal** (`/sign/{token}`, `sign.docurama.eu`): the 32-byte
  per-recipient token is the authentication. One-page signing experience —
  document card, sender message, signers rail, contract text for
  template-sent envelopes, adopt-signature (typed, 3 handwriting fonts),
  eIDAS consent, sign/decline. Turn order enforced; final signature seals
  the envelope (COMPLETED, SHA-256 via `computeEnvelopeDigest`, B-T) and
  writes SIGNED/SEALED/DECLINED/VIEWED events to the ledger.
- **Invitation emails now carry the personal link**: the send op queues one
  MailOutbox row per recipient (template SIGN_INVITE) with the /sign/{token}
  link — inspectable in the admin console.
- **QR handoff** (roadmap #2): the envelope-detail sheet shows, per pending
  signer, a copy-link button and a QR popover for phone handoff.
- **Signer journey E2E** (next-cycle #1): 4 new flows — sign→seal→public
  verify, decline-with-reason, invalid link, QR/link handoff — plus 2 new
  fixtures (DOC-E2E0003/0004) with deterministic tokens.
- **API-layer suite** (next-cycle #2): `e2e/api.test.ts` (bun test) — key
  auth, scope 403s, verify-engine states, detail reads, sign-endpoint
  validation, and a regression lock that recipient tokens never leak in v1
  payloads. Runs inside `e2e/run.sh`.
- **F3 closed**: `ignoreBuildErrors` removed; tsc gate in the runner + CI.
- **Evidence chain groundwork**: Envelope now carries `templateId` — which
  template produced the signed document is answerable (roadmap #12 base).
- Verify portal accepts `?code=` prefill — the signer success screen links
  straight into the proof ("Verify the seal" button).

## 7. Next-Cycle Candidates

1. ~~Signer journey E2E once the recipient signing page ships (F4).~~ **Done** (cycle 2).
2. ~~API-level layer for v1 endpoints~~ **Done** (cycle 2, `e2e/api.test.ts`). ~~Remaining: MCP endpoint tests, quota-402 test with a spent-plan key.~~ **Done** (cycle 7 — `e2e/mcp.test.ts` + the spent-quota 402 in `e2e/api.test.ts`).
3. ~~**Visual regression** (screenshot diffing) for marketing surfaces.~~ **Done** (cycle 7 — `e2e/visual.test.ts` + committed baselines).
4. ~~Remove `ignoreBuildErrors` (F3) and add `tsc --noEmit` gate to CI.~~ **Done** (cycle 2).
5. ~~Performance budget: LCP check on `/` and `/marketing` in CI.~~ **Done** (cycle 7 — LCP measured on every public route, gated <6s on `/` and `/templates` inside `e2e/visual.test.ts`; dev-server budget, catches asset catastrophes).
6. ~~**Evidence pack export** (roadmap #1): one-click ZIP per completed
   envelope (sealed document, ledger CSV, signed manifest).~~ **Done** (cycle 3,
   `docs/EVIDENCE-PACK.md` — plus bilingual certificate, offline verifier,
   X.509 evidence key with DNS SAN, and full byte-level test coverage).
7. **PDF embedding in the signer portal** for uploaded-document envelopes
   (currently a document card with integrity digest).
8. ~~Public verification for self-hosted / on-prem instances~~ **Done** (cycle 3,
   attestation protocol — `docs/SELF-HOSTED-ATTESTATION.md`, receiver at
   `/api/attestations`, `VERIFIED_ATTESTED` result in the verify engine).
9. ~~DNS verification beyond SMTP: verified-domain badge on signer portal and
   verify results, SPF/DMARC posture check, domain-bound seals~~ **Done**
   (cycle 3 — `verifiedSenderDomain` recorded at seal time, SAN in the
   evidence-key certificate, `domain.posture` op in settings).

## 7b. Cycle 3 — Evidence pack + self-hosted attestation (2026-09-17)

Branch `feat/evidence-pack` off `quality`. Everything below is shipped with
tests and docs:

- **Evidence pack** (roadmap #1): ZIP per completed envelope — sealed document
  (byte-exact, STORE-method ZIP written in-house, zero deps), event-ledger
  CSV, machine-readable envelope record, bilingual print-ready certificate,
  README, and a **signed manifest** (RSA-SHA-256 over canonical JSON). Export
  surfaces: envelope detail button (`/api/evidence-pack/{id}`, session) and
  `GET /api/v1/envelopes/{idOrCode}/evidence-pack` (API key). Every export is
  ledger-recorded (`EVIDENCE_EXPORTED`).
- **Offline verifier** (`verify.html` inside every pack): browser-only,
  zero-network re-verification of the manifest signature (WebCrypto) and of
  every artifact's SHA-256. Proven in real Chromium by
  `scripts/verify-offline-check.ts` — banner VALID, 7/7 artifacts OK.
- **Evidence key** (`src/lib/evidence-key.ts`): per-tenant RSA-2048 key with a
  self-signed X.509 certificate via system OpenSSL; when the tenant has a
  DNS-TXT-verified sending domain it is embedded as `subjectAltName DNS:` —
  the "DNS verification → verified certificate" chain.
- **Self-hosted attestation** (roadmap #13 groundwork): `EVIDENCE_PORTAL_URL`
  makes an instance push a signed minimal fingerprint at seal time
  (GDPR-minimal: code, digest, dates, conformance, signer count — zero
  personal data). Receiver `/api/attestations` with TOFU key pinning,
  thumbprint/certificate binding, per-code ownership (409), idempotent
  re-push. Verify engine fallback: local envelopes first, then
  `VERIFIED_ATTESTED` with instance registry facts, rendered distinctly in
  the public and in-app verify UIs.
- **Sender-domain trust chain**: seals record `verifiedSenderDomain` when the
  sender's email domain is DNS-verified; the signer portal shows the badge
  (anti-phishing), verify results cite it, evidence packs and attestations
  carry it.
- **Email posture** (`domain.posture`): SPF/DMARC record checks (generic,
  honest) + best-effort DKIM probe, with chips in Settings → Domains.
- **Schema**: `EvidenceKey`, `PortalInstance`, `PortalAttestation` models;
  envelope gains `verifiedSenderDomain`, `attestedAt`, `attestStatus`.
- **Tests**: `e2e/evidence.test.ts` (14 tests — pack byte-level verification
  from raw HTTP bytes, receiver loopback incl. all rejection paths, DNS
  posture parsers), 2 new Maestro flows (`evidence-pack-export`,
  `verify-attested`) → suite now 24 flows. Seed: attested fixture
  DOC-E2EATST + realistic remote-instance registry row + portal-table sweep
  for determinism.
- **Docs**: `docs/EVIDENCE-PACK.md` (format spec v1), 
  `docs/SELF-HOSTED-ATTESTATION.md` (protocol + honest trust limits +
  upgrade paths), API reference updated (evidence-pack + attestation
  endpoints, `VERIFIED_ATTESTED`).

## 6b. Re-validation & hardening (second pass, fresh environment)

The suite was re-validated from scratch in a clean sandbox (fresh `bun
install`, committed `db/custom.db`, cold dev server):

- **18/18 flows green**, including the previously flaky marketing flow.
- Flake fixed for good: on a cold server the first navigation to a route
  races the dev compiler (marketing CTA → `/welcome` once exceeded its 10s
  wait). `e2e/run.sh` now warms the public routes after boot and
  first-navigation waits are 30s.
- Runner improvements: `run.sh` accepts multiple flow paths (run a group:
  `bash e2e/run.sh e2e/flows/public/*.yaml`); same seed/warm-up/report
  behavior as a full run.
- Environment lesson (sandbox, not product): background process groups are
  reaped ~5 minutes after spawn, which masqueraded as a hung flow. Run the
  suite in the foreground (the normal `bun run test:e2e` path) or in chunks.

## 8. Definition of Done (this cycle)

- [x] Maestro installed & web mode validated headless in this environment
- [x] Branch `e2e/maestro-suite` with suite, seed, runner, CI
- [x] All flows green against the dev server in one `bun run test:e2e` (18/18)
- [x] Findings fixed or logged (§5/§6) — 3 product bugs fixed, tsc + eslint clean
- [x] Worklog updated; PR ready for review into `quality`

## 7c. Cycle 4 — Transparency registry (2026-09-17)

Branch `feat/transparency-log` off `quality`. Closes the last recommended
trust-layer item from the cost review ("free tier now: self-CA + transparency
proofs + fingerprint UX; AATL/eIDAS documented as paid upgrade paths"):

- **Miniature Certificate Transparency, zero external services**
  (`src/lib/transparency.ts`, `docs/TRANSPARENCY-LOG.md`):
  - *Instance chain* (`TransparencyEntry`, per tenant): every sealed envelope
    appends a hash-chained entry committing to its seal fingerprint
    (code + SHA-256 + sealedAt + conformance + pages + signerCount). Appends
    at seal time (post-commit — appending inside the seal transaction
    deadlocks on SQLite's write lock; found and fixed via signer-journey),
    idempotent per (tenant, envelope, commitment), lazy self-healing for
    pre-registry envelopes.
  - *Portal log* (`PortalLogEntry`, global): every accepted attestation is
    witnessed in the portal's own append-only chain. **Rewrite detection**:
    same code + same digest at a different chain position → `409 Chain
    rewrite detected`. Idempotent re-pushes do not grow the log.
  - *Signed checkpoints* (`PortalKey`): `GET /api/transparency/checkpoint`
    serves a signed head anyone can monitor (poll, pin keyFingerprint TOFU,
    keep every checkpoint — a shrinking log is provable). Inclusion proofs at
    `GET /api/transparency/proof/{code}`.
- **Claims ride inside signatures**: the chain claim is part of the signed
  attestation payload, so it cannot be stripped or replayed at another
  position; the receiver recomputes both the commitment hash and the entry
  hash (400 on either mismatch).
- **Evidence packs carry inclusion proofs**: manifest gains a `transparency`
  block (entry + segment to head + checkpoint signed by the evidence key);
  `verify.html` section 4 re-hashes the whole chain offline in the browser —
  including the first segment entry (a rewritten genesis `prevHead` cannot
  smuggle in a different history). Proven in real Chromium by the extended
  `scripts/verify-offline-check.ts`: two VALID banners, 7/7 artifacts.
- **Verify UIs** cite the registry: attested results show "Entry #N in the
  public append-only log" + proof URL (public portal + in-app tool + v1 API).
- **Cost ladder documented** (`docs/TRANSPARENCY-LOG.md`): TOFU $0 → this
  registry $0 → Sigstore Rekor witnessing $0 (~1–2 wks, future) → self-hosted
  Trillian ~$5–20/mo → AATL cert ~$300–600/yr → AATL service ~$10k+/yr → own
  AATL $50–150k/yr → eIDAS QTSP €100–300k. Position: the free tiers ARE the
  trust model; paid tiers are revenue-triggered upgrades.
- **Tests**: `e2e/transparency.test.ts` (13 tests — pack block verification
  incl. commitment recompute from manifest-only fields, tampered commitment,
  rewritten segment link, receiver claim validation, rewrite 409, idempotent
  no-grow, checkpoint signature, seeded-fixture inclusion proof + tamper);
  suites now 39 tests across 3 files; seed fixture upgraded with a real chain
  claim + portal-log witnessing; `verify-attested.yaml` asserts the registry
  lines. Full gates: tsc/eslint/build clean, 24/24 Maestro flows, 39/39
  tests, offline verifier PASS in Chromium.

## 7d. Cycle 5 — Signer document preview (2026-09-17)

Branch `feat/signer-pdf-preview` off `quality`. Closes the last signer-portal
gap from the competitive teardown: signers could sign an uploaded PDF they
had never seen (legal weak point — eIDAS consent quality; DocuSign/ Dropbox
both show the document).

- **Token-gated page renderer** (`/api/sign/{token}/pages/{n}`): reuses the
  workspace pdfium + napi-canvas pipeline, but authenticates with the
  recipient's 32-byte signing token — no account, no session, same trust
  model as `/api/sign/{token}`. SENT/PARTIALLY_SIGNED only (sealed/voided →
  409), CC recipients → 403 (they get the completed copy, not a preview),
  page-range + dpi clamped server-side.
- **`DOCUMENT_VIEWED` evidence event**: every signer's first successful page
  render lands one idempotent ledger event (detail carries the email = the
  idempotency key) — evidence the document was actually *shown*, not just
  that the link was opened. Exported in evidence packs with the rest of the
  ledger.
- **Embedded pager in the signer portal** (`SignDocumentPreview`): one-page
  philosophy kept — review, adopt, sign on one screen. Bounded 60vh reader
  pane, prev/next + arrow keys, loading overlay, graceful degradation (a
  render failure never blocks signing; the SHA-256 card remains). Rendered
  in the active, wait and signed (pre-seal) phases; template-sent envelopes
  keep their markdown text.
- **Product bugs found while hardening** (all fixed + locked):
  - **SSR hydration race in the preview**: the server-rendered `<img>` can
    finish loading before React attaches `onLoad` — the load event is then
    lost forever and the overlay spins eternally. Fixed with an
    attach-time `complete` check (ref callback); this was the real cause
    behind the "dead page" suite flakes, not Turbopack recompiles.
  - Revisiting a sealed signing link showed "other signers still pending"
    (the local `sealed` flag never initialised from the server snapshot).
  - CC recipients leaked owner-visible `signLink`s in the envelope detail
    (nothing to sign for a CC).
  - Marketing CTAs were JS-only (`window.location.assign` in onClick) —
    dead before hydration, no anchor semantics for a11y; now real
    `next/link` anchors via `asChild` (client-side transitions once
    hydrated).
  - Signer portal CTAs converted to `next/link` (instant, no full reload).
- **E2E isolation fix** (`e2e/run.sh`): the suite now runs against a
  **/tmp copy** of the committed db (E2E_DATABASE_URL still wins; a foreign
  dev server still gets the repo db). Suite writes no longer churn
  `db/custom.db` inside the repo tree (Turbopack's dev watcher reacts to
  every write) and the committed db stays pristine. Dynamic-route warm-up
  extended (`/sign/{token}` compiles before the flows).
- **Tests**: seed now generates real multi-page PDFs (hand-crafted minimal
  PDFs, no new deps) for DOC-E2E0001 (3p) + DOC-E2E0004 (4p) and a fixed CC
  recipient; `e2e/api.test.ts` +6 (PNG magic/size, page bounds, dpi clamp,
  404/403 paths, DOCUMENT_VIEWED idempotency via direct DB count); new
  `signer-verify-seal.yaml` (the envelope sealed moments ago by
  signer-journey verifies on the public portal); signer-journey drives the
  pager. Gates: tsc/eslint clean, **25/25 flows**, 45/45 tests across 3
  files.

## 7e. Cycle 6 — Rekor witnessing of the portal key (2026-09-17)

Branch `feat/rekor-witnessing` off `quality`. Promotes the "future" rung of
the trust ladder to shipped, at €0: neutral third-party anchoring of the
TOFU pin.

- **`src/lib/rekor.ts`**: the portal transparency key signs a statement
  committing to its own fingerprint
  (`docurama-portal-key-witness-v1`), the statement is hashed + signed as a
  `hashedrekord` and submitted to Rekor (public OpenSSF log — free, no
  account). The entry (UUID, logIndex, integratedTime, inclusion proof,
  statement, signature) is stored (`RekorWitness`, one row per key
  generation) and served in a `witness` block from the checkpoint and proof
  endpoints. A substituted key becomes publicly contradicted. The
  hashedrekord shape was validated with a live submission to
  rekor.sigstore.dev (201 + inclusion proof, tree size 2.75B) before wiring.
- **Zero-config + graceful degradation**: the first checkpoint after boot
  triggers a rate-limited lazy attempt (in-process cooldown); firewalled or
  offline deployments keep serving TOFU checkpoints (`pushed:false` with the
  reason, never a throw). `REKOR_API_URL` points self-hosters at a private
  log; `REKOR_WITNESS=off` disables entirely. Platform-admin op
  `POST /api/transparency/witness` (audited) for manual retries; GET reads
  the state.
- **Monitor recipe documented** (`docs/TRANSPARENCY-LOG.md`): re-hash the
  statement, verify the signature under the checkpoint key, check the
  fingerprint self-commitment, confirm the entry in the cited log.
- **Tests**: `e2e/rekor.test.ts` (10 — happy path with a full monitor-side
  re-verification from the submitted hashedrekord, idempotency/no log
  growth, tampered statement, lazy path, offline degradation, disabled,
  checkpoint/proof wiring, admin-only op) against a local mock Rekor
  (`Bun.serve`) — hermetic, no egress; the suite's dev server runs with
  `REKOR_WITNESS=off`. Suites now 55 tests across 4 files. Gates: tsc/
  eslint clean, 25/25 flows.

## 7f. Cycle 7 — Signer-preview watermark, MCP/quota coverage, visual regression (2026-09-18)

Branch `feat/cycle7-watermark-coverage` off `quality`. Three remaining
next-cycle items, all €0 code work — executed as one hardening cycle:

- **Per-recipient watermark on every signer-preview page**
  (`src/lib/preview-watermark.ts`): three faint diagonal tiles carrying
  "Prepared for {name} <{email}>" + envelope code + render date, drawn onto
  the pdfium canvas before PNG encode via a new guarded `overlay` hook on
  `renderPage` (an overlay failure degrades to a clean render, never a
  failed preview). A leaked screenshot, print or forwarded copy of the
  preview is now traceable to the exact recipient — pairing with the
  DOCUMENT_VIEWED ledger event as evidence that *this* person was shown
  *this* document (same posture as DocuSign). The workspace's own renderer
  stays pristine; only signer-facing renders are personalised. Aesthetics
  validated against a real render by a vision model (legible, DocuSign-
  standard opacity, professional).
- **Real environment bug found by the suite and fixed**: in environments
  where fontconfig's generic `sans-serif` resolves to a face without Latin
  coverage (this sandbox: Noto Color Emoji), @napi-rs/canvas `fillText`
  **silently no-ops** while `measureText` still returns plausible numbers —
  a naive watermark ships as nothing (or as the digits-only fragment of an
  emoji face). The watermark now resolves a real family via a
  `GlobalFonts.has()` cascade (DejaVu → Liberation → Arial → …), and the
  production image installs `fontconfig + fonts-dejavu-core` (the runner
  stage previously shipped **no fonts at all** — pdfjs text rendering of
  system-font PDFs was equally affected).
- **MCP server E2E** (`e2e/mcp.test.ts`, 15 tests): JSON-RPC handshake,
  tools/list against the tenant allowlist, real tool execution on the seeded
  fixtures (envelope_list/detail, document_verify VERIFIED + NOT_FOUND,
  template_list), 401/403 gates, RPC error codes (-32601/-32602), and the
  per-key rate limit (cold-bucket key → crisp 429 on request 3, config
  restored in finally). Seed gains an MCP config (enabled, 4 tools,
  120/min), a workspace template fixture and the dedicated rate key.
- **Spent-plan quota 402** (`e2e/api.test.ts`): the seed spends an entire
  STARTER month (25/25 envelopes) for the dedicated "E2E Quota" tenant;
  the send path must refuse with 402 + "quota" and create nothing. Login
  uses the session-bearer path (`/api/auth/login` → `Authorization:
  Bearer`), which no test had exercised before.
- **Visual regression smoke** (`e2e/visual.test.ts` + `e2e/baselines/`):
  every public route screenshotted in a frozen deterministic context
  (fixed 1280×800 viewport, reduced motion, all animations fast-forwarded
  via `Animation.finish()`, Next dev overlay hidden, Europe/Paris timezone)
  and diffed against committed baselines — per-pixel tolerance 25, ≤1.5%
  of pixels may differ. Fail-only-on-drift: a route without a baseline is
  baselined and passes; `UPDATE_BASELINES=1` regenerates deliberately.
  Deterministic because Geist is a self-hosted webfont (next/font) — the
  7 committed baselines re-diff at **0.00%** on a clean run. Chromium
  discovery: `CHROME_BIN` (exported by CI) → ms-playwright cache →
  `google-chrome` on PATH; `E2E_SKIP_VISUAL=1` is an honest skip. One
  shared browser per file (per-route browsers deadlocked teardown in
  constrained containers — found live, fixed).
- **LCP budget** folded into the visual suite: measured on every route,
  gated <6s on `/` and `/templates` (a dev-server budget — it exists to
  catch a 30 MB hero asset, not to benchmark).
- **Gates**: tsc/eslint clean, **82/82 tests** across 6 files (api 23,
  evidence 14, transparency 13, rekor 10, mcp 15, visual 7), **25/25
  Maestro flows**, visual determinism proven by two consecutive 0.00%
  runs. run.sh wires the two new suites; `.github/workflows/e2e.yml`
  exports `CHROME_BIN`.

## 7g. Cycle 8 — Deployment readiness: health, mail delivery, webhooks, hardening (2026-09-18)

Gap analysis against four deployment targets (cloud multitenant SaaS,
private cloud, public cloud, self-hosted enterprise) surfaced six universal
blockers; the €0 subset ships in this cycle:

- **`/api/health` (new)** — DB round-trip, storage-writability probe, mail
  mode + queue depth, webhook endpoint health, Rekor witnessing posture,
  version + uptime. 200 ok / 503 unready on critical failures. The runbook
  (§3/§8), the Docker `HEALTHCHECK` and both Helm probes target it — before
  this cycle the runbook monitored an endpoint that 404'd.
- **Real mail delivery (`src/lib/mail.ts`)** — nodemailer transport behind
  `SMTP_URL` (`smtp://` STARTTLS-opportunistic / `smtps://` / `?tls=off` for
  local relays). Unset = the previous behaviour, honestly named outbox-only:
  rows stay QUEUED and inspectable. Attempts + exponential backoff (30s → 30m
  cap, 5 attempts) survive restarts in the `MailOutbox` row itself.
- **Webhook dispatcher (`src/lib/webhooks.ts`)** — the WebhookEndpoint model
  finally delivers: HMAC-SHA256 `X-Docurama-Signature` over the raw body
  (`whsec_…` secret, revealed once at creation, stored retrievable but never
  re-served), `X-Docurama-Event`/`X-Docurama-Delivery` headers, payload
  snapshot per delivery so retries are byte-identical (receivers verify one
  stable HMAC), backoff 1m/5m/15m/30m × 5 attempts, endpoint health
  (successRate over last 20, FAILING on 5-streak, PAUSED untouched).
  All 7 documented events fire from the real lifecycle paths
  (send/remind/void/view/sign/seal/decline), post-commit and non-fatal by
  the same policy as the transparency append.
- **Webhook management UI** — Settings → API's static info card became a
  full endpoint manager (register with event picker + secret one-time
  reveal, pause/resume, delete, recent deliveries). API: `settings-webhooks`
  section + `webhook.create/delete/toggle` ops, admin-gated, audited.
- **Background worker (`src/instrumentation.ts`)** — 30s loop drains mail
  + retries failed webhooks. Single-instance by design and documented:
  `DOCURAMA_WORKER=off` for replicas or external cron; both passes are
  self-contained DB-only functions.
- **ROOT_DOMAIN env** — middleware's hard-coded `docurama.eu` became
  configurable; default unchanged. Self-hosted/white-label deployments get
  the vanity sub-domain routing on their own zone.
- **Hardened packaging** — Dockerfile: non-root uid 10001, `HEALTHCHECK`,
  demo mode off by default, no baked dev DB, entrypoint applies additive
  schema on boot (prisma CLI + engines carried deliberately);
  docker-compose: named volumes, compose healthcheck, documented scale-out
  knobs. **Helm chart** (`deploy/helm/docurama`): probes on /api/health,
  single RWO PVC (db + storage subPaths), Recreate strategy, SMTP from
  existing Secret, ROOT_DOMAIN derived from the ingress host, securityContext
  throughout. **`scripts/backup.sh`**: sqlite3 `.backup` snapshot + storage
  tarball, retention, optional GPG + off-site rsync, restore instructions.
- **Postgres portability gate** — new `postgres-portability` CI job applies
  the schema (provider-swapped, the only edit) to PostgreSQL 16 on every
  push: §9's "flip DATABASE_URL" claim is now continuously tested instead
  of aspirational.
- **Bug found by the new tests**: the first webhook backoff implementation
  (5^n progression) produced 25m at attempt 3 where the docs promised 15m —
  replaced with the explicit documented schedule table.
- **E2E growth 82 → 97 tests / 25 flows**: new `webhooks.test.ts` (signed
  delivery + HMAC verification, subscription filtering, 500 → byte-identical
  retry recovery, full path through the real dev server) and `mail.test.ts`
  (hermetic fake SMTP relay over node:net: delivery, backoff, deferral,
  terminal FAILED at 5 attempts, outbox-only no-op, URL parsing), plus 2
  health assertions in api.test.ts. mail.test.ts runs in its own process
  (it owns DATABASE_URL + SMTP_URL); the dev server in the suite runs with
  `DOCURAMA_WORKER=off` so retry passes are explicit, not raced.
- **Sandbox lesson (third reaper incident)**: `bun add` rewrote node_modules
  and invalidated the Turbopack cache — cold recompiles pushed a full
  run.sh invocation past the ~5-minute background-process harvest window
  mid-test. Pre-warming the route cache in short windows (then ~15s boots)
  + chunked foreground flow groups keeps every invocation inside the limit.
  Locally verified: **97/97 tests, 25/25 flows** (public 7, auth 5, admin 3,
  workspace 10), tsc/eslint clean.

## 7h. Cycle 9 — S3 object storage backend, SeaweedFS-verified (2026-09-18)

The last scale-out blocker from cycle 8's gap analysis ("S3 storage" was the
only one of the six blockers that was actually free to close — the user
called it: SeaweedFS is Apache-2.0 and costs €0).

- **Storage backend** (`src/lib/object-store.ts` + `document-store.ts`):
  env-driven S3-compatible backend (S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/
  SECRET_ACCESS_KEY, optional REGION/AUTO_CREATE_BUCKET/FORCE_PATH_STYLE)
  read at call time like SMTP_URL, all-or-nothing with a loud warn on partial
  config (a half-configured production never half-works), local filesystem
  stays the zero-config default. Same `documents/{tenantId}/{docId}.pdf`
  key on both backends — migration is a copy, rows never change.
- **Policy parity on both backends**: storeUpload validates magic bytes and
  the size cap in memory and issues one PutObject — a rejected upload never
  creates an object; deleteDocumentFile and the retention sweep (orphan
  purge, envelope-backed evidence never touched) work on either backend;
  readDocumentBytes/readStoredBytes are the single read path (page renders,
  evidence packs, OCR). `/api/health` and the admin restore drill now report
  and prove the ACTIVE backend (`checks.storage.backend`) with a real
  write-read-delete round trip.
- **Verified against the real thing**: `e2e/s3-seaweed.test.ts` (7 tests)
  spawns a REAL SeaweedFS 4.47 (`weed server -s3`) on scratch ports and
  drives the full surface — bucket auto-creation, byte-exact round trips,
  no-local-disk leakage (the routing actually routes), all rejection classes
  leaving no objects, idempotent deletes, the orphan-vs-evidence sweep
  against real seeded rows, the health probe, and auto-create-off surfacing
  a missing bucket as WRITE_FAILED. CI downloads the weed binary; run.sh
  skips honestly when it's absent (WEED_BIN / E2E_SKIP_S3=1).
- **Sandbox finds while making it real**: SeaweedFS `-ip` (advertised
  address) must be set alongside `-ip.bind` or every Put 500s with the filer
  dialing its own LAN IP; the data dir must pre-exist; bun's 5s default hook
  timeout eats the afterAll teardown (→ SIGKILL + explicit hook timeouts,
  same lesson as the visual suite).
- **Packaging**: docker-compose gains profiles — `--profile s3` (SeaweedFS
  4.47 pinned to the CI-verified version, healthcheck, named volume) and
  `--profile mail` (Mailpit SMTP sink: `SMTP_URL=smtp://mailpit:1025?tls=off`
  + inbox UI on :8025 — the "set SMTP_URL" path is now a one-liner for
  evaluators). Helm chart: `s3.*` values (endpoint/bucket/region/
  autoCreate) + credentials via existingSecret; `helm lint` + template
  rendering validated with the real helm binary (default renders no S3 env,
  enabled renders the full block).
- **`docs/STORAGE-OPTIONS.md`**: the engine comparison the decision needed —
  SeaweedFS (Apache-2.0, tiny ops, replication+EC+cloud tiering) vs MinIO /
  Garage (AGPLv3 — technically fine as protocol servers, but they lose the
  enterprise procurement questionnaire) vs Ceph RGW (LGPL, heavy) vs cloud
  (Cloudflare R2: 10GB + zero egress free tier — the €0 public-cloud start;
  Backblaze B2; EU: Scaleway/OVH/Hetzner). Recommendation per deployment
  shape, SeaweedFS quickstart incl. the `-ip` gotcha and `s3.json` auth
  hardening, migration recipe (rclone/aws s3 sync — layout is identical).
- **run.sh hardening (found the hard way)**: killing the `bun run dev`
  wrapper leaves the next-server child alive holding :3000 with a stale
  database binding — a later run then serves phantom failures (MCP config
  mutations "invisible", rekor witness rows missing, webhook timeouts)
  that look exactly like product regressions. Cleanup now kills the process
  tree. Same class: running `bun run build` between dev-server E2E runs
  leaves mixed .next state — wipe `.next` or boot cold before trusting a
  red run.
- Gates: tsc/eslint clean, 97+7=**104 bun tests** across 9 files (90 in the
  dev-server batch + 7 mail + 7 S3-seaweed), **25/25 Maestro flows**
  (foreground chunks), helm lint/template clean, production build green with
  the SDK traced into the standalone output.

## 7i. Cycle 10 — Pricing, onboarding & the enterprise pipeline (2026-09-18)

**Scope (user-driven):** complete user + admin onboarding with per-plan guided
instructions and demos, seat-aware invitations, an enterprise onboarding path,
small team groups inside company workspaces, and a repriced plan catalogue —
50-envelope Starter ("35 sending days a month, weekends on us"), envelope
rollover on renewal, a promotional billing-term switch with three incremental
discount slabs, a one-seat Solo plan, and outcome framing instead of the
"most popular" badge.

- **`src/lib/plans.ts` (new)** — single source of truth: SOLO/STARTER/
  BUSINESS/ENTERPRISE (Solo is the Starter feature set at exactly one seat,
  €19), features + "with this plan you'll…" outcome bullets + bestFor,
  billing terms (monthly = no engagement; 3 mo −5%, 6 mo −10%, 12 mo −15%,
  incremental), price math (`effectiveMonthlyEur` / `termTotalEur` /
  `termSavingsEur`), rollover caps (= one monthly allowance), and per-plan
  onboarding guides (guided first steps + demo links). The pricing page,
  quota engine, seeds, admin console and wizard all read this one file.
- **Billing engine (`src/lib/billing.ts`, new)** — `currentAllowance`
  (plan allowance + carried-forward envelopes), `renewDueSubscriptions`
  (rolls elapsed terms forward, carries unused envelopes capped at one
  monthly allowance, audits `subscription.renewed`, idempotent — a worker
  outage catching up several terms is handled), `seatCapacity` (members +
  pending invitations vs the plan's seat limit). The background worker
  gained a third pass (subscription renewals) next to mail + webhooks.
- **Quota + seats enforcement** — the workspace send path now refuses at
  `used >= allowance` with a message that mentions rollover; both invite
  paths (settings + onboarding wizard) hard-refuse with 403 when
  members + pending invites fill the plan's seats ("All N seats…"), so a
  pending invitation holds a seat until accepted or revoked.
- **Pricing page** — promotional term switch (segmented control) driving
  every card: monthly shows "no engagement — cancel anytime", committed
  terms show the −5/−10/−15% badge, the strikethrough list price, the
  term total and the savings. Four cards (Solo first), no highlight badge;
  each card carries a "With {plan} you'll" outcomes block. Starter/Solo
  feature "50 envelopes/month", "35 sending days a month — weekends are on
  us" and the rollover line; the rollover note under the grid explains the
  one-allowance cap. Enterprise CTA links to the new /enterprise page.
- **Enterprise onboarding (`/enterprise` + `/api/enterprise-lead` + admin
  "Enterprise Leads" console)** — the guided pipeline is explicit (form →
  pilot on real contracts → security/procurement review → rollout with a
  named contact), the lead form lands in an `EnterpriseLead` table (NEW →
  CONTACTED → QUALIFIED → WON/LOST + triage notes), queues an outbox copy
  to sales@docurama.eu (nothing lost without SMTP), is audited as
  ANONYMOUS, throttled 10 min per email, and triaged in the admin console.
- **Small team groups** — `Team` model + `Member.teamId`; workspace admins
  create/rename/delete teams and assign members (Settings → Users shows a
  Team column + a Teams card). Organisational only: workspace visibility
  unchanged, members fall back to unassigned on team delete (SetNull).
- **Onboarding completion** — the wizard's invites step shows live seat
  occupancy ("fill your remaining seats") and blocks input at capacity;
  the done step renders the plan guide (guided first steps + demo links +
  outcomes); the workspace home gained a dismissable per-plan guide card
  (localStorage via useSyncExternalStore); the admin overview gained a
  five-item platform onboarding guide (SMTP, leads, tenants/plans, DNS,
  health); signup accepts `?plan=SOLO` prefill from the pricing CTA
  (existing workspace wins on invite/domain joins).
- **Seeds** — prisma seed mirrors the catalogue (SOLO plan, 50-envelope
  Starter, outcomes, a Solo tenant, term/discount/rollover demos on the
  seeded subscriptions, StålFe Sales/Engineering/Legal teams, three
  pipeline leads); e2e quota filler 25 → 50 keeping the 402 deterministic.
- **Tests** — new `e2e/plans.test.ts` (catalog integrity incl. Solo ≡
  Starter-minus-seats, price math, page assertions incl. "no Most
  popular", SOLO signup + 403 seat limit, lead pipeline end-to-end with
  outbox + audit + 429, rollover renewal incl. cap + idempotency, team
  ops + non-admin 403); api.test.ts quota assertions 25 → 50; visual
  baselines regenerated for the repriced pricing section. Gates:
  tsc/eslint clean, **125 bun tests** across 10 files (104 in the
  dev-server batch: api 23, evidence 14, transparency 13, rekor 10, mcp 15,
  plans 21, webhooks 8 — plus visual 7, mail 7, S3 7), **25/25 Maestro
  flows** (marketing re-validated green standalone — the Maestro-beta
  dev-compile flake class, forensics in the worklog).

**Deferred → shipped (go-live cycle, this branch):** all three revenue
rungs landed on `feat/go-live-platform`:

- **Payment provider rails** — Stripe Checkout (subscription mode, per-term
  charges), signature-verified webhooks (activation, invoice.paid renewal
  with rollover, payment_failed → PAST_DUE + dunning, cancellation) and a
  manual bank-transfer mode for self-host deployments that funnels through
  the exact same activation path via admin approval. Settings → Billing tab
  + admin payments ledger. `e2e/billing.test.ts` (14 tests, stub Stripe API
  + signed webhook events). See `docs/PAYMENTS.md`.
- **SSO/SAML wiring** — OIDC (discovery, PKCE, nonce, jose JWKS
  verification; Entra ID / Google / Okta / Keycloak) and SAML 2.0
  (samlify SP, metadata endpoint, signature-verified ACS), domain-bound,
  JIT-provisioned, with the sign-in screen offering the IdP path. Settings
  → SSO tab. `e2e/sso.test.ts` (12 tests, stub OIDC provider + samlify
  round-trip). See `docs/SSO.md`.
- **Bot protection** — honeypot + time trap + optional Cloudflare Turnstile
  on signup and the enterprise lead form. `e2e/bot-guard.test.ts`
  (10 tests).

Plus the go-live content surface: the user's final 5-plan ladder restored
everywhere (Solo €12 / Starter €19 same-allowance / Smart Team €79 /
Business €199 / Enterprise custom, Product/offers JSON-LD generated from the
catalogue), the knowledge base completed (19 new articles across Billing,
Teams, Account & security, Self-hosting, Troubleshooting, Templates,
Domains, Notifications, Webhooks, MCP + 2 tutorials), a blog engine with
six launch posts, `/.well-known/security.txt`, the full markdown renderer
for docs, and the internal operator runbooks (`docs/OPERATIONS-RUNBOOK.md`,
`docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/PAYMENTS.md`, `docs/SSO.md`,
`docs/GO-LIVE-CHECKLIST.md`). Battery at this cycle: **149 bun tests**
across 13 files + 29 Maestro flows (CI).
