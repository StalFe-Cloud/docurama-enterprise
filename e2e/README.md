# Docurama E2E — isolated browser and API suites

Current browser tests use Playwright through `bun test` in `e2e/browser/`.
Maestro YAML flows belong to historical cycles; `docs/IMPROVEMENT-PLAN.md`,
`docs/QUALITY-VERIFICATION-20260920.md` and `worklog.md` preserve their receipts.
Those results and timings do not establish a pass on a new revision.

## Quick start

For the full local lifecycle, use an isolated **Linux** checkout with installed
dependencies, a generated Prisma client, Node, Bun, Bash and Chrome/Chromium.
The default local runner refuses Windows before scratch creation, migration or
server launch because crash-safe child-tree ownership is not available there.
Use an isolated Linux VM or CI for full local/browser acceptance. Focused Node
isolation/helper/migration tests can run on Windows; they do not establish a
complete local E2E or browser pass:

```bash
bash e2e/run.sh
# Equivalent orchestrator entry point:
# node e2e/run-isolated.mjs

# Focused isolation-policy regression; does not run the full app suite:
node e2e/isolation.test.mjs
```

The runner rejects `.env`, `.env.local`, `.env.development` and
`.env.development.local` in the checkout because Next.js loads these separately
from Bun. Use a separate clean checkout instead of moving an operator's live
configuration. Bun child commands use `--no-env-file`.
Use a Bun release that supports this option. Local validation used Bun 1.4.2;
Bun 1.2.22 does not support `--no-env-file` and cannot run this safe entry point.
Keep the CI tool pin and its acceptance receipt aligned with the runner.

Local runs ignore ambient `DATABASE_URL` and refuse `E2E_DATABASE_URL`. Each run
creates an owned `docurama-e2e-*` directory under the operating system temporary
directory, containing `suite.db`, an unseeded migrated `fixture.db`, copied SQLite
schema/history, document storage and `server.log`. Reviewed SQLite migrations
initialize fresh targets; the runner never copies, pushes or seeds `db/custom.db`.
Mail and S3 suites copy only the runner-provided `E2E_FIXTURE_DB`.

The runner starts and stops its own Next.js dev server on `127.0.0.1`, choosing
an unused port by default. An explicit `E2E_BASE_URL` must be plain
`http://127.0.0.1:<port>`; a listening server on that port is refused. It never
reuses a separately running application. Scratch files and the owned server are
cleaned on success or failure; failure logs are printed before cleanup. Capture
the command output outside the scratch directory when collecting release evidence.

The runner constructs a strict allowlist of required process/test settings rather
than forwarding inherited configuration. External storage, payment, IdP, CAPTCHA,
AI-provider, witnessing and portal/API/auth credentials are excluded. Next telemetry
is disabled; the Bash entry clears `NODE_OPTIONS` and `BUN_OPTIONS`. For explicit
remote/test dispatch on Windows, installed Git Bash is selected by default;
`E2E_BASH_BIN` accepts an absolute executable path override. This does not enable
the unsupported Windows full local lifecycle.

Test defaults disable the background worker and Rekor, use manual billing and
empty SMTP configuration, and enable demo mode and private webhook fixtures only
inside the disposable test process. These defaults are not production settings.
Do not invoke mutating browser/API suites against retained or production servers.

## Explicit disposable CI PostgreSQL mode

For Linux CI that needs an owned application process, use
`node e2e/run-postgres-isolated.mjs`. It requires `CI=true`,
`E2E_REMOTE_DISPOSABLE=1` and an explicit loopback PostgreSQL
`E2E_DATABASE_URL` whose database name ends in `_test` or `_e2e`.
It reserves an explicit `E2E_BASE_URL` port or chooses a fresh loopback port,
starts its own Next server, proves direct PID/socket ownership through `/proc`,
and stops that owned process. It creates no SQLite schema or fixture. The caller
must apply the reviewed PostgreSQL migrations beforehand and owns the database
lifecycle; this runner owns the application process only. Actual PostgreSQL
integration acceptance remains pending. Windows full lifecycle fails closed.

`E2E_START_SERVER=0` is reserved for a caller-managed synthetic CI installation.
It requires `CI=true`, `E2E_REMOTE_DISPOSABLE=1`, an explicit plain loopback
`E2E_BASE_URL`, and `E2E_DATABASE_URL` selecting a loopback PostgreSQL database
whose name ends in `_test` or `_e2e`. All conditions must hold; the flags are
an assertion of ownership, not proof that an arbitrary database is disposable.
The caller owns schema migration, provider-specific client generation, server
lifecycle and database deletion. `remote-suites.sh` runs only the PostgreSQL
HTTP/browser tier; local SQLite fixture, security and provider suites are excluded.
This remote PostgreSQL tier has not been executed locally in this hardening review. The runner seeds the selected database unless
`E2E_SKIP_SEED=1`; that skip requires equivalent fixtures already prepared.
Never supply deployment credentials or a retained database to this mode.

## Suite layout and selectors

| Path | Purpose |
|---|---|
| `run.sh`, `run-isolated.mjs`, `isolation.mjs` | Guarded orchestration, owned scratch targets and owned server lifecycle |
| `suites.sh` | Local type gate, deterministic synthetic seed, API/evidence/integration suites and browser tests |
| `remote-suites.sh` | Caller-owned disposable CI PostgreSQL HTTP/browser subset; excludes SQLite local suites |
| `isolation.test.mjs` | Target refusal, port collision, scratch ownership and unchanged repository sentinel checks on success/failure |
| `seed.ts` | Synthetic tenant/account/envelope/API fixtures; contains fixture credentials and mutates its selected target |
| `browser/` | Playwright public, auth, workspace and admin journeys; shared lifecycle and locator helpers in `harness.ts` |
| `visual.test.ts`, `baselines/` | Public-route image comparisons and dev-mode performance smoke |
| `api`, `evidence`, `transparency`, `rekor`, `mcp` tests | API access and recorded digest/attestation/transparency contracts |
| Billing, SSO, bot guard, mail, webhooks, storage and security tests | Synthetic integration contracts and focused denial/retry/configuration regressions |

Prefer accessible `getByRole`, `getByLabel` and `getByText` locators. Use
`getByPlaceholder` for placeholders and test IDs only where no accessible name
exists. Browser flows can spend their seeded state; run through fresh orchestration
when evaluating the full journeys. A passing evidence-pack test verifies its stated
digest/attestation contract, not embedded PAdES/TSA conformance.

## Optional tools, visual baselines and acceptance receipts

Chromium resolution uses `CHROME_BIN`, Playwright-managed cache, PATH and supported
Windows installation paths. In an environment without Chromium,
`E2E_SKIP_BROWSER=1` and `E2E_SKIP_VISUAL=1` explicitly omit those gates. S3 coverage
requires Linux and a safe SeaweedFS lifecycle. With a configured `WEED_BIN`
(or `weed` found on PATH), the fixture leases eight loopback HTTP/gRPC ports,
uses unique credentials, and proves each listener belongs to its exact child PID
through Linux `/proc` socket inodes before storage probes or writes. It disables
optional services and telemetry and confirms child exit before removing scratch
files. Unsupported platforms fail closed for configured S3 coverage.
`E2E_SKIP_S3=1` remains an explicit optional omission; without a binary the
existing optional local behavior skips honestly. Run
`node e2e/seaweed-isolation.test.mjs` for portable policy tests and mandatory Linux
live ownership cases. The Windows review passed portable cases but skipped Linux
live cases; actual Linux ownership and real S3 integration/CI evidence remain
required. No real S3 integration pass is claimed at this checkpoint.
Record every skip: an omitted suite cannot satisfy its release gate.

Visual comparisons use committed `e2e/baselines/*.png`. A missing baseline is
created by the existing visual test, so success alone does not establish comparison
coverage. Review missing/new baselines explicitly. `UPDATE_BASELINES=1` intentionally
regenerates them; review image changes before accepting the result. Dev-mode LCP
smoke is not a production performance benchmark.

CI jobs are defined in `.github/workflows/e2e.yml` and release-specific workflows.
Their presence does not prove execution. Retain the exact revision, command,
provider, browser/tool versions, outcome, logs and skips for a promotion candidate.
The local isolation regression covers orchestration safety; full SQLite/PostgreSQL
browser/API, production-image and deployment-specific acceptance remain distinct
gates in `docs/GO-LIVE-CHECKLIST.md`.
