# Production readiness handoff

Audit date: 2026-08-26 (America/Vancouver)

## Decision

**NO-GO for a real client launch.** Authentication, tenant isolation, staging,
database persistence, and Google Calendar have strong evidence. The product is
still missing live voice/model capability, live n8n and Twilio certification,
monitoring, recovery proof, and live-certified privacy/operational controls.

## Status matrix

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Supabase persistence | STAGING 19/19; PRODUCTION 19/19 | Production and isolated staging use private `app`/`app_test` schemas, separate runtime/migrator roles, and tenant-binding constraints. Knowledge migrations 18 and 19 are applied and independently verified in both environments; runtime update access to the immutable namespace mapping is revoked. |
| Auth.js | LIVE VERIFIED | Google OAuth, account selection, session persistence, sign-out, and safe continuation passed over hosted HTTPS. Auth.js remains the only authentication system. |
| RBAC | LIVE VERIFIED | Coastal owner, manager, staff, Harbour owner, and platform operator passed their hosted staging route matrix. |
| Tenancy | LIVE VERIFIED | Ordinary users saw only their workspace; the operator switched between both; cross-workspace reads/mutations remain server-scoped and database-tested. |
| Isolated staging | AUTH/RBAC RE-CERTIFIED; KNOWLEDGE LIVE-CERTIFIED | Stable branch alias, separate OAuth client and Supabase project, and branch-scoped Preview secrets remain isolated. After matching application code was deployed, a real owner passed Knowledge create, reload, scoped DB verification, semantic Pinecone retrieval, delete, tombstone, and provider-removal checks. |
| Production deployment | DEPLOYED; PARTIALLY AUTH RE-CERTIFIED | Production has the current Business Knowledge application code but no Pinecone credential, so live Knowledge provider traffic remains fail-closed. Public health and the inspected error windows passed. A real Coastal owner passed business-route/privacy/tenant probes, and a no-membership identity failed closed; manager, staff, Harbour owner, and operator remain unverified in production. |
| Duplicate Vercel project | MISCONFIGURED | `ai-receptionist-dashboard-dsarao` is also connected to the same repository and produces a second failing deployment stream. Its latest production build rejected an invalid `AUTH_URL`; removal/disconnection needs explicit approval. |
| Google Calendar | LIVE VERIFIED | Real OAuth, encrypted token storage, CRUD, reconciliation, tombstone/replacement behavior, tenant isolation, idempotency, and `sync_required` behavior were verified previously. |
| n8n | EXTERNALLY BLOCKED | Architecture and simulator coverage exist. Real instance URL, independent signing secrets, activated staging workflows/mappings, and execution of `n8n-live-certification.md` remain. |
| Twilio | EXTERNALLY BLOCKED | Implementation and simulator tests pass; the account has no owned SMS-capable number and live callback certification is outstanding. |
| Vapi | APPLICATION-READY + SIMULATOR VERIFIED | Authenticated status/end-report ingestion, trusted assistant/phone tenancy, durable idempotency, monotonic call lifecycle, transcript persistence, and client redaction pass. No account, credentials, registered webhook, model, or live call. See `vapi-readiness.md`. |
| Gmail/email provider | APPLICATION-READY + SIMULATOR/DATABASE VERIFIED | Private mailbox/thread/message identity, trusted tenant mapping, shared inbound receipt/idempotency, outbound operation/sync-guard behavior, disabled/live fail-closed modes, and client boundary pass. Its schema is in the remote 17-file checkpoint and code is deployed. No Gmail OAuth/scopes, watch/Pub/Sub, public provider callback, live send/read, or certification. Auth.js email magic links remain separately disabled. See `email-provider-readiness.md`. |
| Pinecone/knowledge provider | STAGING LIVE-CERTIFIED; HISTORICAL BACKLOG PENDING | Server-issued namespaces, durable reconciliation state, tombstones, monotonic versions, bounded contracts, deterministic simulation, local-authority hydration, and staging-only live policy pass. The real database-backed UI flow is certified end-to-end and migrations are 19/19 in both environments. Eight historical staging rows remain pending; protected dry-run/status/reconciliation operations are implemented locally but not deployed or executed. Production has no Pinecone credential. See `knowledge-provider-readiness.md`. |
| Model provider | APPLICATION-READY + SIMULATOR VERIFIED | Server-only AI Gateway transport, approved cross-provider fallback, strict reply/analysis outputs, deterministic evals, prompt-injection handling, normalized errors, and time/token/cost guardrails pass. No gateway auth, live request, billed usage, latency/failover evidence, Vapi connection, or live certification. See `model-provider-readiness.md`. |
| Call privacy lifecycle | APPLICATION-READY + DATABASE/ACTION-TEST VERIFIED | Fail-closed recording mode, minimal consent evidence, bounded retention, sensitive-access redaction, a disabled authenticated/leased purge scheduler, owner/operator policy UI, durable identity-gated erasure requests, and a sanitized read-only platform-operator health page pass. Its schema is in the verified remote 17-file checkpoint. The cron route is deployed but disabled; true reauthentication, legal approval, configured schedule secret, external alerting, provider recording ingestion, and live certification remain. See `privacy-readiness.md`. |
| CI | COMPLETE FOR COMMITTED FOUNDATION; LOCAL RECONCILIATION UNDER VERIFICATION | GitHub Actions installs on pinned Node 20, runs `next typegen`, then typecheck, lint, credential-free tests, fail-closed build, and client-secret audit. Database-backed tests remain a protected staging release gate; the current uncommitted reconciliation work must complete that gate before release. |
| Monitoring | NOT STARTED | No production error tracker, trace/log drain, uptime monitor, or provider health dashboard with an owner. |
| Alerting | NOT STARTED | No paging route, severity policy, acknowledgement target, or escalation schedule. |
| Backups/recovery | PARTIAL | Forward-only and isolated restore procedures are documented; no isolated restore drill has been executed. |
| Security | PARTIAL | Tenant hardening, private schemas, credential rotation, bounded webhooks, safe redirects, client-secret audits, and focused tests exist. Read-only `npm audit --omit=dev` currently reports three high entries through the existing Nodemailer/Auth.js chain (GHSA-p6gq-j5cr-w38f); AI SDK/Zod are not implicated. Compatibility-tested remediation, recurring scanning, and operational response remain. |
| Performance | NOT STARTED | No production load, concurrency, latency-budget, or capacity certification exists. |
| UI/mobile/accessibility | PARTIAL | Core hosted role flows passed, but comprehensive mobile, keyboard, screen-reader, loading, failure, and retry QA is incomplete. |
| Privacy/compliance | PARTIAL | Technical consent, retention, sensitive-access, erasure controls, and remote schema parity are verified. Consent wording/retention approval, privacy terms, regulatory review, true request identity verification, scheduled purge operations, and live certification remain. |
| Onboarding/offboarding | PARTIAL | Staging identity and membership provisioning is proven; client onboarding, revocation/offboarding, support ownership, and escalation are not end-to-end certified. |

## Current verified deployment evidence

- Staging origin:
  `https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app`
- Last explicitly recorded certified Knowledge staging deployment:
  `dpl_5ypffPNJxgW3YNxzeni5Ufjsr63D`, commit `0b444ac`, READY with branch-scoped
  Pinecone configuration and matching application/schema code. The complete
  Knowledge add/search/delete round trip passed there.
- Production origin: `https://ai-receptionist-dashboard-jade.vercel.app`
- Production has the merged Business Knowledge code. Pinecone remains disabled
  there because no Production credential is configured; no Production provider
  certification is claimed.
- Production origin returned HTTP 200 and the expected unauthenticated sign-in
  state. Owner business routes/privacy/tenant probes and no-workspace denial are
  authenticated; the remaining production roles are not claimed.
- Duplicate project `ai-receptionist-dashboard-dsarao` remains connected to the
  same repository and failing; its latest build reports an invalid `AUTH_URL`.
- Staging Google matrix: Coastal owner/manager/staff, Harbour owner, and platform
  operator; operator switching, cross-tenant isolation, account selection, and
  sign-out passed with no Vercel runtime errors during the test window.

## n8n readiness

The browser cannot name a workflow. Authorized semantic operations resolve an
active workspace mapping; a mapped workflow wins over a direct adapter. The
operation row and stable workspace-scoped idempotency identity exist before the
external request, requests have an explicit timeout, and failures are
normalized. Inbound processing follows signature, schema, trusted workflow-ref
tenant resolution, database uniqueness, and a single transaction. Inactive
workflow mappings no longer authorize inbound mutation.

Run the read-only preflight, then the ordered live runbook:

```text
npm run n8n:preflight -- --workspace ws_coastal_bloom --expected-origin https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app --expected-project-ref jhkbsfsbnynysplvnwca
```

Live certification remains blocked on the real n8n URL, two independent signing
secrets, and activated staging workflow references. `appointment.booked` is the
current inbound booking contract; outbound `appointment.book` remains automated
only until a trusted product call site exists.

## Release gates

For every release: focused changed-area tests, typecheck, lint, full tests where
the isolated database is available, fail-closed build, client-secret audit,
Preview browser verification, migration status, and runtime error scan. CI does
not deploy and does not receive production or provider credentials.

## Verification for this pass

- Current local Knowledge reconciliation hardening: 11/11 new unit/action tests,
  TypeScript, full lint, production build, and the 56-artifact client-secret
  audit pass. The consolidated database phase is not green because concurrent
  `app_test` rebuilds produced missing fixtures/tables and tuple-concurrency
  failures: 34/42 files and 377 tests passed; 91 failed and 96 skipped. Rerun
  with one schema owner before release. No live reconciliation was executed.

- Email foundation verification passed 40/40 focused checks, including 10/10
  database-backed email contract, tenant-smuggling, replay/concurrency,
  outbound-idempotency, disabled-mode, and runtime-grant cases. Typecheck, lint,
  optimized build, and the 49-artifact client-secret audit passed. No public
  email route was added.
- A consolidated post-email suite count is not claimed because Claude's
  separately documented background check rebuilt the same `app_test` schema
  during Codex's attempts, causing unrelated missing-table failures. The email
  suite itself rebuilt the full migration chain and passed before that overlap;
  rerun the consolidated gate with one schema owner before release.
- 12 privacy policy/database/scheduler/request tests, 6 cron route/auth tests,
  and the focused policy/request action/input/tab gate passed 31/31,
  including fail-closed scheduling, overlap prevention, sanitized history,
  normalized failure, fail-closed recording,
  consent ordering, withdrawal erasure, append-only evidence, tenant tampering,
  explicit deletion, expiry purge, and sensitive access.
- Focused scheduler/privacy/configuration verification passed 27/27 tests.
- Privacy operations health and authorization passed 5/5 tests; the focused
  privacy/scheduler/health gate passed 23/23.
- Privacy staging preflight validators and disposable-database inspection
  passed 5/5 tests; an invalid target blocked before database access and printed
  no values.
- Final uncontested consolidated `npm run check`: typecheck, lint, and 519/519
  tests across 36 files passed, including the isolated database-backed groups.
- The fail-closed Next.js production build passed with synthetic non-secret
  configuration and all production provider modes disabled. The route count
  is now 26, including the dynamic server-only privacy cron route and the
  server-rendered platform-operator `/admin/privacy` route; no public privacy
  or recording endpoint was added. Policy mutation uses an authenticated
  Server Action guarded by `privacy.manage`.
- In-app browser QA passed at 1440x900 and 375x812 against the isolated
  `app_test` schema, including responsive layout, selected-tab visibility,
  invalid/valid/dirty/discard behavior, and a clean final console-error window.
- The erasure panel later rendered at 1440x900 with minimal completed/rejected
  rows and no submitted transition. Its pending dialogs and second-phase mobile
  state remain unclaimed after the browser safety policy blocked the stale tab.
- Rendering is not claimed for the new operations-health route because that
  in-app Browser safety boundary remained in effect and was not bypassed.
- The generated-client audit passed across 49 artifacts without printing secret
  values.
- The prior read-only production dependency audit remains unchanged: three high
  entries through the pre-existing Nodemailer/Auth.js dependency chain. It was
  not rerun or remediated in this privacy phase.
- The Supabase CLI generated the local privacy/email migrations and the isolated
  `app_test` schema was rebuilt from them. No remote migration, provider
  account/configuration, credential, environment mutation, live call, scheduled
  execution, or production/staging application-row change was performed by the
  agents. Git integration did automatically deploy the merged code to production.

## Shortest path to a limited pilot

1. Provision and live-certify n8n using `n8n-live-certification.md`.
2. Obtain an SMS-capable Twilio number and execute the existing Twilio runbook.
3. Live-certify the existing model-provider foundation in isolated staging,
   then provision/live-certify Vapi and connect the two in a separate call-safety
   phase.
4. Add monitoring, alert ownership, uptime checks, and execute an isolated
   restore drill.
5. Approve privacy/recording/retention policy, apply and verify the migration in
   isolated staging, enable the authenticated schedule with external run/failure
   monitoring and administration flows,
   then run hostile live privacy certification.
6. Complete mobile/accessibility/failure-state QA and run a controlled internal
   pilot before any real client.

## Rollback rule

Database migrations remain forward-only. Capture a verified backup, record the
prior deployment ID, and prove application rollback compatibility before every
production release. Never run `db:reset` against staging or production-shaped
data. Follow `operations-runbook.md`.
