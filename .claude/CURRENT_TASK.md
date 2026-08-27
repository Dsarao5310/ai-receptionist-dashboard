# Current Task

Phase: **Recovery verification foundation**

Status: **LOCAL MIGRATION REPLAY + READ-ONLY RESTORE VERIFIERS READY — TRUE BACKUP RESTORE STILL BLOCKED — 2026-08-27**

## Authoritative checkpoint

- Local and `origin/master` contain merge commit `b24e51c` (PR #4,
  calendar-Undo-sync fix, merged into master). Recovery-rehearsal commit
  `87d1db9` and the health route/proxy fix `d1b2d84`/`bf8774b` remain
  ancestors.
  `origin/staging` remains isolated at `64fa59a`.
- The pre-existing untracked `.claude/worktrees/` is not part of the task and
  must remain untouched.
- Claude's concurrent `7cad923` coordination change is understood and does not
  overlap this route or documentation work.

## Completed locally

- Added public `GET` and `HEAD /api/health` deployment liveness.
- The route is forced dynamic on the Node.js runtime and returns no-store
  browser/CDN headers so a cached success cannot conceal an outage.
- `GET` returns only `{ "status": "ok" }`; `HEAD` is body-free.
- The route reads no database, provider, tenant, environment, or customer data.
- Its structured completion log is content-free and excludes query strings and
  authorization headers.
- Added operator guidance in `docs/monitoring-readiness.md` and
  `docs/operations-runbook.md`.
- Added `/api/health` to the proxy's narrow public allowlist. Auth.js and all
  business routes remain protected; the liveness route alone is reachable by an
  unauthenticated uptime probe.

## Verification

- Focused route tests: **2/2 passed**.
- Full repository gate: typecheck and full lint passed; **44/44 test files and
  572/572 tests passed** under the whole-run Postgres advisory lock.
- Production Next.js build passed and lists `/api/health` as a dynamic route.
- Client-secret audit passed across **56 artifacts** without printing values.
- Focused health/proxy regression gate passed **6/6** after runtime verification
  found and corrected the original sign-in redirect.
- The rebuilt production server was exercised locally through the real proxy:
  GET and HEAD returned 200, GET returned only `{ "status": "ok" }`, HEAD had
  no body, and all no-store/nosniff headers were present.
- Recovery target guards passed **5/5**. The complete post-change gate passed
  typecheck, full lint, **45/45 test files and 577/577 tests**, plus the
  56-artifact client-secret audit.
- Local rehearsal guards passed **7/7**. Typecheck and repository lint passed;
  lint now ignores separate `.claude/worktrees/` checkouts and their generated
  artifacts. The combined recovery guard suite passed **12/12**, the current
  client-secret audit passed across **51 artifacts**, and both missing-URL and
  hosted-target commands failed closed before database access.

## Runtime boundary and next action

Recovery-verifier implementation deployment
`dpl_6d3RbTTQ8BVPZorSGLY7sLy5SLC9` is READY in Production at `43c7d91` and
serves the intended Production aliases. The fresh one-hour Vercel runtime-error
scan found no errors. This deploy evidence does not claim that a backup restore
or restored-target verification was performed.

Local-rehearsal implementation deployment
`dpl_4J364H4NyKxNZRrmiirmhjyYBSXn` is READY in Production at `87d1db9`, has the
canonical Production alias, and its fresh one-hour Vercel runtime-error scan is
clean. The deployed command is CLI-only and does not change application runtime
behavior unless an operator explicitly invokes it with a loopback database.

Production deployment `dpl_DzM2nQB42EGDVccnDdupih8zQf6j` is READY at
`f2d725c`. GET and HEAD were live-verified with the Vercel automation bypass and
returned the expected 200 responses and no-store headers. The bypass value was
read locally and was not printed or committed.

The UptimeRobot monitor is now fully live-verified (2026-08-27), including a
real controlled drill: "AI Receptionist — liveness" checks `/api/health`
every minute with the correct bypass header, single named email owner. A
UI-triggered test notification confirmed both alert templates deliver. A
genuine down/recovery drill then found and fixed a real monitor
misconfiguration (see below) and produced a real closed incident (1m 20s
down, real DOWN email at 19:01:05Z, real UP email at 19:02:25Z). Still open:
no SMS/voice/push or third-party integration as a backup channel. No error
tracker or log/trace drain has been configured.

The local migration-replay rehearsal command is implemented but could not be
executed because this environment has no loopback Postgres instance. It must not
be represented as a provider-managed backup restore. The next material recovery
step is still a real backup restored into a separate disposable Supabase
project, which remains externally gated and unavailable here.

## Claude — real restore drill blocked on plan tier, not project choice (2026-08-27)

User asked to run the real backup-restore drill against the existing staging
project instead of a new disposable one. Before touching anything: checked
`ACTIVE_WORK.md` (Codex idle, no collision), confirmed the `restore_project`
MCP tool only accepts a `project_id` (in-place restore of that exact
project's own backup, not "restore into a different project" — so it would
have overwritten staging's current data with no way to pick a restore point).

Checked the org via `get_organization`: plan is **free**. Cross-checked
against Supabase's own docs (`search_docs`): automated daily backups, and
therefore the restore feature, are Pro/Team/Enterprise-only — free-tier
projects are explicitly not restorable until upgraded. This applies to any
project in this org, staging or a new one; it was never actually a
staging-vs-disposable-project question.

Presented three options; user chose to upgrade the Supabase org to Pro
themselves, and asked to batch it with other pending provider upgrades
(n8n, Twilio, Vapi) and let this agent know when ready to proceed with all
of them together. No Supabase action was taken. **Paused, waiting on the
user** — not an open task to pick up proactively next session; resume only
when the user confirms the upgrade(s) are done.

## Recovery verification foundation

- Added `npm run db:recovery:rehearse`, which accepts only a dedicated loopback
  Postgres URL and never loads `.env.local`.
- It refuses Production mode and all non-loopback hosts, creates a unique
  `recovery_rehearsal_*` schema, replays every source migration, verifies the
  ledger/checksums, required tables, and composite tenant foreign keys, then
  drops only that generated schema in `finally`.
- This command is a source-reproducibility check, not backup-restore evidence.
  It remains unexecuted because Docker, `psql`, the Supabase CLI, and a loopback
  Postgres instance are unavailable in this environment.

- Added `npm run db:recovery:verify` for a real backup already restored into a
  separate disposable Supabase project.
- It requires recovery-only runtime/migrator URLs, an exact expected project ref,
  and the project-bound phrase `VERIFY DISPOSABLE RESTORE <ref>`.
- It refuses the known staging and Production refs before opening a connection.
- Every database inspection runs in a read-only transaction and reports only
  migration totals/drift, schema-object and composite-constraint counts,
  role/grant booleans, and aggregate restored-row counts.
- It never creates, drops, migrates, seeds, exposes secret values, or calls a
  provider. The known staging-ref command was exercised and blocked before any
  database connection.
- No Docker, local Postgres, disposable restored project, or Supabase backup
  restore API/tool is available in this environment, so the actual restore drill
  and Preview compatibility proof remain unperformed.

## Claude — pushed health endpoint, found it's SSO-gated, restore drill next (2026-08-27)

Reviewed Codex's finished health-endpoint/monitoring work (no secrets, typecheck/
lint/tests/build/audit already verified per Codex's own docs), pushed `d1b2d84`,
confirmed production `dpl_3SG5Sm6Hr8sMtHNCustDUKyJe1K4` is READY.

Tested `/api/health` over live HTTPS (the one remaining verification step) and
found a real platform-level blocker, not a code bug: Vercel deployment
protection (`ssoProtection.enabled=true`, `all_except_custom_domains`) gates
every URL this project has — there is no custom domain, so every `.vercel.app`
alias requires Vercel SSO login. An external uptime monitor cannot pass that
gate, so `/api/health`'s own code is correctly public but currently
unreachable by anything outside an authenticated Vercel session.

No available Vercel MCP tool can generate the "Protection Bypass for
Automation" secret (dashboard-only). Presented the user three options
(bypass secret / custom domain / leave gated); the user has no external
uptime monitor in use right now, so this stays a documented fact, not an
active blocker — nothing was changed. No production security settings were
modified.

Next: proceeding to the user-approved isolated Supabase restore drill.

## Claude — external monitoring unblocked (2026-08-27)

User generated the Vercel "Protection Bypass for Automation" secret and
created an UptimeRobot account. Verified `/api/health` end-to-end with the
bypass header (read from a local `.env.local` entry the user added, never
typed into chat): both `GET` and `HEAD` return `200 OK` with the correct
no-store headers and the expected `{"status":"ok"}` body. External
monitoring is no longer blocked — up to the user to finish configuring the
UptimeRobot monitor itself (interval, alert contacts) if not already done.

## Claude — QA pass finished on remaining pages (2026-08-27)

Completed the accessibility/console QA pass: Calls, Analytics, AI
Receptionist, Business Profile, Connections. No console errors on any page.
`npm audit` rechecked clean (0 vulnerabilities).

AI Receptionist page: toggle switches use proper `role="switch"` with
descriptive accessible names (e.g. "Voice channel — Phone calls answered by
your receptionist"), textarea properly labeled. No issues.

Investigated several apparently-unlabeled elements (KPI card drill-through
links on Analytics, the setup checklist buttons on Business Profile, the
capability jump-links on Connections, the business-name input showing its
placeholder instead of its label in the accessibility snapshot). Verified
each against source: all have correct, real text content or a properly
`htmlFor`/`id`-linked `<label>` — no code defects. This is a consistent
`read_page`/`find` tool display limitation for multi-span or
placeholder-vs-label accessible names, confirmed across four separate
instances, not an application bug. No fixes needed on this pass; no code
changes.

## Claude — brought unmerged PR #4 (calendar-Undo fix) up to date (2026-08-27)

Unrelated to Knowledge/Pinecone/monitoring: `fix/undo-calendar-sync` (the
Undo-never-touches-the-calendar fix, `e59cc7c`) had sat unmerged since
diverging from `797f4b3`, well behind current `master`. Used the existing
worktree already checked out on that branch, merged current `master` into
it — no code conflicts, only the three accumulating doc files, resolved by
keeping master's content and re-recording the fix's own write-up rather than
the branch's stale intermediate history.

Re-verified the fix against the updated tree: typecheck clean, lint clean,
the full calendar test suite (55/55, including the fix's own undo-of-cancel/
undo-of-reschedule regressions) passed twice, production build clean (after
clearing a stale `.next` cache in that worktree, which briefly looked like a
false failure — confirmed not a regression). Two full-suite runs got killed
mid-run by something external (same pattern seen earlier this session, not
caused by this change); relying on the targeted calendar-suite pass plus
static checks instead of retrying further.

Pushed the updated branch (`3e00059`, fast-forward, no history rewritten).
At that point still not merged — the merge decision itself was gated behind
explicit approval per `CLAUDE.md`.

## Claude — PR #4 (calendar-Undo fix) merged into master (2026-08-27)

User gave explicit "ready" approval for the merge. Merged
`fix/undo-calendar-sync` into `master` in the branch's existing worktree
(`git merge fix/undo-calendar-sync --no-edit`, run by the user directly
after the auto-mode classifier blocked me from running it). Only the three
accumulating doc files conflicted (no code conflicts), resolved with
`git checkout --ours` since master's side already held the complete,
current write-up. Merge commit `b24e51c`.

Re-verified the fully merged tree before pushing: typecheck clean, lint
clean, the full calendar test suite 55/55 passed again, production build
clean, and the client-secret audit passed across 56 artifacts. Pushed
`origin/master` (`8c8f9bc..b24e51c`).

Production deployment `dpl_6Dvm3QuoVuif5ys63WQzDBv9WmvZ` is READY at
`b24e51c` with the canonical Production aliases attached. A runtime-error
scan afterward found 3 error groups, all tied to older deployments
(`dpl_H6qiAb4cso2qcupiacXcrWJHpsw1`, `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN`), not
this merge — no new errors from the merge deploy. The calendar-Undo-sync fix
is now live on `master`.

## Claude — UptimeRobot monitor completion (2026-08-27)

User asked to close out the UptimeRobot item. Logged into the user's own
UptimeRobot account (browser session, user signed in) instead of relying on
prior "account exists, unverified" documentation, and found the monitor was
already further along than the docs claimed: "AI Receptionist — liveness"
against `/api/health`, checked every 1 minute, `x-vercel-protection-bypass`
header correctly present, 100% uptime over 7/30/365 days — confirmed live on
the dashboard.

Reviewed Integrations & Team: single owner (Dilpreet Singh, email only, no
delay/no repeat), no SMS/voice/push, no Slack/Teams/webhook integrations
connected — no backup or escalation channel exists beyond one email address.
Incidents page showed zero incidents ever recorded, meaning the alert
pipeline had never actually fired.

Presented three options for closing that gap; user first chose the safe
one — clicking UptimeRobot's built-in "Test Notification" rather than
editing the live bypass-secret header (which would have required retyping
the secret, something this agent does not do). Clicked it, then
independently verified real delivery via Gmail search: found both the DOWN
email (`alert@uptimerobot.com` → `dsarao5310@gmail.com`, "TEST: Monitor is
DOWN: AI Receptionist — liveness") and, two seconds later, the matching
"TEST: Monitor is UP" recovery email, timestamps matching the click.

## Claude — real UptimeRobot down/recovery drill (2026-08-27)

User asked to run the real drill next. Plan: this agent would corrupt the
bypass header (garbage value, not the real secret) to force a genuine
failure, then the user would restore the real secret since this agent does
not type tokens/secrets into fields.

The auto-mode classifier blocked even the corruption step (typing into a
field adjacent to a stored credential) — reasonable caution — so the user
made that edit directly. Waited 3 minutes; the monitor unexpectedly stayed
"Up". Independently verified via `curl` (with no header, and with the exact
garbage value now saved) that the live endpoint genuinely returns `302`
either way — the SSO gate itself is working correctly, so the false
positive was in UptimeRobot's own config, not the drill setup.

Root cause, found by reading the monitor's Advanced settings: "Up HTTP
status codes" was set to `2xx` **and** `3xx`, and "Follow redirections" was
enabled — so UptimeRobot silently followed the SSO gate's redirect to the
login page (`200`) and counted that as healthy. This is a real,
previously-undiscovered gap: as configured, this monitor could never have
detected a real bypass-secret expiry or revocation in production. Fixed both
settings (plain UI toggles, no secret involved) and saved.

User re-saved the still-bad header value under the corrected config; the
monitor correctly flipped to Down within the next check cycle. Verified via
Gmail: real (non-`TEST:`) "Monitor is DOWN: AI Receptionist — liveness" at
19:01:05Z. User then restored the real secret and saved; monitor recovered.
Verified via Gmail: real "Monitor is UP: AI Receptionist — liveness" at
19:02:25Z. Dashboard shows one closed incident, 1m 20s down, across 24h/7d/
30d/365d stats.

This is genuine, independently-confirmed down-detection → alert →
recovery-alert proof — not a manual test-send, not simulator output. This
agent never typed the bypass secret at any point; both the corruption and
the restoration were done by the user directly.

## Claude — backup alert channel declined, trial-expiry noted (2026-08-27)

User asked to add a backup alert channel and provided a second email
(`dsarao47@gmail.com`). Attempted adding it as a notify-only contact via
UptimeRobot's Team Members > Invite flow (role "Notify-only (without
login)", no account access). The invite failed: "Unable to invite user —
Resource you were trying to access is not found." Checked Team Members
directly: "Currently using 0 of 0 notify-only seats" — this requires a
purchased seat on this plan, it is not a free feature. No invite was sent,
no account or billing change occurred.

Presented the cost tradeoff to the user; they decided it's not worth paying
for on a solo project. The single-email alert contact remains by deliberate
choice — this closes the backup-channel item, it is not left open.

Separately, while checking seat/billing pages, found the account is running
a "Solo 10" trial (10 monitors, 60-second interval) that expires in ~6 days
with auto-renewal disabled; it will silently downgrade to the free plan
afterward (exact free-tier limits not checked — did not go further into
checkout). Flagged this to the user; they said it's working and declined
further investigation for now. Purely informational for future reference,
not an action item.

## Claude — Pinecone API key rotated end-to-end (2026-08-27)

Rotated the Pinecone key that had been accidentally exposed in chat earlier
in this project. Split the work so the raw key value never passed through
chat or this agent: user generated the new key in the Pinecone console
(labeled `ai-receptionist-staging-v2`) and pasted it into `.env.local` and
Vercel's `PINECONE_API_KEY` (Preview, scoped to `staging` only) themselves.

Verified locally: `PINECONE_API_KEY`/`PINECONE_INDEX_HOST` confirmed
non-empty in `.env.local` without printing values; typecheck clean.

Found the currently-live staging deployment (`dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa`,
commit `64fa59a`) predated the key change — Vercel bakes env vars in at build
time, so the new value wouldn't apply until a fresh build. Located the
correct deployment (confirmed by matching commit/branch, not by row position
in the list — an earlier attempt navigated to the wrong deployment) and
redeployed it: new deployment `dpl_8SuiPxLYLawkfkZQu5KNgZQPMkKr` is READY,
correctly aliased, no new runtime errors.

Side investigation: two stray redeploy attempts on the `master`/production
deployment (not staging) had failed — one CANCELED, one ERROR citing missing
`AUTH_SECRET`/`AUTH_URL`/`DATABASE_URL`/Google OAuth vars. Checked the actual
Vercel Environment Variables page directly: all production vars are present,
correctly scoped, last updated Aug 21 — untouched. The failed redeploys
simply weren't attached to the Production environment scope; the live
production deployment was never affected. No fix needed, documenting so this
isn't re-investigated as a mystery later.

Confirmed the old exposed key deleted from the Pinecone console (three keys
existed: two unrelated "Claude"-labeled MCP integration keys plus the app
key; user identified and deleted the correct one themselves after I
declined to guess). Full detail in `.claude/providers/knowledge.md`.

## Claude — housekeeping pass (2026-08-27)

User asked for general housekeeping. Duplicate Vercel project
(`ai-receptionist-dashboard-dsarao`, previously flagged as cleanup debt) no
longer exists — `list_projects`/`list_teams` show only one team/project;
the doc note was stale.

Branch cleanup: deleted two branches (local+remote) confirmed as full git
ancestors of `master` — `knowledge/pinecone-provider-foundation` and
`ui/dashboard-reconstruction`. Investigated an unmerged stray branch
(`origin/claude/read-markdown-file-7f7r3j`, an auto-named Claude Code
cloud-session branch) before touching it: its version of the calendar-Undo
fix was an earlier, less-correct draft (no slot check on plain uncancel,
wrong workflow routing, and it would have dropped the
`knowledge.reconciliation_*` audit-action types still in active use) —
superseded by the actual shipped fix already live on master. Confirmed with
the user, then deleted it.

Left `fix/undo-calendar-sync` alone (local+remote) — already merged, but
still checked out in the locked `.claude/worktrees/quizzical-sniffing-waffle`
worktree, which is explicitly protected in `CLAUDE.md`. Final branch state:
`master`, `staging`, `fix/undo-calendar-sync` only.
