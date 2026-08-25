# Current Project State

Updated: 2026-08-24

## Repository checkpoint

Branch: `ui/dashboard-reconstruction`, HEAD `7cfbf44`. Three UI reconstruction
commits sit above the prior checkpoint, with a substantial unstaged UI diff and
the unstaged Vapi, model-provider, call-privacy, privacy-scheduler, and email
provider foundations. Nothing was committed in this task. Existing Playwright
logs, scratch HTML, settings work, UI work, and Vapi work were preserved.

## Verified systems

- Supabase persistence: **LIVE VERIFIED**
- Auth.js Google OAuth: **LIVE VERIFIED**
- Hosted staging RBAC matrix: **LIVE VERIFIED**
- Cross-tenant authorization: **LIVE VERIFIED**
- Google Calendar: **LIVE VERIFIED**

## Provider status

- Google Calendar: **LIVE VERIFIED**
- n8n: application-side integration/readiness complete; live staging
  certification pending an external n8n instance and configuration.
- Twilio: **BUILT + SIMULATOR VERIFIED**; not live-certified.
- Vapi inbound lifecycle: **APPLICATION-READY + SIMULATOR VERIFIED**; no live
  account, webhook registration, call, tools, or recording persistence.
- Model provider: **APPLICATION-READY + SIMULATOR VERIFIED**; server-only AI
  Gateway path, approved primary/fallback policy, structured reply/analysis,
  deterministic evals, and time/token/cost guards exist. No gateway auth, live
  request, billed usage, latency/failover observation, or Vapi connection.
- Call privacy lifecycle: **APPLICATION-READY + DATABASE/ACTION-TEST VERIFIED**;
  fail-closed recording policy, minimal append-only consent evidence, bounded
  retention, sensitive transcript access, explicit erasure, and expiry purge
  exist locally. Its daily scheduler foundation is disabled by default, bearer
  authenticated when enabled, lease-protected, bounded, and records sanitized
  run history. Explicit erasure now requires a durable request, separately
  recorded identity-check method/actor, verified state, and fresh exact
  destructive confirmation. No automated identity proofing, true
  reauthentication, legal approval, remote migration, configured secret,
  deployment, provider recording ingestion, external monitoring, or live
  certification. Platform operators now have a separate server-rendered,
  read-only `/admin/privacy` health view over sanitized global purge run and
  lease state; it performs no retry or schedule mutation and is not an alert.
- Gmail/email: **APPLICATION-READY + SIMULATOR/DATABASE VERIFIED**; private
  mailbox/thread/message identity, trusted mailbox-to-tenant mapping, normalized
  addresses, shared inbound receipts, outbound operation idempotency, sync-guard
  handling, client-boundary projection, and deterministic simulation exist.
  There is no Gmail OAuth, scope approval, account connection, Pub/Sub/watch
  lifecycle, public provider webhook, live read/send, remote migration,
  deployment, or provider certification.
- Knowledge/Pinecone: **NOT STARTED**

## UI

Premium visual redesign remains complete across the app shell and twelve
feature areas. Settings now includes a server-backed Privacy tab for owners and
platform operators. It exposes recording mode, bounded transcript/recording
retention, consent notice, policy version, and honest scheduler status. Managers
and staff do not receive the policy/tab, and the Server Action independently
requires `privacy.manage`. Staff server payloads continue to redact call
summaries, previews, and transcripts; managers, owners, and operators retain
sensitive access in an authorized workspace.
The same tab now contains an owner/operator erasure-request queue that stores
only call id, constrained internal reference, state, method/reason codes, actors,
timestamps, and aggregate deletion outcomes. It does not store requester
contact data, notes, transcripts, provider payloads, or recording locators.
Client import-closure and generated-artifact audits still keep provider
infrastructure, recording locators, and secrets out of business-facing bundles.
Platform operators can also open the read-only Privacy Operations page from
Admin Settings. It exposes only global scheduler state and aggregate run
telemetry; ordinary workspace roles are rejected before the database read.

## Latest verification

- Consolidated suite: 508/508 tests across 35 files passed.
- Typecheck passed.
- Lint passed.
- Production build passed (26 routes; one server-only privacy cron route and
  one server-rendered platform-operator privacy health route).
- Client-secret audit passed (49 artifacts).
- Email foundation focused gate: 40/40 tests passed, including 10/10 email
  contract, tenant, replay/concurrency, outbound-idempotency, disabled-mode, and
  runtime-grant tests against the rebuilt disposable schema.
- The production build passed after the email foundation and no public email
  route was added. A fresh consolidated suite is not claimed for this phase:
  Claude's separately documented background check rebuilt the same `app_test`
  schema during Codex's full-suite attempts, causing cross-suite missing-table
  errors. The prior 508/508 consolidated result remains historical evidence.
- Scheduler/privacy/configuration focused gate: 27/27 tests passed.
- Privacy-specific policy/database/scheduler/request tests: 12 passed; cron route/auth
  tests: 6 passed.
- Focused policy/request action/input/tab gate: 31/31 tests passed.
- Privacy staging preflight: 5/5 configuration/schema tests passed, including
  read-only inspection against the rebuilt disposable database. An invalid
  target smoke test blocked before connection and printed no values.
- In-app browser verification passed at 1440x900 and 375x812 against the
  isolated `app_test` schema, including dirty/invalid/valid/discard behavior,
  selected-tab visibility, no horizontal overflow, and no fresh console errors.
- The later erasure panel rendered at 1440x900 with minimal completed/rejected
  rows. No destructive transition was submitted. Pending-dialog and
  second-phase mobile rendering remain unclaimed because the browser safety
  policy blocked the stale tab after the disposable schema restarted.
- Browser rendering is not claimed for the new operations-health route because
  the same in-app Browser safety boundary remained in effect and was not
  bypassed.
- Read-only production dependency audit: three existing high entries in the
  Nodemailer/Auth.js chain; neither AI SDK nor Zod is implicated.

The combined still-uncommitted tree includes the preserved UI, Vapi, and model
work plus the privacy foundation and migrations
`20260825012531_call_privacy_lifecycle.sql` and
`20260825015735_privacy_purge_scheduler.sql`, plus
`20260825025737_privacy_erasure_requests.sql`, plus
`20260825044239_email_provider_foundation.sql`. The email migration was rebuilt
successfully by the focused database suite. No remote migration, deployment, provider
configuration, credential, live request/call, staging/production purge,
application-data change, or commit occurred.

## Current priority

The email application foundation is complete locally, alongside the privacy
scheduler, policy UI, erasure-request controls, read-only operator health, and
fail-closed staging preflight foundations. The next email phase requires an
approved Gmail OAuth/scopes/watch design and isolated staging credentials; the
next privacy phases remain external alerting or identity-proofing/
reauthentication and require product, privacy/legal, and operations ownership.
Do not enable
scheduled mode, create/configure its secret, apply migrations remotely, enable
Vapi recording ingestion, connect Gmail, approve legal policy, deploy, or begin
live certification without an explicit phase and the required external prerequisites.

## Addendum — Claude, 2026-08-24, after Codex handoff

Not from Codex; added after Codex finished. Full detail in
`.claude/handoffs/claude-notes.md`.

- Ran live Supabase security/performance advisors against both the
  production (`rkzwubwogtezqbuhieuo`) and staging (`jhkbsfsbnynysplvnwca`)
  projects. Found and **fixed** one real issue: `calls` carried two
  identical unique indexes on `(workspace_id, id)` —
  `calls_workspace_id_id_uq` (already-committed `0010_production_hardening_
  parity.sql`) and a redundant `calls_workspace_id_id_key` added in
  `20260825012531_call_privacy_lifecycle.sql`. Removed the redundant one
  from the uncommitted migration file; confirmed no later migration or code
  referenced it by name.
- Manual code review across the privacy/erasure flow, cron auth, credential
  store, permissions, Vapi/email/model-provider integrations, and a spot
  check of shared UI primitives and calendar/business-profile components —
  no correctness bugs found.
- Verified the index fix with a fully clean, uncontested run once Codex
  confirmed done: `npm run check` (typecheck + lint + **519/519 tests
  across 36 files**), `npm run build`, and the client-secret audit (49
  artifacts) all passed. (Two earlier attempts showed unrelated failures —
  one a schema collision with Codex's own concurrent run, both sides
  documented it independently; one a transient flake against the hosted
  Postgres pooler in a single file, confirmed by rerunning that file alone
  clean. Neither was caused by the fix.)
