# Claude's notes

Running notes from Claude's side of the split described in `codex-handoff.md`.
Does not touch `PROJECT_STATE.md` / `CURRENT_TASK.md` / `handoffs/latest.md` —
those stay Codex's log.

## 2026-08-24 — code review + live Supabase advisor check

### Code review (scoped, not the full diff)

Reviewed the highest-risk new/untracked code by hand (no subagents — hit an
account session rate limit earlier trying the 8-angle parallel approach, and
speed mattered more than exhaustive coverage here):

- Erasure-request flow end-to-end: `src/server/actions/privacy.ts` →
  `src/server/privacy/erasure-requests.ts` →
  `src/server/db/repositories/privacy-erasure-requests.ts` →
  `supabase/migrations/20260825025737_privacy_erasure_requests.sql` →
  `src/features/settings/ErasureRequestsPanel.tsx`.
- `src/server/privacy/cron-auth.ts` (constant-time bearer check).
- `src/server/integrations/credential-store.ts` (the `Secret` redaction class).
- `src/lib/permissions.ts` (platform/workspace permission split).
- `src/server/db/ids.ts`.
- `src/server/integrations/vapi/tenancy.ts` + `inbound.ts` (tenant resolution
  from trusted provider resources, conflict handling).
- `src/server/integrations/email/inbound.ts`.
- `src/server/integrations/model-provider/gateway.ts`.

**No correctness bugs found.** This code is unusually well-guarded — tenant
scoping via `WorkspaceScope`/`AuthContext` (no `getX(id)` without a scope),
permission checks ahead of every mutation, row-level `FOR UPDATE` locks,
state-machine transitions with explicit invalid-state handling, constant-time
secret comparisons, and a `Secret` class that redacts on every serialization
path. Not reviewed: the UI-redesign churn (KPICard/Table/analytics chart
components), Vapi `adapter.ts`, email `client.ts`/`outbound.ts`, and the
model-provider `policy.ts`/`simulator.ts`/`eval-fixtures.ts`.

### Live Supabase advisors (read-only, both projects)

Ran `get_advisors` (security + performance) against `AI Receptionist`
(`rkzwubwogtezqbuhieuo`) and `AI Receptionist Staging`
(`jhkbsfsbnynysplvnwca`). One real, actionable finding:

**Duplicate index on `calls (workspace_id, id)`** — confirmed on both
projects. Two indexes doing the same job:
- `calls_workspace_id_id_uq` — from `0010_production_hardening_parity.sql`
  (already-committed).
- `calls_workspace_id_id_key` — a redundant unique constraint added in
  `20260825012531_call_privacy_lifecycle.sql`, most likely added to give a
  composite foreign key a unique target without checking one already
  existed.

Every write to `calls` now maintains two identical indexes for no benefit.
**Fix**: drop `calls_workspace_id_id_key` (the newer, redundant one) and
confirm nothing added after it in the migration chain depends on that
constraint's specific name rather than the columns it covers. Left this for
Codex/the user to apply — it's a migration file Codex may still be actively
editing, and dropping a constraint needs explicit sign-off per this
project's approval boundaries either way.

Minor/low-severity, not actioned: two functions with mutable `search_path`
(`app_test.create_default_workspace_privacy_policy`,
`app_test.initialize_call_privacy_state` — test schema, low real risk);
several `unindexed_foreign_keys` INFO findings on `privacy_erasure_requests`
FK columns; a long list of `unused_index` INFO findings across most tables,
which is expected noise pre-launch (no real traffic yet) and not worth
acting on now.

## 2026-08-24 — code review round 2

Continued past the initial privacy-focused pass into the remaining new
integrations and a spot-check of shared UI primitives:

- `src/server/integrations/vapi/adapter.ts` — connection/health/capability
  reporting. Fine.
- `src/server/integrations/email/client.ts`, `outbound.ts`, `addresses.ts`,
  `simulator.ts` — outbound send path, idempotent operation wrapper via
  `runWorkflowOperation`, sync-guard fallback on local-write failure. Fine.
- `src/server/integrations/model-provider/index.ts`, `policy.ts`,
  `simulator.ts`, `contracts.ts` — checked one specific risk closely:
  `simulateReply()` calls `request.messages.at(-1)!.text` with a non-null
  assertion. Confirmed safe — `receptionistReplyRequestSchema` in
  `contracts.ts` enforces `messages: z.array(...).min(1).max(24)`, and
  `index.ts` runs `validate(schema, input)` (throws on failure) before
  `simulateReply` is ever called. Not a bug.
  `conservativeActualCostMicroUsd` in `policy.ts` deliberately takes
  `max(primaryRate, fallbackRate)` regardless of which model actually
  answered — an intentional over-estimate for the cost guard, not a defect.
- `src/components/shared/KPICard.tsx`, `src/components/ui/Table.tsx`,
  `src/features/analytics/ConversationTrendChart.tsx` — no issues; KPICard
  and Table both already carry comments documenting bugs they previously
  fixed (label truncation, dead sticky-header styling).

**Still no additional correctness bugs found.** Remaining unreviewed:
existing Twilio integration code (pre-dates this session's work, lower
priority), most other analytics/chart components, business-profile and
calendar feature code, and the full UI-redesign diff against the shared
primitives beyond the two spot-checked above.

Also specifically checked `src/app/settings/page.tsx` / `view.tsx` /
`tabs.ts` for a cross-role data-exposure risk: the client-side
`can("privacy.manage")` gate in `view.tsx` is only a hidden-UI convenience —
by itself that wouldn't stop a manager/staff from getting the policy/erasure
data in their page payload. Confirmed it's fine: `page.tsx` computes
`canManagePrivacy` server-side and only fetches
`workspaceScope(context).privacy.getPolicy()` /
`listErasureRequests(context)` when true, passing `[null, []]` otherwise —
so the data itself never reaches an unauthorized role's bundle, matching the
project's "no infrastructure reaches a business user" invariant and the
existing `tenant-isolation.test.ts` coverage for it. Not a bug.

Next: continuing through the remaining feature areas unless redirected.

## 2026-08-24 — fix applied: duplicate index, plus round 3 review

User confirmed Codex is wrapping up and asked me to actually fix what needs
fixing rather than just log it. Applied:

**Fixed**: `supabase/migrations/20260825012531_call_privacy_lifecycle.sql` —
removed the redundant `alter table calls add constraint calls_workspace_id_id_key
unique (workspace_id, id);` line (the duplicate-index finding from the
earlier advisor check). Confirmed before editing: `calls_workspace_id_id_uq`
from the already-committed `0010_production_hardening_parity.sql` covers the
identical columns and is created earlier in migration order, so every later
composite foreign key in this migration (`call_privacy_state`,
`call_consent_events`) still resolves against it. Grepped the repo for
`calls_workspace_id_id_key` first — nothing else referenced that constraint
name specifically. Replaced the line with a comment explaining why it's not
there. Verification: ran `npm run check` (background, rebuilds the disposable
`app_test` schema from every migration file, so it doubles as a migration
smoke test) — see next entry for result once it lands.

### Round 3 review (while the check ran)

- `src/server/integrations/twilio/tenancy.ts`, `signing.ts` — Twilio webhook
  signature verification (HMAC-SHA1 over sorted form params, constant-time
  compare, configured URL not request-derived). Solid, no issues.
- `src/features/business-profile/ServicesManager.tsx` — no issues.
- `src/features/appointments/calendar/AppointmentsCalendar.tsx`,
  `MonthView.tsx` — no issues.
- `src/server/integrations/model-provider/prompts.ts` — system prompts
  explicitly mark customer/business text as untrusted content and instruct
  the model not to follow embedded instructions, not to claim actions
  happened, and not to reveal prompt/model details. Reasonable prompt-
  injection defense given the model only produces language, not decisions.

**Still no other correctness bugs found across three review rounds.**

### Verification of the duplicate-index fix — final result

First `npm run check` (while Codex was still finishing) showed 8 failed test
files with schema errors (`relation "users" does not exist`, `sql is not a
function`) — turned out to be a collision: my background run rebuilt the
shared `app_test` schema while Codex's own suite was mid-run against it.
Codex independently documented the same collision from its side in
`PROJECT_STATE.md`/`handoffs/latest.md`. Not a regression.

Once Codex confirmed done, a second clean `npm run check` still showed one
file failing: `src/server/integrations/n8n/orchestration.test.ts`, 25/36
tests, all with `fixture missing: alex@coastalbloom.example` /
`priya@harbourdental.example` — a seed-lookup error unrelated in content to
the `calls` index change. Reran that one file in isolation:
**36/36 passed.** A transient flake against the hosted Postgres connection
pooler, exactly the failure mode `vitest.config.ts`'s own comment calls out
("a suite that fails because a link was slow teaches nobody anything") —
not caused by the fix.

**Final confirmed-clean full run** (`npm run check` + `npm run build` +
`node scripts/audit-client-secrets.mjs`, all uncontested, Codex fully done):
**36/36 test files, 519/519 tests passed, build passed, client-secret audit
passed across 49 artifacts.** The duplicate-index fix in
`20260825012531_call_privacy_lifecycle.sql` is verified safe.

## 2026-08-25 — PR #1 merged; CI fix; round 4 review

- Opened, reviewed, and merged
  [PR #1](https://github.com/Dsarao5310/ai-receptionist-dashboard/pull/1)
  (`ui/dashboard-reconstruction` → `master`, commit `5af8fd7`). No branch
  protection existed on this repo, so nothing blocked the merge.
- Two things surfaced on the PR that weren't code problems:
  - **Vercel preview deployments fail** (`AUTH_SECRET`/`AUTH_URL`/
    `DATABASE_URL`/Google OAuth all unset). Confirmed via the Vercel
    project's environment-variable settings (user-provided): every one of
    those is scoped to **Production only**, none to Preview. This branch
    falls under "all unassigned git branches" → Preview → gets nothing.
    Not fixed - needs the user to widen the scope in Vercel's UI with real
    credential values, which isn't something to do on their behalf.
  - **CI's `Repository validation` workflow failed on `npm run typecheck`**
    with `error TS2304: Cannot find name 'LayoutProps'` across 7 layout
    files. Root cause: `.github/workflows/ci.yml` ran `tsc --noEmit`
    directly after `npm ci`, before any build step - but `LayoutProps<...>`
    is a Next.js typed-routes ambient generic that only exists in
    `.next/types/`, generated during a build/dev run. This was the
    **first PR this repo has ever opened**, so the workflow had never
    actually executed before; it would have failed identically on any
    branch's first run. **Fixed**: added `npx next typegen` (Next 15.5+,
    generates just the route type declarations, no full build, no env
    vars needed) as a step right after `npm ci`, before typecheck.
    Verified against a fully removed `.next` directory (matching a fresh
    checkout exactly): `next typegen` then `npm run typecheck` both clean.
    Committed directly to `master` (`ccf6272`) - no branch protection,
    single-file CI-only change, already verified locally. Confirmed by
    watching the resulting `Repository validation` run on GitHub Actions
    to completion: **conclusion = success** (typecheck, lint, tests, and
    the fail-closed build/audit step all passed in CI itself, not just
    locally).
- Round 4 code review (remaining previously-unreviewed files): Twilio
  `inbound.ts`, `messaging.ts`, `phone-numbers.ts`, `client.ts`,
  `adapter.ts`; model-provider `adapter.ts`; email `adapter.ts`. All clean,
  consistent with the pattern in every prior round. `toE164`'s NANP-
  specific country-code-stripping heuristic checked carefully for off-by-
  one errors around the `length > 10` guard - correct. The
  `sendingNumber()` fallback to a single global `TWILIO_PHONE_NUMBER` for
  outbound SMS (which could matter for multi-tenant correctness) is
  pre-existing, documented-as-intentional single-tenant/trial behavior
  (`twilio/adapter.ts`'s own comment confirms it's never treated as
  satisfying inbound-tenancy health), not a defect introduced here.
- **No correctness bugs found across four full review rounds**, beyond the
  one duplicate-index fix (already applied, verified, and now merged).

## 2026-08-26 — live Pinecone adapter (code only, not wired up)

A Pinecone MCP connection became available in this session. Checked it
read-only first (`list-indexes`): the connected account has one unrelated
pre-existing index (`drive1`), nothing provisioned for this project.

Found two **deliberate, unconditional** code-level gates on live Knowledge
mode, not just missing configuration:
- `src/server/integrations/knowledge/client.ts` — the "live" branch is a
  hard `throw` regardless of environment or configuration, with a comment
  explicitly deferring to "a separately approved Pinecone account, index
  policy, embedding model, and data-handling review."
- `src/server/production-config.ts:245-247` — rejects
  `KNOWLEDGE_PROVIDER_MODE=live` in **every** environment the validator
  runs against (staging included, not just production), message: "unavailable
  until Pinecone indexing and data-handling policy are approved."

Treated these as a policy checkpoint someone deliberately left for explicit
human approval, not a technical gap - did not touch either. Built everything
that's safe up to that line instead:

- `src/server/integrations/knowledge/pinecone.ts` (new) — real
  `PineconeKnowledgeProvider` implementing `KnowledgeProviderClient`
  (`upsert`/`remove`/`search`) against `@pinecone-database/pinecone` v8.2.0
  (already an installed dependency, unused until now). Integrated-inference
  index design: one shared index, `content` as the fieldMap text field
  (`${title}\n\n${content}`), per-workspace namespace passed in by the
  caller (already server-issued via migration 18's namespace mapping, not
  invented here). Deletion treats a 404 as success (idempotent). All SDK
  errors normalized to the existing `KnowledgeProviderError` contract via
  `error instanceof PineconeErrors.X` checks — no SDK class name, status
  code, or request id crosses the boundary.
- Verified every method name, request/response shape, and error class
  against the **actually installed** SDK's `.d.ts` files directly (not just
  doc-search output) — caught two real discrepancies this way: the doc
  search's summary said the search response was `{ matches: [...] }`, but
  the installed v8.2.0 type is `{ result: { hits: [...] } }` with `_id`/
  `_score` (not `id`/`score`); and error classes aren't top-level named
  exports, they're under an `Errors` namespace export.
- `src/server/integrations/credential-store.ts` — added a `pinecone`/
  `api_key` entry (`env:PINECONE_API_KEY`), following the exact pattern
  already used for n8n/twilio/vapi/model_provider. No value configured
  anywhere; this only makes the reference resolvable once one exists.
- `src/server/env.ts` — added `pineconeIndexHost` (reads
  `PINECONE_INDEX_HOST`; not a secret, targeting by host is Pinecone's own
  recommended production pattern over targeting by name).
- `src/server/integrations/knowledge/pinecone.test.ts` (new) — 9 tests
  against a fake `Index` (namespace targeting, record shape, idempotent
  delete, response mapping, missing-field defaulting, error normalization
  for auth/connection/argument failures). No live Pinecone call anywhere in
  this session. 9/9 pass; typecheck clean; targeted ESLint over the four
  changed/new files also clean.

**Not done, deliberately**: `client.ts` still throws unconditionally on
"live"; `production-config.ts` still rejects it in every environment; no
Pinecone index/credential/account exists for this project; `PineconeKnowledgeProvider`
is not imported or constructed anywhere the running app reaches. Asked the
user directly whether to lift those two gates - this note will be updated
with their answer and whatever follows.

### User approved proceeding - gates lifted, staging index created

**Note:** while this was in progress, `PROJECT_STATE.md` changed on disk
from a source other than this session (referenced "Claude... changing
Pinecone dependencies" — i.e. Codex is aware of / working alongside this).
Held off on further edits to `PROJECT_STATE.md`/`CURRENT_TASK.md`/
`handoffs/latest.md` beyond the one addendum already in place before that
notification arrived; logging here only until it's clear it's safe again.

- Created a real Pinecone index via the connected account (confirmed via
  `list-indexes` beforehand that only one unrelated pre-existing index,
  `drive1`, existed): `ai-receptionist-knowledge-staging`, `aws us-east-1`,
  integrated inference, `llama-text-embed-v2`, `fieldMap: { text: "content" }`
  — matches the adapter exactly. User chose the model and naming via an
  explicit question, not assumed. Index host:
  `ai-receptionist-knowledge-staging-0b2bbjx.svc.aped-4627-b74a.pinecone.io`
  (not a secret).
- Wired `client.ts`: replaced the unconditional "live" throw with a real
  construction path — `createPineconeKnowledgeProvider(apiKey, indexHost)`
  when both `credentialStore.resolve("pinecone","api_key")` and
  `serverEnv.pineconeIndexHost` are present, still throwing
  `knowledge_live_unavailable` otherwise. Exactly the same fail-closed
  shape every other provider (Vapi, Twilio, model provider) already uses —
  no special-casing.
- Changed `production-config.ts`'s knowledge-live check from an
  unconditional rejection to requiring `PINECONE_API_KEY` +
  `PINECONE_INDEX_HOST`, matching the Vapi/model-provider pattern exactly.
  Left the existing generic Preview-restricted-to-`staging`-branch check
  untouched — it already covers `knowledgeProviderMode` by name, so
  Preview branches other than `staging` are still blocked automatically.
  Production stays blocked in practice: no production Pinecone credential
  exists, and creating one is a separate, later decision - not a special
  case written into the code.
- Updated the one test (`production-config.test.ts`) that asserted the old
  unconditional-rejection message to assert the new config-requirement
  behavior instead (mirrors the existing Vapi/model-provider test shape:
  incomplete-config case + a fully-configured passing case).
- Documented `KNOWLEDGE_PROVIDER_MODE`/`PINECONE_API_KEY`/
  `PINECONE_INDEX_HOST` in `.env.example` (was entirely undocumented before
  — the mode existed in code but had no example entry since live was never
  reachable).
- Verification: typecheck clean; `production-config.test.ts` (13/13,
  including the two new/changed cases) and `pinecone.test.ts` (9/9) pass;
  targeted ESLint over every changed file clean. Full consolidated
  `npm run check` kicked off separately to confirm nothing else in the
  suite assumed the old unconditional-rejection behavior.

**Still not done**: no `PINECONE_API_KEY` exists anywhere (local or
remote) - live mode still can't actually activate until the user adds one.
No Vercel environment variable was touched (staging Preview doesn't have
`KNOWLEDGE_PROVIDER_MODE`/`PINECONE_API_KEY`/`PINECONE_INDEX_HOST` set).
No production Pinecone credential/index exists, and production's
`KNOWLEDGE_PROVIDER_MODE` isn't being changed from `disabled` as part of
this. Nothing has made a real Pinecone API call from the application yet.

Full consolidated `npm run check` after the wiring change: **40/40 test
files, 552/552 tests, typecheck and lint all pass.** Confirms nothing
elsewhere in the suite assumed the old unconditional-rejection behavior.

### Real end-to-end UI test on staging — surfaced a genuine, unrelated bug

Codex added the three Pinecone Preview variables (branch `staging` only)
and redeployed; new deployment `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN` reached
`READY`. Signed in as the real Coastal Bloom owner via Google OAuth (using
the user's actual Chrome, an already-authenticated account - no credential
entered by me), opened Business Profile → Knowledge, and added a clearly-
labeled test entry ("TEST — Pinecone live sync verification (safe to
delete)") through the real UI.

The UI showed it succeed and appear in the list. **It didn't actually
persist.** A fresh page reload showed only the 4 original seed entries;
confirmed directly against the staging database (`execute_sql`) - zero
matching rows, only the 8 pre-existing seed rows in the whole table.

Checked Vercel runtime logs for the staging deployment and found the real
cause:

```
POST /business-profile 500
null value in column "provider_document_id" of relation "knowledge_entries"
violates not-null constraint
```

**This is not a bug in the Pinecone adapter, and not caused by anything
done today.** The current `src/server/db/repositories/knowledge-sync.ts`
in this working tree correctly sets `provider_document_id = id` on insert
(line 42) — but that file, and the entire Business Knowledge application
code (server actions, UI, repository), **has never been committed to git**.
It exists only in this long-uncommitted local working tree. Deployment
`dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN` was a *redeploy of the existing staging
Preview source at commit `ccf6272`* (to pick up the new env vars) - `ccf6272`
predates all Knowledge foundation work entirely. So staging is running old
`addKnowledge` code against the new migrated schema (migration 18 added the
`NOT NULL` constraint on `provider_document_id`), and the old code doesn't
populate that column at all. Schema is ahead of code on staging.

Secondary finding, also real: the client showed a false success (dialog
closed, entry appeared to save) on a request that actually returned 500.
Worth its own fix, separately from the schema/code mismatch.

**Consequence for verifying live Pinecone**: cannot be genuinely tested
through the real app UI until the Knowledge feature's *code* is deployed to
staging too, not just its schema. That means committing and pushing this
entire uncommitted working tree (large, spans many files, not reviewed by
this session) - a materially bigger decision than what this task was.
Stopped here rather than deciding that unilaterally; told the user.

No cleanup needed in the database - the insert failed inside a transaction,
so nothing was left behind. The isolated Pinecone smoke test from earlier
(bypassing the DB layer entirely) remains the only confirmed-working
live-Pinecone evidence so far.

### Live end-to-end smoke test — PASSED

User added `KNOWLEDGE_PROVIDER_MODE=live`, `PINECONE_API_KEY`, and
`PINECONE_INDEX_HOST` to their own local `.env.local` directly (confirmed
presence only via a redacted grep, never read/printed the values).

Wrote a throwaway script (`scripts/_pinecone-smoke-test.ts`, deleted
immediately after use, never committed) that called the real
`createKnowledgeProviderClient()` against a dedicated test namespace
(`smoke_test_do_not_use_for_real_tenants`, never a real tenant namespace):
upsert a test document → wait for indexing → search by text → confirm
found → remove → wait → search again → confirm gone.

**All steps passed against the real staging index** — this is a genuine,
live, end-to-end round trip through Pinecone's integrated embedding and
vector search, not a mock. One implementation note for future scripts in
this codebase: modules with `import "server-only"` (e.g. `env.ts`,
`credential-store.ts`) throw when loaded outside Next's RSC bundling
context unless the `react-server` module-resolution condition is active;
needed `NODE_OPTIONS='--conditions=react-server'` for `tsx` to load them
directly. `scripts/privacy-preflight.ts` avoids this by never importing
anything that uses `server-only`.

**Current real state**: staging Pinecone index exists and is proven
working from a local dev environment pointed at it directly. Nothing was
deployed - Vercel's staging Preview branch still has no
`KNOWLEDGE_PROVIDER_MODE`/`PINECONE_API_KEY`/`PINECONE_INDEX_HOST` set, so
the deployed staging app still runs in whatever mode it already had.
Production is completely untouched. No knowledge entry created through the
real application UI/database flow has been synced live yet - only the
provider client in isolation, bypassing the DB-backed sync service
(`operations.ts`) entirely.

## 2026-08-26 — independent review while Codex owns the deployment-mismatch decision

User asked me to keep working on something separate rather than wait idle.
Stayed clear of Knowledge/Pinecone (Codex's now) and every UI file (the
other active Claude session's lane). Two rounds:

**Round 1** - fresh Supabase advisors (both projects) plus every
previously-unreviewed API route handler:
- Staging security advisor: zero findings. Production: only the same two
  pre-existing `app_test` warnings, nothing new from recent migrations.
- `/api/admin/calendar/authorize` + `/callback`, `/api/internal/twilio/sms`
  + `/status`, `/api/internal/n8n/events`, `/api/auth/[...nextauth]`, and
  the shared `readBoundedBody` utility every webhook depends on - all
  clean. Calendar OAuth callback correctly re-derives workspace from the
  signed state row (never a query param) and re-checks authorization
  against that exact workspace. Webhook routes check signatures before
  touching the body and return uniform, information-free failures.
  `readBoundedBody` correctly treats the actual stream byte count as
  authoritative over a possibly-lying `Content-Length` header.

**Round 2** - the auth/authorization core (`policy.ts`, `guards.ts`,
`identity-flow.ts`, `config.ts`) and essentially the full database
repository layer (`base.ts` and every `WorkspaceScopedRepository`
subclass: appointments, calls, conversations, customers, workspaces,
notifications, integrations, settings, activity, messaging,
orchestration):
- Every single query in every repository is scoped by `workspace_id =
  ${this.ws}`, with no exceptions found. `findByContact`,
  `findByProviderEvent`, and similar cross-reference lookups are all
  explicitly scoped, matching their own doc comments.
- Auth core: every protected path funnels through `authorizeWorkspace`;
  a `workspaceId` from a client is only ever a *request*, never proof.
  Cookie-based workspace selection fails closed on a stale/tampered value
  without granting anything either way.
- `orchestration.ts`'s idempotency claim (`insert ... on conflict do
  nothing` + read-back) is genuinely race-free - no check-then-act window
  for the atomic reservation mechanism the whole platform depends on.
- One minor, non-exploitable observation, not reported as a finding:
  `identity-flow.ts`'s `resolveSignInUser` would reject even a legitimate
  platform operator sign-in in the fully degenerate case of zero
  workspaces existing anywhere in the system - the doc comment implies
  operators always succeed, but the code relies on
  `listAuthorizedWorkspaces` returning at least one row. Not practically
  reachable (the system always has real workspaces) and not worth a fix.

**No new correctness or security bugs found in either round.**

## 2026-08-26 — real bug found: Undo on cancel/reschedule never touches the calendar

`src/server/actions/appointments.ts` `restoreAppointmentAction` → repository
`restore()` (`src/server/db/repositories/appointments.ts:141`) is a pure DB
`update` — no call into `requestAppointmentReschedule`,
`requestAppointmentCancellation`, or `commitWithSyncGuard`.

The "Undo" toast action is offered unconditionally after every successful
cancel/reschedule (`src/features/appointments/AppointmentDrawer.tsx:113-116,
138-141`), regardless of whether that cancel/reschedule actually moved a real
calendar event. `cancelAppointmentAction`/`rescheduleAppointmentAction` do go
through `commitWithSyncGuard` and the real calendar workflow on the way out —
but `restoreAppointmentAction` on the way back does not.

**Effect on a workspace with a live calendar integration**: cancel an
appointment → the real calendar event is deleted → click Undo → the DB row
flips back to "confirmed" but the calendar event is never recreated. Same
shape for reschedule-undo: DB reverts to the old time, calendar stays at the
new time. Dashboard and calendar go out of sync silently — no error, no
audit event, no `sync_required` marker (that machinery is bypassed entirely,
not triggered-and-failed).

Not previously flagged anywhere in `.claude/`. Not touching Knowledge/Pinecone
(Codex's lane) or UI files, so leaving it documented here rather than fixing
it — this is a booking-engine correctness fix, which is an approval-boundary
item per CLAUDE.md ("redesign or simplify the production-proven
booking/reservation engine" needs explicit approval), not something to patch
unilaterally mid-review.
