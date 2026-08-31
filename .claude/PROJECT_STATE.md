# Current Project State

Updated: 2026-08-31

## Repository checkpoint

Branch: `master`, HEAD `797f4b3` (also current on session branch
`claude/launch-terminal-q0czdf`, which is even with `master`).

PR #1 merged the former `ui/dashboard-reconstruction` branch as `5af8fd7`.
Commit `ccf6272` then fixed fresh-checkout CI type generation by running
`next typegen` before TypeScript.

PR #2 (`knowledge/pinecone-provider-foundation`) subsequently merged as
`f365cea`, landing the full Business Knowledge provider foundation on
`master` — it is no longer an uncommitted working-tree artifact. Two
docs-only follow-up commits (`0b444ac`, `797f4b3`) recorded the merge and
the live end-to-end Knowledge/Pinecone certification through the real UI;
see `.claude/CURRENT_TASK.md` and `.claude/handoffs/latest.md` for the full
evidence trail. The working tree is otherwise clean — no pending advisor-
hardening or Knowledge artifacts remain uncommitted.

The repository has 19 migration files. Both staging and production are
verified through file 18 and remain 18/19; file 19
(`20260826033517_knowledge_namespace_immutability.sql`) is still local-only
namespace-immutability privilege hardening, not yet applied remotely. The
prior UI, provider, privacy, scheduler, and email foundation remains
committed; none of the migrations already applied to staging/production was
edited.

## Live platform status

- Supabase persistence: **STAGING 18/19; PRODUCTION 18/19**.
  Both projects record the first 18 files with exact checksums in
  `app.schema_migrations`. The first production six-file batch (2026-08-25) and
  the Knowledge migration on staging (2026-08-25) were applied by Codex, each
  after separate explicit approval, through Supabase's authenticated SQL
  channel under effective role `app_migrator` and schema `app`; none of these
  actions rotated or exposed a database password. On 2026-08-26, with explicit
  user approval scoped to schema-only (live Pinecone setup was explicitly
  declined as a separate phase), Claude applied the same Knowledge migration
  file to production via the same mechanism and independently verified ledger
  parity, table ownership, grants, backfill, and advisors directly against the
  live database — see `.claude/CURRENT_TASK.md` for the full evidence. No
  Pinecone account, credential, or traffic exists anywhere. Local file 19
  revokes unused runtime `UPDATE` on the immutable namespace mapping; it has not
  been executed against either remote project.
- Auth.js Google OAuth: **LIVE VERIFIED historically**.
- Hosted staging RBAC/tenancy matrix: **LIVE RE-CERTIFIED AT `ccf6272`**.
- Google Calendar: **LIVE VERIFIED historically**.
- Production Vercel project: **DEPLOYED + PUBLIC SIGN-IN HEALTH VERIFIED**.
  Superseded by the PR #2 merge: production redeployed at merge commit
  `f365cea` (`dpl_8fRbX5znDPXbVfoyM68HYcovmfSk`, READY), then again at the
  docs-only follow-up `0b444ac` (`dpl_Bk16VV1VwRN2ALkVG3HUziCrvbfW`, READY).
  Production now runs the Business Knowledge/Pinecone code, though
  `KNOWLEDGE_PROVIDER_MODE` remains unset/disabled there — no live Pinecone
  traffic from production. The earlier `ccf6272`/`dpl_789Ci6wJ7bf4kKj6Lyup1JcxWnfx`
  checkpoint and its 24-hour health refresh predate this and are historical only.
- Authenticated production behavior after the new deployment is **PARTIALLY
  RE-CERTIFIED: OWNER + NO-WORKSPACE FAIL-CLOSED**. A real Coastal Bloom owner
  completed Google OAuth in the in-app Browser on production and passed the
  full business-route matrix, owner Privacy visibility, sensitive call-detail
  access, and an own-versus-foreign customer-id probe. A saved active identity
  with no membership received Auth.js `AccessDenied` and never entered a
  workspace. Manager, staff, Harbour owner, and platform-operator production
  identities were not available among the saved Google accounts, so their
  production matrix is not claimed.
- Staging alias: **READY AT `0b444ac` + LIVE KNOWLEDGE/PINECONE FLOW CERTIFIED
  THROUGH THE REAL UI (2026-08-26)**. After the PR #2 merge, the user pushed
  `master:staging` directly; Vercel redeployed staging at `0b444ac`
  (`dpl_5ypffPNJxgW3YNxzeni5Ufjsr63D`, READY), matching production's code. The
  authenticated re-run against this deployment confirmed the full round trip
  independently at every layer: UI entry survives a hard reload, the database
  row has `provider_document_id` set and `provider_sync_state = synced`,
  Pinecone semantic search finds the real vector, and delete removes it from
  both DB and Pinecone. No stray test data was left behind. Full detail in
  `.claude/handoffs/latest.md`. The earlier `ccf6272`/`dpl_5MHQZMfCnkUQdhBidnh6dVVDALFj`
  checkpoint and its five-role RBAC re-certification predate this and remain
  historically valid but are no longer the current staging deployment.
- Staging database schema: **MIGRATED + ADVISORS CLEAR, NOT AUTH-CERTIFIED**. All
  expected new tables exist; privacy defaults cover 2/2 workspaces and the
  privacy-state backfill covers 443/443 calls. The forward hardening migration
  pins both privacy functions and adds all eleven foreign-key indexes. Security
  Advisor returns zero findings; Performance Advisor returns no unindexed-
  foreign-key or non-INFO findings, only unused-index INFO notices on the
  fresh/rebuilt schemas.
- Staging custom-role pooler authentication: **LIVE VERIFIED AFTER ROTATION**.
  Direct `app_migrator` authentication passed; after the propagation window,
  session-pooler `db:status` passed and a transaction-pooler query authenticated
  as `app_runtime`.
- Vercel staging database secret: **UPDATED + DEPLOYED**. The intended
  project's Secret `DATABASE_URL` for Preview branch `staging` was updated to
  the rotated runtime transaction-pooler URL on 2026-08-25. The Production
  variable was not changed. Deployment `dpl_5MHQZMfCnkUQdhBidnh6dVVDALFj`
  activated the branch-scoped value for commit `ccf6272`.
- Duplicate Vercel project: **STILL CONNECTED + MISCONFIGURED**.
  `ai-receptionist-dashboard-dsarao` is connected to the same repository and
  generates duplicate failures. Its latest deployment remains `ERROR`; current
  logs reject invalid `AUTH_URL` and Preview use of the production Supabase
  project. No removal or configuration change was performed.
- Local dashboard runtime: **NOT RUNNING AT THE 2026-08-26 REFRESH**. Port 3000
  refused connections. Codex left it stopped while Claude was changing
  Pinecone dependencies rather than starting from an in-progress package state.
- Preview deployment for PR #1: **FAILED CLOSED** because required Preview
  authentication/database configuration was absent.

## Provider status

- Google Calendar: **LIVE VERIFIED**.
- n8n: **APPLICATION-READY; EXTERNALLY BLOCKED**. No accessible instance or live
  staging certification.
- Twilio: **BUILT + SIMULATOR VERIFIED**; not live-certified.
- Vapi: **APPLICATION-READY + SIMULATOR VERIFIED**; no live account/webhook/call,
  recording ingestion, or live certification.
- Model provider: **APPLICATION-READY + SIMULATOR VERIFIED**; current Gateway
  ids/base prices were rechecked on 2026-08-26 and structured-output schema
  failures now receive explicit sanitized normalization. Focused verification is
  13/13 plus TypeScript/targeted ESLint. No live gateway request, billed usage,
  latency/failover observation, or Vapi connection.
- Gmail/email: **APPLICATION-READY + SIMULATOR/DATABASE VERIFIED**; its schema
  is applied remotely through file 17, but no Gmail OAuth, approved scopes,
  watch/Pub/Sub lifecycle, public provider callback, live read/send, or provider
  certification exists.
- Call privacy lifecycle: **APPLICATION-READY + DATABASE/ACTION-TEST VERIFIED**;
  its schema is applied remotely through file 17, but no legal approval, true
  reauthentication, configured schedule secret, external alerting, recording
  ingestion, or live certification exists.
- Knowledge/Pinecone: **LIVE, CERTIFIED END-TO-END THROUGH THE REAL UI ON
  STAGING (2026-08-26)**. Server-issued tenant namespaces, durable sync and
  reconciliation state, tombstones, monotonic version ordering, bounded
  contracts, a deterministic simulator, registry projection, and production
  fail-closed policy are implemented. Schema migration 18 is applied and
  verified in both staging and production. The application code (server
  actions, repositories, UI) merged via PR #2 (`f365cea`) and is deployed to
  both production and staging. The full round trip — UI → server action → DB
  (`provider_document_id` set) → Pinecone upsert → synced → semantic search
  finds it → delete → removed from both DB and Pinecone — is verified live on
  staging; see the staging alias bullet above and `.claude/handoffs/latest.md`.
  Production has the code but no `KNOWLEDGE_PROVIDER_MODE`/Pinecone credential
  configured, so it remains fail-closed/disabled in practice; no production
  live certification is claimed.
  **Addendum, Claude, same day:** wrote the actual live adapter
  (`src/server/integrations/knowledge/pinecone.ts`, real
  `@pinecone-database/pinecone` SDK calls, 9/9 unit tests against a fake
  Index, typecheck/lint clean) plus a `pinecone` credential-store entry and
  `PINECONE_INDEX_HOST` config. Deliberately did **not** wire it up:
  `client.ts`'s unconditional "live" throw and `production-config.ts`'s
  unconditional rejection of `KNOWLEDGE_PROVIDER_MODE=live` (every
  environment, not just production) are untouched. No Pinecone index or
  credential exists for this project either — the connected Pinecone
  account has one unrelated pre-existing index (`drive1`), confirmed via
  read-only `list-indexes`. Full detail in `claude-notes.md`.
  **Second addendum, Claude, same day:** with explicit user approval, lifted
  both gates the same way every other provider works (require real
  `PINECONE_API_KEY`/`PINECONE_INDEX_HOST` instead of an unconditional
  block; production stays blocked in practice because no production
  credential exists, not via a special case) and created a real staging
  index (`ai-receptionist-knowledge-staging`, `llama-text-embed-v2`,
  `aws us-east-1`, fieldMap `content`). 552/552 tests pass after the
  wiring change. User then added a real `PINECONE_API_KEY` to their own
  local `.env.local`; a throwaway smoke-test script (deleted after use)
  confirmed a genuine live round trip — upsert, embedded search found it,
  remove, confirmed gone — against the real staging index. Nothing
  deployed: Vercel staging Preview still has no Pinecone env vars set, and
  production is completely untouched. Full detail in `claude-notes.md`.

## Verification checkpoint

- Authenticated staging checkpoint: five real Google identities completed OAuth
  on deployment `dpl_5MHQZMfCnkUQdhBidnh6dVVDALFj`; staff/manager/owner/operator
  route gates, staff sensitive-content redaction, owner privacy visibility,
  bidirectional cross-tenant customer probes, operator workspace switching,
  audit persistence, sign-out, and safe continuation passed. Vercel showed five
  callback requests and no runtime error clusters in the inspected 30 minutes.
- The refreshed scope did not mutate an identity to unknown/suspended, induce a
  database outage, inspect cookies, spoof forwarded hosts, or re-test production
  sign-in. Those cases are not claimed as newly live-verified.
- Advisor-hardening checkpoint: official Supabase CLI generated
  `20260825151957_provider_privacy_advisor_hardening.sql`; TypeScript and
  targeted ESLint pass. With explicit approval, its focused staging `app_test`
  verification passed 2/2, the migration applied transactionally to staging
  `app`, and `db:status` reports all 17 files applied.
- Final uncontested local gate recorded by Claude: typecheck, lint, and 519/519
  tests across 36 files passed.
- The focused Knowledge provider suite was rerun after shared-schema contention
  cleared and passed 9/9, including tenant isolation, foreign-id rejection,
  stale-write ordering, safe provider failure state, tombstones, and input
  bounds. Migration file 18 is now applied and remotely verified in both staging
  and production under separate explicit approvals.
- A local retrieval-boundary follow-up now validates provider search results at
  runtime, enforces requested limits, rejects invalid input through the safe
  error contract, normalizes raw retrieval failures, and treats provider matches
  only as ranked ids. Results are workspace-resolved and hydrated from active
  local Business Knowledge; unknown or foreign ids are discarded. Rehydration
  uses one deduplicated batch query instead of an N+1 path. Its pure contract
  gate passes 8/8; typecheck and targeted ESLint are green.
- Knowledge automatic reconciliation now enumerates only retryable `pending` and
  `error` states; `sync_required` is excluded in accordance with the provider
  safety rules. A database regression was added but not executed while Claude may
  share `app_test`; static verification remains green.
- Knowledge stale-failure settlement now returns `superseded` when its guarded
  failure update loses to a newer revision. Pure contract coverage is 8/8;
  typecheck and targeted ESLint pass.
- Same-version settlement now also requires a retryable current state, preventing
  concurrent workers from overwriting `synced` or `sync_required`. The complete
  hosted Knowledge suite passes 17/17 against disposable `app_test`.
- Provider success is now separated from local settlement failure. A failed
  `markSynced()` after a completed external write records `sync_required`
  rather than retryable `error`, preventing automatic duplicate provider work.
  Pure contracts pass 9/9 and the expanded hosted Knowledge suite passes 19/19
  against disposable `app_test`; typecheck and targeted ESLint also pass. The
  final consolidated gate passes 38/38 files and 541/541 tests.
- Knowledge action results no longer collapse provider attention into a rejected
  local save. The accepted database mutation remains visible and is refreshed,
  while the dashboard reports one synchronization warning. The focused result-
  projection suite passes 2/2; typecheck and targeted ESLint pass.
- Official Supabase CLI 2.115.0 generated local migration file 19 to revoke
  unused `app_runtime` update authority on the immutable Knowledge namespace
  mapping. Source inspection confirms only insert/select are used. The schema
  regression expects update denial and passes 3/3 against disposable `app_test`;
  neither staging nor production `app` has applied file 19.
- Final uncontested repository gate after Claude became idle: typecheck, full
  lint, 38/38 test files, and 539/539 tests pass. This supersedes the historical
  531-test local total for the current working tree. Only disposable `app_test`
  was rebuilt; no staging/production `app` schema changed.
- The Knowledge migration's local pre-staging review is green. Executed-schema
  hardening tests pass 3/3 and now assert `app_migrator` ownership, private-schema
  isolation from `anon`/`authenticated`, and least-privilege `app_runtime`
  access. Targeted ESLint and typecheck also pass.
- Reconciled the main README, production/staging readiness, Calendar rerun
  runbook, email/privacy/Vapi readiness, and server architecture README to the
  then-current 17-file remote checkpoint and file-18 local Knowledge state. The
  later environment-specific sections supersede that historical checkpoint.
- A consolidated `npm.cmd run check` passed typecheck, full lint, and 530/532
  tests across 37/38 files. The two failures were stale registry tests expecting
  Pinecone to remain unavailable after the Knowledge adapter was registered.
  The focused correction passes 4/4 with targeted ESLint clean; the final rerun
  below resolves this intermediate checkpoint.
- The final consolidated rerun is green: typecheck, full lint, 38/38 test files,
  and 531/531 tests pass. The corrected registry suite is included, as are the
  9/9 Knowledge and 3/3 schema-hardening suites.
- Staging Knowledge migration verification: 18/18 ledger parity; namespace
  table owned by `app_migrator`; 8/8 existing entries backfilled and pending;
  both partial indexes present; Data API roles still lack private-schema usage;
  `app_runtime` select/insert/update with delete denied and direct read passed;
  zero Security Advisor findings; Performance Advisor contains 153 INFO-only
  unused-index notices and no other finding.
- Production build and client-secret audit passed across 49 artifacts.
- GitHub Actions at `ccf6272` passed after the `next typegen` fix.
- Vercel production build for `ccf6272` passed production configuration,
  compilation, TypeScript, static generation, and deployment.
- Production origin returned HTTP 200; staging origin returned HTTP 200.
- No current authenticated browser matrix, remote schema ledger check, provider
  live call, or destructive workflow was performed in this reconciliation.
- A read-only remote schema-ledger check on 2026-08-25 confirmed the five new
  migrations were initially pending in both projects. They are now applied and
  verified in both projects. Production has real data, including 443 calls and
  509 appointments; the approved privacy-state backfill and later Knowledge
  schema backfill were verified after their respective migrations.
- `anon` and `authenticated` have no `USAGE` on the private `app` schema in
  either project. Production `app_runtime` has the intended direct table grants.
- Production's Supabase security advisor currently reports two
  mutable-search-path warnings in `app_test`; these are not live-schema findings
  but remain cleanup debt.
- First production migration-batch verification: 17/17 exact ledger entries at
  that checkpoint; all 10 new
  tables present and owned by `app_migrator`; privacy defaults cover 2/2
  workspaces; call privacy state covers 443/443 calls; both privacy functions
  use `search_path=app, pg_catalog`; and all 11 advisor-hardening indexes exist.
  No secret-like columns were introduced in the new tables. Read-only checks as
  `app_runtime` passed, while `anon` and `authenticated` remain unable to use
  private schema `app`.
- Post-migration advisors returned no live-`app` security or unindexed-FK
  findings. Remaining findings are two known `app_test` mutable-search-path
  WARN notices, eleven `app_test` unindexed-FK INFO notices, and unused-index
  INFO notices. Vercel reported no production runtime errors in the inspected
  one-hour window, and the public sign-in path remained healthy.
- Local dashboard runtime checkpoint (2026-08-25): after confirming the port
  owner was this repository's Next.js process, the unresponsive server was
  restarted. Root redirects to `/sign-in?reason=expired`, that route returns
  HTTP 200, and the visible in-app Browser authenticated the Alex Rivera Owner
  development account and rendered Overview with no fresh console errors. This
  was local-only; no deployment, environment change, provider call, migration,
  or commit occurred.
- Authenticated production owner checkpoint: Overview, Conversations, Calls,
  Appointments, Customers, Analytics, AI Receptionist, Business Profile,
  Connections, and Settings rendered under the expected Owner session. All
  tested platform-admin routes denied access. Owner Privacy was visible; a real
  call drawer exposed AI Summary/Transcript; an own customer drawer opened,
  while a forged Harbour customer id opened no drawer or foreign content.
- Production sign-out returned to `/sign-in`; a protected deep link while
  signed out preserved only the same-origin `/admin/settings` continuation.
  Database evidence kept the user count at 7, confirmed the denied identity had
  zero active memberships, and recorded two sanitized `user.signed_out` audit
  events (audit count 71 -> 73). The browser ended signed out, and the final
  inspected Vercel error window contained no runtime error clusters.
- Two non-security UI/observability defects were handed off without editing
  Claude's UI files: owner access to `/admin/privacy` correctly throws a 403 but
  renders generic "This page couldn't load" and temporarily appears as a
  runtime-error cluster; Auth.js redirects a denied identity with
  `error=AccessDenied`, which the sign-in page currently ignores, leaving no
  explanatory status copy.

## Current priority

1. Production and staging are both at 18/19. File 19 is a local-only,
   forward-only least-privilege hardening migration; executed-schema validation
   and any remote application require a separate explicit approval.
2. Staging Knowledge/Pinecone flow is now live-certified end-to-end through the
   real UI (2026-08-26), on redeployed staging `dpl_5ypffPNJxgW3YNxzeni5Ufjsr63D`
   at commit `0b444ac`. Production remains unconfigured for Pinecone
   (code deployed, no credential/mode set) — no production live certification
   is claimed.
3. Complete the production manager/staff/Harbour-owner/operator matrix only when
   those provisioned Google identities are available in the in-app Browser.
   Owner and no-workspace fail-closed behavior are now live verified.
4. Decide whether to disconnect/remove the duplicate Vercel project. This needs
   explicit approval because it changes external state.
5. Keep generic Preview fail closed; only the `staging` branch has isolated
   Preview secrets.
6. Keep provider live work behind separate explicit phases; n8n remains
   inaccessible and no provider foundation is live-certified merely because the
   code is now deployed.

## Staging Pinecone deployment (2026-08-26)

- Explicit user approval lifted the Vercel mutation/deploy gate for this phase.
  The intended project now has `KNOWLEDGE_PROVIDER_MODE`, `PINECONE_API_KEY`,
  and `PINECONE_INDEX_HOST` as Preview variables scoped only to branch
  `staging`; the API key is stored as Secret and its value is not documented.
- Production and generic Preview were untouched.
- The exact prior staging Preview deployment was redeployed with current project
  settings. New deployment `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN`, source branch
  `staging`, commit `ccf6272`, reached `READY`; the stable staging alias points
  to it.
- Codex did not perform authenticated UI or live Knowledge-flow testing. That
  certification remains assigned to Claude.

## Addendum, Claude, same day — real UI test surfaced a deployment mismatch

Signed in as the real Coastal Bloom owner on `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN`
via genuine Google OAuth (user's own Chrome, already-authenticated account).
Added a clearly-labeled test Knowledge entry through the real UI. It appeared
to succeed but did not persist — confirmed via a fresh reload and a direct
`execute_sql` check (zero new rows). Vercel runtime logs show why:
`POST /business-profile 500` — `null value in column "provider_document_id"
of relation "knowledge_entries" violates not-null constraint`.

**Root cause is a deployment mismatch, not a Pinecone bug.** The Business
Knowledge application code (server actions, repositories, UI) has never
been committed to git — it exists only in the long-uncommitted local
working tree. `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN` is a redeploy of the
existing staging source at commit `ccf6272`, which predates all Knowledge
foundation work. So staging is running old `addKnowledge` code (which never
sets `provider_document_id`) against the new migrated schema (migration 18
added that column's `NOT NULL` constraint). Schema is ahead of code.
Secondary, separate finding: the client shows false success on a request
that actually 500'd — worth its own fix.

Testing the live Pinecone wiring through the real UI needs the Knowledge
feature's *code* deployed to staging too, not just its schema — i.e.
committing/pushing this entire uncommitted working tree. That's materially
bigger than this task; stopped here rather than deciding it unilaterally.
No DB cleanup needed (the failed insert rolled back). Full detail in
`claude-notes.md`.

## Model-provider audit follow-up (2026-08-26)

- Current local AI SDK 6 documentation/source distinguishes
  `NoObjectGeneratedError` for parse/schema-invalid structured output from
  `NoOutputGeneratedError` for missing final output. The provider boundary now
  sanitizes both as retryable `model_invalid_response`.
- Added a regression carrying secret-like generated text and private model
  metadata; neither crosses the normalized error boundary. The focused suite is
  13/13 green; TypeScript and targeted ESLint pass.
- Rechecked the two approved model ids and base prices against the public Gateway
  catalog. No external model request or configuration mutation occurred.

## Codex addendum — Knowledge deployment preflight (2026-08-26)

Claude's real staging UI test remains blocked by schema/code skew: migration 18
requires `provider_document_id`, while READY deployment
`dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN` is built from `ccf6272`, before the local
Knowledge implementation. Codex completed the non-mutating release preflight on
the current combined working tree:

- TypeScript: pass.
- ESLint: pass with no warnings.
- Focused Knowledge release suite: 5/5 files, 47/47 tests.
- Complete suite: 40/40 files, 552/552 tests.
- Next.js production build: pass.
- Client-secret audit: pass across 56 built artifacts; values were not printed.
- `git diff --check`: pass after a whitespace-only Sidebar cleanup.

No remote configuration, database migration, provider traffic, commit, push, or
deployment occurred. Because the releasable state spans a large shared
uncommitted tree rather than an isolated Knowledge patch, committing/pushing and
deploying it remains a separate explicit-approval boundary.

## Provider integrations code-review pass (2026-08-31)

A hand review (no diff to anchor on) of `twilio/`, `vapi/`, `google-calendar/`,
`email/`, `model-provider/`, `n8n/`, `integrations/inbound/`, and
`credential-store.ts`. Most of this scope had already been through several
review rounds in `handoffs/claude-notes.md` (2026-08-24 through 08-26) with no
bugs found; this pass gave the files those rounds hadn't individually named —
`n8n/operations.ts`, `n8n/contract.ts`, `n8n/inbound.ts`, `n8n/client.ts`,
`integrations/inbound/pipeline.ts`, and every `google-calendar/*` file — the
same level of scrutiny.

- **Fixed**: `optionalString()` in `n8n/contract.ts` treated a present-but-
  empty optional field as invalid and rejected the whole envelope, even though
  every one of its callers already falls back to treating empty and absent
  the same (`serviceId ?? null`, `notes ?? ""`, `reason ?? ""`). n8n's own
  payload construction routinely sends `""` rather than omitting a key when
  nothing was captured, so a legitimate booking with no notes taken or no
  service identified could be rejected outright — the same over-validation
  shape as the Knowledge `title` fix above. Now empty/whitespace-only is
  treated as absent; a wrong-typed or oversized value still refuses the
  envelope. Regression tests added to `n8n/contract.test.ts` for every
  affected field (`notes`, `serviceId`, `reason`, `detail`, `operationId`,
  `executionRef` on both the inbound envelope and the outbound result) plus
  the still-refused wrong-type/oversized cases.
- Also simplified a redundant identical-branch ternary in `n8n/client.ts`'s
  simulated-mode `dispatch()` path (no behavior change).
- No other correctness, cross-tenant, sync-guard, or secret-leak issues found
  in this scope after a careful read. `npx next typegen && npm run check`
  (typecheck, lint, 365/365 runnable tests, 194 DB-backed tests skipped — no
  live DB in this sandbox) and `npm run build` (fail-closed production build)
  both green after the fix.
