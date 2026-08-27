# Current Project State

Updated: 2026-08-27

## Repository checkpoint

- Branch: `master`; local `HEAD` is monitoring commit `d1b2d84` plus the
  follow-up proxy allowlist fix. `origin/master` remains `7cad923` because the
  Production-triggering push requires explicit approval for that exact action;
  `origin/staging` remains `64fa59a`.
- `9a5b957` commits the protected Business Knowledge reconciliation operations,
  their tests, current documentation, and whole-run `app_test` advisory lock.
- `42e8bad` updates Nodemailer to 9.0.5; `b91524c` adds the npm override needed
  for strict clean-environment dependency resolution.
- Working tree: the health route, route tests, monitoring documentation, and
  current state updates plus the pre-existing untracked `.claude/worktrees/`.

## Live platform status

- Supabase: **STAGING 19/19; PRODUCTION 19/19**. Knowledge namespace hardening
  is applied and independently verified in both environments.
- Authentication and tenancy: Auth.js is authoritative. Hosted staging OAuth,
  RBAC, and tenant checks are live-verified; cross-tenant leakage remains a
  release blocker.
- Vercel: Production deployment `dpl_Ei7f5WEVuFtko1zFhYoaBNhXRh6N` is READY at
  `4899725`; isolated staging deployment `dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa`
  remains READY at `64fa59a`. The one-hour Production runtime-error scan is
  clean. Generic Preview remains fail-closed. The duplicate
  `ai-receptionist-dashboard-dsarao` project remains approval-gated cleanup debt.
- Google Calendar is historically live-verified. n8n remains application-ready
  but externally inaccessible and not live-certified. Twilio, Vapi, Gmail, and
  the model provider still lack their respective live certification evidence.
- A safe local liveness endpoint now exists. External uptime monitoring, alert
  ownership, error/log collection, restore drill, comprehensive accessibility
  QA, and full operational/privacy certification remain pilot blockers.

## Monitoring and alerting

- Dynamic Node.js `GET`/`HEAD /api/health` is locally implemented and verified
  end-to-end through the production server and authentication proxy.
- It is content-free and no-store, reads no database/provider state, and emits
  only a bounded structured completion log.
- This is deployment liveness only, not database, provider, workflow, tenant, or
  business-semantic health.
- No external uptime monitor, error/log drain, named owner/backup, paging route,
  thresholds, acknowledgement target, escalation path, or controlled alert and
  recovery proof exists yet.

## Business Knowledge and Pinecone

- Isolated staging is live-certified end-to-end for authenticated create,
  scoped Postgres persistence, Pinecone retrieval, delete, tombstone, and
  provider removal.
- Staging uses an isolated integrated-inference index. Production has no
  Pinecone credential and remains fail-closed.
- Provider results are ranking hints only; every id is re-authorized through
  active, non-deleted, workspace-scoped Postgres state.
- Provider success followed by failed local settlement becomes `sync_required`
  and is never batch-replayed. Retryable reconciliation selects only `pending`
  and retryable `error` rows.
- The eight historical staging rows from migration backfill are synchronized.
  Coastal has 5 synced rows total and Harbour has 4; both have 0 pending,
  0 errors, and 0 `sync_required`.
- Provider-free dry runs are complete for both authorized staging workspaces:
  4 eligible Coastal rows and 4 eligible Harbour rows, 0 errors,
  0 `sync_required`, 0 attempted, and a content-free preview audit per workspace.
  Read-only status checks confirmed the backlog remains unchanged. Coastal also
  has 1 previously synchronized row; Harbour has none.

## Reconciliation operations

- The protected server-only DAL and Server Action are committed on `master`.
- Authorization is `business.edit`; tenant and provider scope are derived only
  from server-authorized context.
- Dry run is provider-free. Execute requires exact confirmation, rejects
  disabled mode, and is bounded to 100 retryable rows.
- Status and audit output are content-free and contain only safe counts,
  timestamps, and normalized outcomes.
- The command is not wired into the dashboard or a schedule. Dry-run and one
  explicitly approved bounded execute were invoked against staging only.
- Local CLI wrappers provide fail-closed staging dry-run and read-only status
  checks with expected-project verification, real authorization, bounded limits,
  content-free output, and no path to execute mode.
- Shared CLI guards have 6 passing focused tests for argument parsing, batch
  bounds, direct/pooler project matching, explicit-actor fail-closed behavior,
  active-owner selection, and content-free metadata projection.
- Vitest now holds a bounded session-level advisory lock for the complete run,
  preventing separate processes from rebuilding shared `app_test` concurrently.

## Current verification

- Accepted uncontested gate: **44/44 files; 572/572 tests passed**.
- TypeScript, full lint, production build, and client-secret audit passed.
- Focused health-route verification passed 2/2; the build lists `/api/health`
  as dynamic and the client-secret audit covered 56 artifacts.
- Focused route/proxy regression verification passed 6/6 after adding the
  health path to the narrow public allowlist. Local production GET and HEAD both
  returned 200 with the expected minimal body/body-free response and headers.
- The lock was independently exercised with two overlapping schema-hardening
  runs: both passed 3/3, and the second waited for the first to release ownership.
- Live staging reconciliation: 8/8 attempted and synchronized across two
  authorized workspace batches; 0 adverse outcomes, 0 retryable rows,
  0 `sync_required`, and both completion audits recorded. A cross-workspace
  status probe failed closed before any provider call.

## Next phases

1. With explicit approval, push `master`, verify `/api/health` over Production
   HTTPS, then configure an approved uptime/error
   monitoring system with named owners and controlled failure/recovery evidence.
2. Prepare and execute an isolated restore drill without touching production.
3. Enable Production Pinecone only as a separate approved data-policy,
   credential, cost, monitoring, deployment, and certification phase.
4. Environment changes, Vercel project removal, remote migrations, and provider
   writes remain separately gated.

## Claude addendum — sidebar accessibility fix (2026-08-27)

Unrelated to Knowledge/Pinecone: the collapsed sidebar (the default state)
had no accessible name on any of its 10 nav links — the visible label is
removed from the DOM when collapsed and the wrapping tooltip carries no
aria-label. Fixed with `aria-label={item.label}` on the Link
(`src/components/shell/Sidebar.tsx`), verified via the live accessibility
tree after reload. Typecheck/lint pass. Committed in `d867931` and pushed as an
ancestor of `4899725`. Full detail in `CURRENT_TASK.md` and `handoffs/latest.md`.

Follow-up QA pass (same day, while Codex ran the live execute-mode
reconciliation): checked Conversations, Appointments, Customers (+ detail
dialog), and Settings. All clean — correct accessible names throughout,
no console errors, dialog has proper `role="dialog"` and closes on Escape.
No new issues found; no code changes.

## Claude addendum — reconciliation tooling committed (2026-08-27)

Codex's operator CLI tooling (4 scripts, 6 tests, package commands,
env.ts/pinecone.ts comment corrections) reviewed for secrets (none found)
and verified (typecheck, lint, 6/6 focused tests, client-secret audit all
pass), then committed as `6cd661d` and pushed. Production
`dpl_2rJpPZnT3hgovRHtJVdiV1HXKprk` is READY at that commit. Runtime scan
clean; the one error in a 24h window is old, already-resolved, and tied to
a different deployment. Full detail in `CURRENT_TASK.md`.

## Claude addendum — health endpoint pushed; found SSO gate (2026-08-27)

Pushed Codex's finished health/monitoring work (`d1b2d84`); production READY
at `dpl_3SG5Sm6Hr8sMtHNCustDUKyJe1K4`. Live HTTPS test found every URL this
project has requires Vercel SSO login (`all_except_custom_domains`, no
custom domain configured) — a real platform-level blocker for external
monitoring, not a code defect. No MCP tool can generate the Protection
Bypass secret this needs (dashboard-only). User has no monitor in use
currently, so this stays documented, unresolved by choice, not acted on.
Full detail in `CURRENT_TASK.md`.

The user has since generated the bypass secret and created an UptimeRobot
account. Verified `/api/health` with the bypass header (read from a local
`.env.local` entry, never in chat): both `GET`/`HEAD` return `200 OK` with
the expected body and no-store headers. External monitoring is unblocked.
