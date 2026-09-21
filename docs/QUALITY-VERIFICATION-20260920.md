# Quality corrective execution and acceptance evidence

Date: September 20, 2026. Delivery: PR #17, `quality-verification-20260920` into `quality`.
Source baseline: `282b06ae7fc336ce187475da5bf710b94bb0de45`.

## Scope and release status

This is a corrective implementation and verification branch, not a production
release approval. No main merge, production migration, live provider delivery,
production data restoration or deployment was performed by this continuation.
Keep the PR draft until all required checks pass on its final head.

The baseline already contains the subscription fields and versioned SQLite and
PostgreSQL migrations, bounded asynchronous password hashing, stable audit IDs,
settings-operation policy, pinned webhook transport and leased delivery engines.
This PR connects the business operations to those guarantees and tests them.

## Implemented in this PR

- Workspace envelope send uses a dedicated route. Membership/resource checks,
  quota reservation, envelope/recipient creation, template usage, mail rows,
  ledger entries and webhook rows commit in one serializable transaction.
- Reminders now enqueue actual email messages, with their throttle and ledger
  updated in the same transaction. Voids commit their audit and notification.
- Signing, viewing and declining re-read current state inside serializable
  transactions. Lifecycle hooks are queued with state, never after an unrecorded
  initial network request. Transparency/attestation calls remain outside the
  retried database callback and retain their separate recovery requirements.
- SQLite transaction admission is bounded and FIFO. It prevents concurrent
  interactive writers from starving the engine, without replacing database
  isolation or conditional writes. Unknown commit/transport errors are not
  blindly replayed. This is not a multi-process distributed lock.
- SeaweedFS setup is an explicitly awaited shared promise, independent of test
  hook ordering. Storage tests still exercise a real local S3 server.
- CI includes both-provider HTTP/transaction tests, real SMTP lease cases,
  populated-baseline migrations and native backup/restore into separate scratch
  databases, and a production image with the periodic worker enabled.
- Node and Bun network tests generate ephemeral test certificates and verify
  hostname/CA checks, pinned DNS, redirects, response limits and deadlines.
  All traffic is to local fixtures; no customer credentials are involved.
- Superseded E2E revisions are canceled rather than consuming additional runners.

## Observed successful checks, pinned to the tested revision

Revision: `b2ae31e589eb19d9b98d752fc04e12a629f6ea32`.
Release verification run: `35528164899`.

| Job | Observed outcome | What it establishes |
| --- | --- | --- |
| invariants-sqlite | Success | 15 real route/database tests, including six simultaneous sends competing for one quota slot |
| invariants-postgresql | Success | The same 15 tests on PostgreSQL |
| production-worker | Success | Actual production image, normal password login, signing, local SMTP/HMAC webhook delivery and periodic worker-only queue draining |

Both database jobs passed TypeScript and lint and applied the versioned migration
history to empty test databases. The production step was originally mislabeled
with "restart recovery"; its implementation tests periodic worker-only delivery,
NOT process restart. The label is corrected in this PR.

The earlier SQLite contention failure was reproduced before the admission fix.
The earlier full E2E run `35527754573` passed 96 API/evidence/transparency/visual
cases and the separate auth, password, quota, billing, mail, SSO and bot-guard
suites, then failed because SeaweedFS setup had not completed. That setup defect
was corrected; the entire final E2E run still needs a successful result.

## Added acceptance checks whose results are still pending

The last two verification batches add the following beyond the successful
revision above:

- `e2e/transaction-gate.test.ts`: five admission/backpressure/cleanup cases.
- `e2e/mail-invariants.test.ts`: five actual SMTP lease/backoff/fencing cases,
  executed separately on each supported database.
- `scripts/verify-migration-upgrade.mjs`: populated legacy records, byte-preserved
  webhook payloads, intentionally unidentified legacy audit rows, native SQLite
  or PostgreSQL backup/restore, idempotent deployment and schema-drift checks.
- `e2e/webhook-network.test.mjs`: sixteen policy and real local transport cases,
  including strict TLS under Node and the pinned Bun runtime.

At head `7ff5f2285dc314b32bfcaa7ab3c16e4c920b121f`, release run `35528537040`
and network run `35528537045` failed before a runner was assigned (runner ID 0,
no executed steps). One explicit network-job retry also failed before execution.
The connector did not expose the check annotations, so the underlying account,
capacity or service cause was not determined. These are NOT failed assertions
and NOT passing acceptance evidence. Do not infer a billing problem without
checking the Actions run annotations in GitHub.

The local execution environment was unavailable during this continuation, so
no local full-application execution is claimed as a substitute for these jobs.

## Remaining release gates

1. Resolve the Actions pre-start failure and run all four workflows on the final
   PR head: E2E, Quality remediation, Release verification and Webhook network
   verification. Inspect failures rather than bypassing tests or required checks.
2. Validate process interruption/restart recovery separately. Lease expiry and
   stale-ack fencing tests do not prove every crash boundary is covered.
3. Perform staging deployment, representative load and operator-native restore
   rehearsal. The CI restore fixtures are not a production restore drill.
4. Require reviewed migrations and branch checks through repository settings
   where supported. Branch-protection changes were not applied by this PR.
5. Preserve operator-controlled network egress restrictions and exact internal
   integration allowlists. Per-workspace SMTP fields remain inactive and are
   labeled as such; SMS configuration checks do not claim actual delivery.
6. Treat signature-conformance and regulatory validation as separate acceptance
   work. This PR preserves existing signing behavior, not a new certification.

External mail/webhook effects are at least once. A receiver may observe a retry
after its acknowledgement was lost. Stable delivery/Message-ID values support
deduplication; this PR does not promise exactly-once external delivery.
