# Current Project State

Updated: 2026-08-27

## Repository checkpoint

- Branch: `master`; local and `origin/master` contain merge commit `b24e51c`
  (PR #4, calendar-Undo-sync fix, merged after explicit user approval).
  Recovery-rehearsal commit `87d1db9` and monitoring commits `d1b2d84`/
  `bf8774b` are deployed ancestors;
  `origin/staging` remains `64fa59a`.
- `9a5b957` commits the protected Business Knowledge reconciliation operations,
  their tests, current documentation, and whole-run `app_test` advisory lock.
- `42e8bad` updates Nodemailer to 9.0.5; `b91524c` adds the npm override needed
  for strict clean-environment dependency resolution.
- Working tree: only the pre-existing untracked `.claude/worktrees/` before this
  deployment-evidence documentation update.

## Live platform status

- Supabase: **STAGING 19/19; PRODUCTION 19/19**. Knowledge namespace hardening
  is applied and independently verified in both environments.
- Authentication and tenancy: Auth.js is authoritative. Hosted staging OAuth,
  RBAC, and tenant checks are live-verified; cross-tenant leakage remains a
  release blocker.
- Vercel: Recovery-verifier implementation deployment
  `dpl_6d3RbTTQ8BVPZorSGLY7sLy5SLC9` is READY in Production at `43c7d91`; its
  fresh one-hour runtime-error scan is clean. The live-verified monitoring
  deployment `dpl_DzM2nQB42EGDVccnDdupih8zQf6j` remains READY at `f2d725c`.
  Isolated staging deployment `dpl_8SuiPxLYLawkfkZQu5KNgZQPMkKr`
  is READY at `64fa59a` (redeployed 2026-08-27 to pick up the rotated
  Pinecone key). The one-hour Production runtime-error scan is
  clean. Generic Preview remains fail-closed. The previously-noted duplicate
  `ai-receptionist-dashboard-dsarao` project no longer exists — checked
  `list_projects`/`list_teams` (2026-08-27): only one team and one project
  exist under this account. That cleanup item is resolved/moot.
- Recovery-rehearsal implementation deployment
  `dpl_4J364H4NyKxNZRrmiirmhjyYBSXn` is READY in Production at `87d1db9`, has
  the canonical Production alias, and its fresh one-hour runtime-error scan is
  clean. The added command is operator-invoked and CLI-only.
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
- **Live-verified (2026-08-27):** an UptimeRobot monitor ("AI Receptionist —
  liveness") is active against `/api/health`, checked every 1 minute, with the
  `x-vercel-protection-bypass` header correctly configured — 100% uptime over
  7/30/365 days, confirmed on the live dashboard, not just deployment evidence.
  Alert contact is a single named owner (Dilpreet Singh, email), no delay/no
  repeat. A UI-triggered test notification was sent and independently confirmed
  delivered to the owner's real inbox (`alert@uptimerobot.com` →
  `dsarao5310@gmail.com`): both "TEST: Monitor is DOWN" and, two seconds
  later, "TEST: Monitor is UP" (recovery) arrived as a pair — the alert AND
  recovery delivery channel are both proven working end-to-end.
- **Real controlled drill completed (2026-08-27):** the user set the bypass
  header to an invalid value in UptimeRobot; the monitor genuinely flipped to
  Down and a real (non-TEST) "Monitor is DOWN" email arrived at 19:01:05Z. The
  user then restored the correct secret; the monitor flipped back to Up and a
  real "Monitor is UP" recovery email arrived at 19:02:25Z. Dashboard records
  one closed incident, 1m 20s down. This is genuine down-detection → alert →
  recovery-alert proof, independently confirmed via Gmail, not simulator
  output. This agent did not type the secret at any point — only the
  temporary corruption's *fix* required the real value, which the user
  entered directly.
- **Monitor misconfiguration found and fixed during the drill:** the monitor
  originally accepted `2xx` **and** `3xx` as "Up" and had "Follow redirections"
  enabled — meaning the Vercel SSO gate's 302 redirect (and the 200 login page
  it followed to) would have counted as healthy. This meant the monitor could
  never have detected a real bypass-secret expiry/revocation. Fixed by
  removing `3xx` from accepted status codes and disabling "Follow
  redirections"; the drill only produced a real Down after this fix.
- **Backup channel — deliberately declined (2026-08-27):** attempted adding a
  second notify-only email contact; UptimeRobot requires a purchased seat for
  this (0 of 0 notify-only seats on the current plan), so the invite could not
  be sent and no account changes were made. User decided it's not worth
  paying for on a solo project — single email owner remains the only alert
  channel by choice, not by unfinished work. No error/log drain exists.
- **Separately noted:** the UptimeRobot account is on a "Solo 10" trial (10
  monitors, 60s interval) expiring in ~6 days from 2026-08-27 with
  auto-renewal disabled; it will downgrade to the free plan afterward. User
  chose not to investigate free-plan limits now ("it's working, no need to
  test") — this is informational only, not an action item, unless it becomes
  relevant later.

## Recovery verification

- `npm run db:recovery:rehearse` provides a local-only migration replay in a
  generated disposable schema. It never loads `.env.local`, refuses Production
  and non-loopback hosts, verifies content-free migration/schema invariants, and
  cleans up only its generated schema.
- Seven rehearsal guards and all five restored-target guards pass; typecheck,
  repository lint, and the 51-artifact client-secret audit pass. Missing-URL and
  hosted-target commands blocked before connection. Actual replay remains
  unexecuted because Docker, `psql`, the Supabase CLI, and loopback Postgres are
  unavailable; it would not count as backup restore evidence even if run.
- `npm run db:recovery:verify` is a read-only verifier for a real backup already
  restored into a separate disposable Supabase project.
- Target guards require recovery-only `app_runtime`/`app_migrator` URLs, an exact
  project ref and project-bound confirmation, and refuse the known staging and
  Production refs before database access.
- Evidence is content-free: migration completeness/checksums, required tables,
  composite tenant constraints, role/grant boundaries, and aggregate row counts.
- The verifier performs no create/drop/migrate/seed/provider action. Five target-
  guard tests pass, and the known staging-ref command blocked before connecting.
- True backup restore, restored-target execution, Preview compatibility, and
  operator-confirmed cleanup remain unperformed because no disposable restored
  project or backup-restore tool is available.

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

- Accepted uncontested gate: **45/45 files; 577/577 tests passed**.
- TypeScript, full lint, production build, and client-secret audit passed.
- Focused health-route verification passed 2/2; the build lists `/api/health`
  as dynamic and the client-secret audit covered 56 artifacts.
- Focused route/proxy regression verification passed 6/6 after adding the
  health path to the narrow public allowlist. Local production GET and HEAD both
  returned 200 with the expected minimal body/body-free response and headers.
- Recovery target guards passed 5/5, the known staging ref failed closed before
  database access, and the client-secret audit passed across 56 artifacts.
- The lock was independently exercised with two overlapping schema-hardening
  runs: both passed 3/3, and the second waited for the first to release ownership.
- Live staging reconciliation: 8/8 attempted and synchronized across two
  authorized workspace batches; 0 adverse outcomes, 0 retryable rows,
  0 `sync_required`, and both completion audits recorded. A cross-workspace
  status probe failed closed before any provider call.

## Next phases

1. UptimeRobot monitor, owner, email alert delivery, AND a real controlled
   down/recovery incident are all live-verified (2026-08-27), including a
   real misconfiguration (3xx/redirects counted as "Up") found and fixed
   along the way. Backup/escalation channel beyond one email was considered
   and deliberately declined (paid-seat requirement, not worth it for a solo
   project) — this line item is closed, not pending.
2. Restore a real backup into a separate disposable project, run the new
   read-only verifier, prove application compatibility through an isolated
   Preview, and clean up only after confirming no deployment points at it.
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

QA pass finished on Calls, Analytics, AI Receptionist, Business Profile,
Connections: no console errors, `npm audit` clean (0 vulnerabilities),
toggle switches and form labels all correct. Investigated four
apparently-unlabeled elements and confirmed each is a `read_page` tool
display quirk (multi-span text or placeholder-vs-label), not a real code
defect. No code changes.

## Claude addendum — UptimeRobot monitor completion (2026-08-27)

Logged into the user's existing UptimeRobot account (in-browser, user signed
in themselves) and reviewed the live dashboard rather than relying on prior
deployment-evidence-only claims. Found a working monitor already configured:
"AI Receptionist — liveness" against `/api/health`, 1-minute interval, correct
bypass header, 100% uptime 7/30/365d. Owner is a single email contact
(Dilpreet Singh); no SMS/voice/push, no Slack/Teams/webhook integrations, zero
incidents ever recorded.

Per user's choice among three options, first triggered UptimeRobot's built-in
"Test Notification" (reversible, no-field-edit). Independently confirmed via
Gmail: both a "TEST: Monitor is DOWN" and "TEST: Monitor is UP" arrived as a
pair.

User then asked for the real drill. The auto-mode classifier blocked this
agent from typing into the bypass-header field directly, so the user made
that edit themselves (garbage value, not the real secret entered by this
agent at any point). Result was surprising: the monitor stayed "Up" even
though `curl` independently confirmed the endpoint genuinely returned 302.
Root cause found: the monitor accepted `3xx` as "Up" and had "Follow
redirections" enabled, so it silently followed the Vercel SSO redirect to a
200 login page. Fixed both (plain settings toggles, no secret involved); user
re-saved the bad header, and the monitor correctly went Down — real "Monitor
is DOWN" email at 19:01:05Z. User then restored the real secret; monitor
recovered, real "Monitor is UP" email at 19:02:25Z, one closed incident
(1m 20s down) recorded on the dashboard. Full closed-loop proof, independently
confirmed via Gmail at every step, not simulator output. Full detail in
`CURRENT_TASK.md`.

## Claude addendum — backup alert channel declined, trial-expiry noted (2026-08-27)

Attempted to add `dsarao47@gmail.com` as a second notify-only alert contact
per user request. UptimeRobot requires a purchased seat for any notify-only
contact beyond the account owner (0 of 0 seats on the current plan) — the
invite failed server-side ("Resource not found") and nothing was created or
charged. Presented the cost tradeoff; user decided it's not worth paying for
on a solo project, so the single-email setup stands by deliberate choice.

While checking seat pricing, found the account is on a "Solo 10" trial (10
monitors, 60s interval) expiring in ~6 days with auto-renewal off — it will
downgrade to the free plan afterward. Flagged this to the user; they chose
not to investigate free-plan limits now. Purely informational, not an action
item unless raised again.

## Claude addendum — PR #4 (calendar-Undo fix) merged (2026-08-27)

`fix/undo-calendar-sync` (`e59cc7c`) was first brought up to date with
`master` (`3e00059`), then, after explicit user "ready" approval, merged
into `master` as `b24e51c` (doc-file conflicts only, resolved via
`git checkout --ours`). Re-verified the merged tree: typecheck, lint, full
calendar suite (55/55), production build, and the 56-artifact client-secret
audit all pass. Pushed `origin/master`. Production
`dpl_6Dvm3QuoVuif5ys63WQzDBv9WmvZ` is READY at `b24e51c`; runtime-error scan
found nothing new (3 groups, all tied to older deployments). The
calendar-Undo-sync fix is now live. Full detail in `CURRENT_TASK.md`.

## Claude addendum — housekeeping: stale branches and duplicate Vercel project (2026-08-27)

Duplicate Vercel project `ai-receptionist-dashboard-dsarao`, previously noted
as cleanup debt: no longer exists. `list_projects`/`list_teams` show only one
team and one project under this account. Nothing to remove; the note was
stale.

Branch cleanup: deleted two fully-merged branches (local + remote) —
`knowledge/pinecone-provider-foundation` (PR #2) and `ui/dashboard-reconstruction`
(PR #1) — both confirmed as git ancestors of `master`, so nothing unique was
lost. `knowledge/pinecone-provider-foundation`'s remote ref was already gone
(GitHub auto-delete-on-merge).

Also investigated and deleted `origin/claude/read-markdown-file-7f7r3j`, an
unmerged stray branch (auto-generated Claude Code cloud-session name)
containing an earlier, less-correct draft of the calendar-Undo-sync fix:
skipped slot validation on a plain uncancel, routed uncancel through the
reschedule workflow instead of the booking workflow, and removed the
`knowledge.reconciliation_*` audit-action types still used by the live
Knowledge feature — would have been a regression if ever merged. The actual
shipped fix (`e59cc7c` → `b24e51c`, live on master, 55/55 tests) came from a
different, more refined lineage. Confirmed with the user before deleting.

Left untouched: `fix/undo-calendar-sync` (local+remote) — already merged,
but still checked out in the locked `.claude/worktrees/quizzical-sniffing-waffle`
worktree, which `CLAUDE.md` explicitly protects.

## Claude addendum — Pinecone key rotation, production env vars checked clean (2026-08-27)

Rotated the previously-exposed Pinecone API key end-to-end without this
agent ever handling the raw value: user generated and pasted the new key
(`ai-receptionist-staging-v2`) into `.env.local` and Vercel themselves;
found and redeployed the correct `staging` deployment after the old build
predated the key change (`dpl_8SuiPxLYLawkfkZQu5KNgZQPMkKr`, READY, no new
runtime errors); user deleted the old key from the Pinecone console.

Along the way, investigated two failed `master`-branch redeploy attempts
that looked like a missing-production-env-vars incident. Checked Vercel's
Environment Variables page directly (Production filter): `AUTH_SECRET`,
`AUTH_URL`, `DATABASE_URL`, Google OAuth, etc. are all present, correctly
scoped, untouched since Aug 21. Nothing was actually broken — the failed
redeploys just weren't attached to the Production environment scope, and
the live production deployment was never affected. Full detail in
`CURRENT_TASK.md` and `.claude/providers/knowledge.md`.
