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
