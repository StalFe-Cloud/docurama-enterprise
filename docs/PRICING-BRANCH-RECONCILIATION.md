# Pricing branch reconciliation

Review date: 2026-09-19. Source branch: `origin/feat/pricing-onboarding`,
`b9fbe64ccabd124173ccc128548af710eb3df3cd` (PR #11). Comparison target:
the main/go-live integration at `5bcc32148dd95a67e6bbe1a154f1a0dc1d250742`
plus the current security and catalogue reconciliation changes.

The release catalogue remains the four-plan catalogue from `main` in
`src/lib/plans.ts`. The old branch is not safe to merge wholesale: its
five-plan catalogue, additional billing schema, quota engine and PDF iframe
would replace newer shipping behavior. The feature inventory below records
what is preserved and what is still genuinely missing. “Needs port” is an
explicit gap, not a claim that the old feature was already delivered.

| Pricing-branch feature | Disposition | Current implementation and remaining work |
| --- | --- | --- |
| Five-plan pricing ladder and special 35-day periods | Superseded by chosen catalogue | Keep the four-plan `src/lib/plans.ts`, shared marketing definitions, payment rails and canonical seed. Do not revive `SMART_TEAM` or the old branch's alternative rates. |
| Signup plan prefill, guided onboarding, seat guidance | Retained through current implementation | `src/app/api/auth/signup/route.ts`, `src/lib/onboarding.ts`, and `welcome-wizard.tsx` preserve self-service plans and invitations. Corporate joins now wait for mailbox proof. The old verification shortcut is deliberately removed. |
| Enterprise form and lead triage | Retained through current implementation | `/api/enterprise-lead`, `/enterprise`, `AdminLeads`, and admin `leads` support intake, filtering, statuses, notes and audit. Current bot protection is retained. The old `/api/enterprise` contract is not restored. |
| Convert won lead to tenant, negotiated seat/envelope/price overrides | Needs port | The old branch's `leads` mutation `convert` and `Subscription` override fields have no equivalent in the current schema. A safe port must be transactional, idempotent, audited and obey dedicated-installation tenant policy, then integrate overrides with payment amounts and entitlement enforcement. Do not transplant the old non-transactional tenant creation. |
| Live admin plan editor | Intentionally not ported | `admin-plans.tsx` and admin `plans` mutations are unique to PR #11. Current allowance and checkout values come from the approved `src/lib/plans.ts`, not editable `Plan` rows. Copying the UI would claim changes are enforced when they are not. Future support needs an explicit design for effective dates and one authoritative source for pricing, limits and configured Stripe prices. |
| Envelope allowance, term discounts and capped rollover | Retained and lazy renewal ported | `currentAllowance` now renews expired manual subscriptions on demand through the existing engine. Renewal rechecks state in a transaction, advances each missed period, caps carry, and audits once. Stripe-managed subscriptions remain webhook-driven. No parallel `quota.ts` or incompatible billing schema was introduced. |
| Seat reservation and plan enforcement for invitations | Ported into current engine | `seatCapacity` counts `ACTIVE` and `PENDING_VERIFICATION` memberships, plus unexpired `PENDING` invitations. Disabled memberships release capacity; reactivation must recheck it. Pending mailbox proof reserves capacity without granting access. Domain signup and invitation creation check capacity in the same transaction that reserves the seat. Refreshing a live invite does not reserve a second seat. |
| API entitlement check before key issuance | Ported and extended to use | `apiAccessAllowed` derives access from the canonical plan and rejects suspended tenants. Workspace key issuance, REST v1 key use and MCP key use enforce it. Existing keys stop authorizing requests after downgrade; they are not deleted. Public verification remains public. Envelope quota exhaustion alone does not revoke API read entitlement. |
| Team management | Retained with a smaller model | Current `Team` plus `Member.teamId` and `team.create`, `team.rename`, `team.delete`, `member.team` support organizational grouping. The old many-to-many `TeamMember`, team colors, and team-tagged envelope filtering are additional behavior, not equivalent schema. Defer these separately; neither version provides tenant isolation through teams. |
| SMTP delivery and outbox controls | Superseded by newer transport | Current `src/lib/mail.ts`, `src/instrumentation.ts`, admin SMTP/outbox actions and `e2e/mail.test.ts` provide transport, retries/backoff and delivery state. Retain these instead of the old `flushMailOutbox` implementation. Onboarding still reports a hardcoded delivery flag; refresh that informational value from the transport when polishing its UI. |
| Quota refusal tests | Retained partly; adapt missing cases | Current `e2e/api.test.ts` has exhausted-quota coverage and `e2e/plans.test.ts`/`billing.test.ts` cover catalogue and renewal. PR #11's `e2e/quota.test.ts` uses the incompatible one-envelope negotiated override fixture. Preserve the behavior (402 never mutates, reads remain available) using the chosen catalogue; do not copy invalid fixture expectations. |
| MCP authentication/scope/rate-limit tests | Retained through newer suite | Keep current `e2e/mcp.test.ts` and its isolated runner; do not restore earlier fixture and rate-limit assumptions. |
| In-page signing document review | Superseded by newer renderer | Keep `sign-document-preview.tsx` and token-scoped page image routes. The old `/api/sign/[token]/document` iframe response is obsolete and would duplicate the current preview path. |
| Route and global error boundaries | Ported in this reconciliation | Added `src/app/error.tsx` and `src/app/global-error.tsx`: retry/home controls, optional opaque reference, no exception disclosure or unsupported claims that an engineer received an alert. The global fallback owns its HTML/body and does not require application providers. |
| Cookie notice, enterprise navigation, marketing and missing-page content | Retained through current implementation | Keep current public components and routes. Their newer pricing references are reconciled with the chosen catalogue. |

## Review and validation

Compared the old branch's unique commit range and key source implementations
against the integrated tree. Read the old quota engine, admin editor and lead
conversion, onboarding/settings changes, quota tests and error boundaries;
checked current billing, payment, team, API key, mail and UI paths. This is a
feature reconciliation, not a production billing or deployment validation.

Authentication/deployment remediation is independently covered by
`bun test e2e/auth-security.test.ts` against a fresh temporary SQLite database.
It also validates offline initial-admin provisioning and dedicated first-tenant
creation; see `docs/INSTALLATION-BOOTSTRAP.md`.
`bun test e2e/quota-security.test.ts` covers lazy/manual versus Stripe renewal,
concurrent renewal idempotence, seat reservation races, API issuance/use and
downgrade enforcement on an independent temporary database.
The full integration still requires its normal type, lint, API, browser and
deployment gates. PR #11 may be superseded as a merge vehicle only if these
explicit “Needs port” items are retained as follow-up work; it must not be
described as fully feature-equivalent.
