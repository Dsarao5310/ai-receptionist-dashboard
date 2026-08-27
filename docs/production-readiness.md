# Production readiness handoff

Audit date: 2026-08-27 (America/Vancouver)

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
| Pinecone/knowledge provider | STAGING LIVE-CERTIFIED; HISTORICAL BACKLOG COMPLETE | Server-issued namespaces, durable reconciliation state, tombstones, monotonic versions, bounded contracts, deterministic simulation, local-authority hydration, and staging-only live policy pass. The database-backed UI flow is certified end-to-end and migrations are 19/19 in both environments. After provider-free previews, an explicitly approved bounded execution synchronized all eight historical rows across two authorized workspaces with zero adverse outcomes or `sync_required`; final status is Coastal 5/5 and Harbour 4/4 synced. Production has no Pinecone credential. See `knowledge-provider-readiness.md`. |
| Model provider | APPLICATION-READY + SIMULATOR VERIFIED | Server-only AI Gateway transport, approved cross-provider fallback, strict reply/analysis outputs, deterministic evals, prompt-injection handling, normalized errors, and time/token/cost guardrails pass. No gateway auth, live request, billed usage, latency/failover evidence, Vapi connection, or live certification. See `model-provider-readiness.md`. |
| Call privacy lifecycle | APPLICATION-READY + DATABASE/ACTION-TEST VERIFIED | Fail-closed recording mode, minimal consent evidence, bounded retention, sensitive-access redaction, a disabled authenticated/leased purge scheduler, owner/operator policy UI, durable identity-gated erasure requests, and a sanitized read-only platform-operator health page pass. Its schema is in the verified remote 17-file checkpoint. The cron route is deployed but disabled; true reauthentication, legal approval, configured schedule secret, external alerting, provider recording ingestion, and live certification remain. See `privacy-readiness.md`. |
| CI | COMPLETE FOR CURRENT COMMITTED FOUNDATION | GitHub Actions installs on pinned Node 20, runs `next typegen`, then typecheck, lint, credential-free tests, fail-closed build, and client-secret audit. The current recovery-verification foundation passed the uncontested database-backed gate: 45/45 files and 577/577 tests. |
| Monitoring | PRODUCTION LIVENESS LIVE-VERIFIED; OPERATIONS INCOMPLETE | Dynamic, content-free, no-store `GET`/`HEAD /api/health` is deployed and passed live HTTPS verification through Vercel protection using the locally held automation bypass. An UptimeRobot account exists, but monitor configuration, thresholds, contacts, owners, controlled alert/recovery proof, and error/log draining remain unverified. See `monitoring-readiness.md`. |
| Alerting | NOT STARTED | No paging route, severity policy, acknowledgement target, or escalation schedule. |
| Backups/recovery | PARTIAL; READ-ONLY VERIFIER READY | Forward-only and isolated restore procedures are documented. A fail-closed read-only verifier now checks a separately restored disposable project's migration ledger, schema, tenant constraints, roles/grants, and aggregate rows while refusing known staging/Production refs. No real backup restore, restored-target verification, Preview compatibility proof, or cleanup has been executed. |
| Security | PARTIAL | Tenant hardening, private schemas, credential rotation, bounded webhooks, safe redirects, client-secret audits, and focused tests exist. Nodemailer was updated to 9.0.5 in `42e8bad`; `b91524c` adds the override needed for strict clean installs. Claude verified zero audit vulnerabilities. Recurring scanning and operational response remain. |
| Performance | NOT STARTED | No production load, concurrency, latency-budget, or capacity certification exists. |
| UI/mobile/accessibility | PARTIAL | Core hosted role flows passed, but comprehensive mobile, keyboard, screen-reader, loading, failure, and retry QA is incomplete. |
| Privacy/compliance | PARTIAL | Technical consent, retention, sensitive-access, erasure controls, and remote schema parity are verified. Consent wording/retention approval, privacy terms, regulatory review, true request identity verification, scheduled purge operations, and live certification remain. |
| Onboarding/offboarding | PARTIAL | Staging identity and membership provisioning is proven; client onboarding, revocation/offboarding, support ownership, and escalation are not end-to-end certified. |

## Current verified deployment evidence

- Staging origin:
  `https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app`
- Current isolated staging deployment:
  `dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa`, commit `64fa59a`, READY with branch-scoped
  Pinecone configuration and the protected reconciliation foundation. The
  earlier complete Knowledge add/search/delete certification remains applicable;
  this phase added provider-free, audited dry-run evidence only.
- Production origin: `https://ai-receptionist-dashboard-jade.vercel.app`
- Live-verified monitoring deployment: `dpl_DzM2nQB42EGDVccnDdupih8zQf6j`, commit
  `f2d725c`, READY. The current two-hour runtime scan found no health-route error
  cluster; reported Auth.js `AccessDenied` events belong to an older deployment.
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

- Recovery-verifier target guards passed 5/5. The command refused the known
  staging ref before any database connection. The consolidated gate passed
  typecheck, full lint, 45/45 test files and 577/577 tests; the client-secret
  audit passed across 56 artifacts. No backup restore or remote mutation ran.
- Monitoring liveness verification passed focused route tests 2/2, full
  typecheck and lint, 44/44 test files and 572/572 tests, the optimized
  production build, and the 56-artifact client-secret audit. The build lists
  `/api/health` as a dynamic route. Focused route/proxy tests passed 6/6, and a
  rebuilt production server returned the expected unauthenticated 200 GET/HEAD,
  minimal/body-free responses, and no-store headers locally. The
  Production deployment and HTTPS GET/HEAD verification passed with the locally
  held Vercel automation bypass. The UptimeRobot monitor and alerting policy are
  not yet claimed as configured or tested.
- Current committed Knowledge reconciliation hardening: accepted uncontested
  verification passed 42/42 files and 564/564 tests, plus TypeScript, full lint,
  production build, and the client-secret audit. Two overlapping focused runs
  also proved the whole-run advisory lock serializes shared `app_test` ownership.
  Provider-free staging previews completed for both workspaces, followed by an
  explicitly approved live execution: 8/8 attempted and synchronized, zero
  adverse outcomes, zero retryable/`sync_required`, and both completion audits
  recorded. Final status is Coastal 5/5 and Harbour 4/4 synchronized; the
  cross-workspace status probe failed closed before any provider call.
  Six focused tests pass for the local operator CLI's targeting, bounds,
  authorization-resolution, and content-free projection guards.

- Email foundation verification passed 40/40 focused checks, including 10/10
  database-backed email contract, tenant-smuggling, replay/concurrency,
  outbound-idempotency, disabled-mode, and runtime-grant cases. Typecheck, lint,
  optimized build, and the 49-artifact client-secret audit passed. No public
  email route was added.
- Email coverage is included in the current uncontested 564/564 consolidated
  result; the earlier shared-schema collision is superseded by the whole-run
  advisory lock and successful serialized gate.
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
- The Nodemailer/Auth.js dependency finding was remediated in `42e8bad` with the
  clean-install override in `b91524c`; Claude verified zero audit vulnerabilities.
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
4. Point an approved uptime service at the new `/api/health` liveness target,
   assign alert ownership/escalation, prove one failure and recovery alert, add
   approved error/log collection, and execute an isolated restore drill.
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
