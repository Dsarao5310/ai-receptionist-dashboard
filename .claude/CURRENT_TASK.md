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

## Claude — Production Pinecone groundwork (dimensions 2/3/8 only) (2026-08-27)

User asked to enable Production Pinecone. Walked through all 8 readiness
dimensions from `docs/knowledge-provider-readiness.md`. Settled data policy
(1) as low-risk-by-design with the user: Knowledge is business-authored
FAQ/policy content, no residency requirement, no erasure commitment written
yet (pre-launch).

Before touching credential/index/deploy work, found something that changed
scope: nothing in the live app currently calls Pinecone search —
`receptionist-simulator.ts` uses a plain in-memory `findKnowledge` lookup,
not Pinecone, and no dashboard page or Server Action calls
`KnowledgeSyncService.search()` outside tests. Flagged this; user chose to
do the free/reversible groundwork (2/3/8) but explicitly hold off actually
flipping `KNOWLEDGE_PROVIDER_MODE=live` (6) and re-running certification (7)
until there's a real reason to, since going live today would sync writes to
an external index with zero functional payoff.

Created a separate, isolated production Pinecone index via browser
(`ai-receptionist-knowledge-production` — the Pinecone MCP tool's own API
key had started failing mid-session, unrelated to the app; used the console
directly instead, which needs no credential). Mirrored staging exactly: AWS,
us-east-1, Dense, On-demand, dimension 1024, integrated `llama-text-embed-v2`.

Caught a real misconfiguration before it became a problem: the console's
quickstart flow defaults the field map to `text`, but this app's code (and
staging's actual index) uses `content` — corrected it before finishing.
Retrieved the full index host
(`ai-receptionist-knowledge-production-0b2bbjx.svc.aped-4627-b74a.pinecone.io`)
via a clipboard-intercept JS snippet since the console UI truncates it with
no way to select the full string.

Wrote the rollback procedure into `docs/knowledge-provider-readiness.md`:
flipping `KNOWLEDGE_PROVIDER_MODE` back + redeploy, no data-loss risk since
writes already degrade gracefully when disabled — but flagged that
`.search()` explicitly throws rather than falling back silently, which needs
handling before search ever ships to a real feature.

Remaining for the user: generate the production `PINECONE_API_KEY` in the
Pinecone console themselves and enter it into Vercel's Production
environment scope (never through chat), same as the earlier rotation. I have
the index host value ready to hand over (not a secret). `KNOWLEDGE_PROVIDER_MODE`
stays unset in Production — not flipped to `live` — until there's an actual
consumer of search or an explicit decision to go live anyway.

## Claude — session reconciliation after diverging from master unnoticed (2026-08-31)

A separate cloud Claude session (`claude/launch-terminal-q0czdf`, its own
task branch, forked from `master` at `797f4b3`) had been working for several
hours believing it was current, because its embedded `CLAUDE.md` snapshot
predated `7cad923`/`c509644` (the `ACTIVE_WORK.md` board and the mandatory-
startup step to read it) — so it never checked in and never saw how far
`master` had moved. Discovered only when the user pointed out Codex was
working in parallel and asked for a full reconciliation.

**What that session had actually done, independently and in parallel with
everything above:**
- Ran a fresh `npm run check` and confirmed the tree it started from was
  green (redundant with work already recorded above, no new information).
- A code-review pass over `src/server/integrations/knowledge/` found and
  fixed two real bugs, still valid and not done elsewhere: `knowledgeMatchesSchema`
  required a non-empty `title`, but the Pinecone adapter can legitimately
  return an empty one, so one malformed match failed an entire search instead
  of being ignored (only `id`/`score` are read off a raw match downstream —
  title/content are always rehydrated from the local record). Fixed by
  dropping the `title` field's min-length requirement to match `content`'s.
  Also: `KnowledgeSyncRepository.ensureNamespace()` always paid an
  insert+select round trip even though a workspace's namespace is immutable
  after first provisioning — changed to check first.
- A review pass over the other provider integrations found and fixed one
  more real bug, still valid: `optionalString()` in `n8n/contract.ts`
  conflated "empty string" with "wrong type"/"too long", rejecting an
  entire inbound envelope or outbound result whenever an optional field
  (`notes`, `serviceId`, `reason`, etc.) arrived as `""` rather than absent —
  which is exactly how n8n's own payloads represent "nothing captured".
  Fixed so empty/whitespace-only is treated as absent; a wrong-typed or
  oversized value still refuses the envelope.
- A review pass over the repository/actions layer found no new bug, but
  removed confirmed-dead code: `ConfigurationRepository.addKnowledge/
  updateKnowledge/removeKnowledge` had no remaining caller anywhere in
  `src/server` (live Knowledge writes route entirely through
  `knowledge-sync.ts` instead) — deleted.
- Found and fixed a real ordering bug in `MessagingRepository
  .applyDeliveryStatus`: no guard against an out-of-order Twilio status
  callback (unlike its siblings in `vapi-calls.ts`/`call-privacy.ts`).
  Investigated whether it needed a migration first — it does not: Twilio's
  status callback carries no event timestamp at all, only a status string,
  so a timestamp column would need data that doesn't exist. The correct
  guard is a terminal-state check (`delivered`/`undelivered`/`failed` are
  sinks Twilio never transitions out of), mirroring
  `VapiCallRepository.applyCallUpdate`'s existing terminal-state guard
  instead of its timestamp one. Updated the caller (`twilio/inbound.ts`) to
  treat a guarded/stale callback as accepted-but-unchanged and skip the
  operator notification for it, and added a DB-backed regression test.
- Independently rediscovered and fixed the same Undo/calendar-sync gap
  already fixed and merged as PR #4 (`e59cc7c`→`b24e51c`, recorded above) —
  duplicate, inferior work (reused the `appointment.reschedule` operation
  for both undo-cancel and undo-reschedule rather than the already-existing,
  purpose-built `appointment.book`/`createExecutor` path PR #4 uses, and had
  no hosted-DB test). **Discarded in favor of the already-shipped fix** —
  see reconciliation below.
- Also produced a large stack of now-superseded doc-sync commits (reconciling
  `PROJECT_STATE.md`/`README.md`/readiness docs against a `ccf6272`→PR#2
  checkpoint that predates essentially everything in this file) and,
  independently, ran into and correctly stopped on a real migration-19
  checksum-drift finding — already understood and resolved above
  (`364e30a`) before that session noticed it; it was told this and did not
  proceed to "fix" it itself.

**Reconciliation performed:** fetched `origin/master`, confirmed via direct
file diffs that only `appointments.ts`/`workflows.ts`/`types/identity.ts`
overlapped with anything master had also touched, and that the other four
fixed files (`knowledge/contracts.ts`, `knowledge-sync.ts`'s
`ensureNamespace`, `n8n/contract.ts`, `configuration.ts`,
`messaging.ts`/`twilio/inbound.ts`) were byte-identical to that session's
starting point on `master` — i.e. genuinely still unfixed there, not
independently fixed by anyone else in the interim. Merged `origin/master`
into the task branch; resolved the `appointments.ts` conflict by taking
master's version entirely (superior, already deployed); took master's
version of the doc files superseded above; kept the four still-valid code
fixes (Knowledge title/namespace, n8n `optionalString`, dead-code removal,
Twilio ordering guard) plus their tests and the `.gitignore` addition.
Verification and push recorded next, once complete.

**Process gap, not a content gap:** every individual fix that session made
was independently re-verified against the current file content before being
kept, and none of it happened to be technically wrong — but it ran for
hours without the coordination check `ACTIVE_WORK.md`/current `CLAUDE.md`
require, which is what let the duplicate Undo work happen at all. Filed as
its own note in `handoffs/latest.md`.

## Claude — Twilio/Vapi live certification investigated, paused per user cost policy (2026-08-31)

User directed three priorities in order: (1) wire real Knowledge/Pinecone
search into the live AI receptionist flow, (2) live Twilio/Vapi
certification, (3) the backup-restore drill. Started on (1); found
`receptionist-simulator.ts` is an explicit UI-preview stand-in ("when a
real AI backend is connected this module is the single thing that gets
replaced"), and this app has no live conversation-AI integration at all —
Vapi webhooks only handle post-call events (`status-update`,
`end-of-call-report`), no live tool-calling endpoint exists. So (1)
actually depends on (2) — there's no live assistant to wire search into
yet. User agreed to do (2) first.

Investigated (2)'s real state: production's `integration_records` claim
Twilio/Vapi are "configured" for both demo workspaces, but the data behind
it is fake seed data — a fictional `+1 (604) 555-0142` number shared
identically across both workspaces and both providers, `provider_sid` null,
and `vapi_assistants` completely empty. Confirmed via direct SQL, not
assumed. Real setup is a from-scratch task: buy a Twilio number, connect an
existing Vapi assistant, configure webhooks, set five env vars
(`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER`/
`VAPI_API_KEY`/`VAPI_WEBHOOK_BEARER_TOKEN`), and write real values into
`provider_phone_numbers`/`vapi_assistants` for one workspace. User confirmed:
target workspace is Coastal Bloom, a Vapi assistant already exists, a
Twilio number still needs to be purchased.

**This runs into the same standing instruction already on record above
("real restore drill blocked on plan tier" entry, 2026-08-27): the user
batched Supabase Pro upgrade + n8n + Twilio + Vapi together and said to
wait until all of it is ready, not just Twilio/Vapi in isolation. Explicitly
re-confirmed by the user just now in this session after this agent started
laying out Twilio/Vapi setup steps unprompted — a reminder that this was
already paused, not a new decision. No session should do anything that
costs money or nudges toward spending it on any of these four until the
user says the batch is ready.** Also flagged in `ACTIVE_WORK.md`, which is
more visible day-to-day but gets overwritten each cycle; this entry plus
the 2026-08-27 one above are the durable record.

Pivoting to no-cost prep for (1)/(2): building the Vapi function-calling
webhook endpoint Knowledge search will need once a live assistant exists,
matching Vapi's documented tool-call contract, code+tests only — stays
unverified live until the user unblocks the costly step.

## Claude — UI/frontend review pass, optimistic-write rollback bug fixed (2026-09-01)

Breadth-first correctness/accessibility review of `src/app/` (excluding
`api/`), `src/components/`, and `src/features/` — the frontend layer had been
deliberately left untouched during today's earlier backend-focused review
passes. Checked specifically for the failure modes named in
`.claude/rules/frontend.md`/`.claude/rules/design-system.md`: non-functional
controls, dishonest "server-resolved" labels, accessible-name regressions on
icon-only controls (the class of bug already fixed in `Sidebar.tsx`), nav
route-matching bypassing `isNavItemActive`/`findNavItem`, `KPICard`/`Table`/
density-token/grid-breakpoint violations, cross-tenant display bugs, and
ordinary hook/state correctness bugs.

Most of the surface held up — nav matching, KPI grid breakpoints, table
density tokens, dialog/drawer titles and focus, pagination/filter
page-reset logic, and the admin "Your access" role label (which does read
live from the verified session, per its own inline comment) were all
already correct.

**Found and fixed:** `src/lib/store/workspace-stores.tsx` —
`setInternalNotes` and `setFeatureFlag` (used by `/admin/settings`) applied
their optimistic write immediately but, unlike every other mutator in the
same file (`commitConfiguration`/`commitKnowledge`, documented there as
"apply locally, ask the server, roll back on refusal"), never rolled back
on a refused server action. Concretely: `AdminSettingsView`'s "Internal
notes" `SaveBar` derives its `dirty` flag
from `notesDraft !== workspace.internalNotes`; because the optimistic write
already set `workspace.internalNotes` to the attempted value before the
server responded, a refusal left the SaveBar hidden (nothing to save) at
the same moment the failure toast said the save didn't happen — and the
stale, never-persisted value stayed on screen until an unrelated refresh.
Feature flags had the same gap without a visible symptom (no dirty-state
UI on the `Switch`), but the same silent-desync risk. Fixed both to capture
the previous value inside the state updater and restore it when the server
action returns `ok: false`, matching the established pattern exactly.

No test file exists for this store (`src/lib/store/` has no `.test.*`
siblings), so none was added, per this task's scope.

Verification: `npx next typegen && npm run check` — typecheck, lint, and
`vitest run` all passed (41 test files / 396 tests passed, 5 files / 199
DB-backed tests skipped as expected, no live DB here). `package-lock.json`
was untouched by `npm run check` (nothing to restore).

## Claude — shared business-logic/utility review pass, no bug found (2026-09-01)

Final un-reviewed layer after today's backend and UI passes: `src/lib/`
(`buckets.ts`, `business-format.ts`, `date-range.ts`, `filter-params.ts`,
`kpi-format.ts`, `permissions.ts`, `safe-redirect.ts`, `timezone.ts`,
`use-account-summary.ts`, `use-unsaved-changes.ts`, `utils.ts`,
`validation.ts`, `workspace-data.tsx`, and `src/lib/store/` excluding
`workspace-stores.tsx`) and all of `src/services/` including
`adapters/` (excluding `receptionist-simulator.ts`, already read and
confirmed a UI-preview stand-in). Read `.claude/rules/database.md` and
`.claude/rules/tenancy-auth.md` first per the task's own instruction.

Traced `scheduling.ts`'s slot-validity chain (`checkBusinessTime`,
`checkTemporal`, `checkRescheduleSlot`, `getValidStartTimes`,
`getNearbyStartTimes`) specifically for the temporal-validity/business-hours-
fit/real-capacity conflation `database.md` calls out, for split-shift and
special-hours interval boundary math, and for duration-fit (start+duration,
not just start, against a single interval) — all correctly separated and
covered by `scheduling.test.ts`'s 47 cases, including a DST-transition
property test. Checked `timezone.ts`/`provider-time.ts` for DST and
day-boundary correctness (`wallClockToInstant`'s two-pass offset
resolution, `addZonedDays` holding wall-clock time steady, `zonedDayKey`)
against `timezone.test.ts`'s and `timezone-scenarios.test.ts`'s transition-
sweep tests — no gap found. Checked `permissions.ts`'s role table for an
unexplained asymmetry — `PLATFORM_ONLY`/workspace tables are disjoint by
construction and every grant traces to a stated reason in the file's own
comments; nothing looked like a mistake. Checked `safe-redirect.ts` against
known open-redirect bypasses (protocol-relative, backslash-as-slash,
control-char, encoded variants) — the existing backslash/control-char
regex plus URL-based origin check correctly rejects all of them, matching
`safe-redirect.test.ts`. Checked the mock adapters
(`services/adapters/mock/*`) against the real adapter contract in
`services/adapters/types.ts` — all route through the same
`createMockAdapter`/`instantFromProvider` boundary, no divergent shortcut
found.

One rare, low-severity, non-actionable observation (not fixed, not
flagged as a defect): `buckets.ts`'s intraday ("Today") bucketing steps in
fixed 4-hour blocks from `bounds.start`, so a business-timezone day with a
fall-back DST transition (25 real hours) yields 7 buckets instead of the
usual 6, capturing the repeated hour as its own short bucket rather than
losing it — arguably correct (no data loss or double-count), just an
undocumented deviation from the "6 buckets" assumption `date-range.test.ts`
only exercises on a non-transition day. Not touched: this is a rare
(twice-yearly, one specific chart, one specific day) display-shape question,
not a correctness defect, and the task's own instruction is to flag rather
than fix anything in the timezone/business-hours space without full
confidence in the right behavior.

No other real bug, security gap, or drift from `database.md`/
`tenancy-auth.md` found. No fix made — nothing to commit. Verification:
`npx next typegen` clean, `npm run typecheck` clean, `npm run lint` clean,
targeted `vitest run src/lib src/services` — **191/191 tests passed**
across all 10 test files in the reviewed scope (full `npm run check` not
re-run since no code changed; typecheck/lint/targeted-tests already confirm
the reviewed layer is green, and the last full-suite run recorded above was
already clean).

## Claude — Vercel Preview-build noise stopped at the source (2026-09-01)

User asked to check Gmail for Vercel emails. `get_thread` on the growing
"Failed preview deployment" thread (`1a0558498899ce0f`, 34 messages, Aug 31
01:52 → Sep 1 01:03) confirmed every message is the same generic failure
for the real `ai-receptionist-dashboard` project, one per push to this task
branch — expected, since Preview secrets are branch-scoped to
`master`/`staging` only (`docs/staging-foundation.md`), so any other
branch's Preview build has always failed by design. Separately checked
"Failed production deployment" emails: both threads are Aug 24-27, before
the duplicate-Vercel-project cleanup, one of them literally for the old
deleted `ai-receptionist-dashboard-dsarao` project; nothing since Aug 27 —
production has deployed clean the whole time. No live-project incident.

User asked to stop it at the source. Added `ignoreCommand` to `vercel.json`:

```json
"ignoreCommand": "if [ \"$VERCEL_GIT_COMMIT_REF\" = \"master\" ] || [ \"$VERCEL_GIT_COMMIT_REF\" = \"staging\" ]; then exit 1; else exit 0; fi"
```

Per Vercel's documented `ignoreCommand` contract (exit 0 = skip build,
exit 1 = continue), this skips every branch except `master`/`staging`,
which keep building normally. Verified the JSON still parses and manually
ran the exact shell logic for all three cases (task branch → skip,
`master` → build, `staging` → build) before committing. Also fixed
`docs/staging-foundation.md`'s stale "Preview branch tracking: enabled for
all non-production branches" line to describe the new gate.

Scope note: this only takes effect for builds on commits carrying this
file. It stops future failed Preview builds on this branch (`claude/
launch-terminal-q0czdf`) as soon as it's pushed. It does **not** yet apply
to other in-flight branches (e.g. any Codex branch) or change how
`master`/`staging` behave — for the rule to apply platform-wide it needs to
reach `master`, which still requires the user's own literal push command
per the standing auto-mode-classifier pattern recorded earlier in this
file. No app code changed; nothing to typecheck/lint/test beyond the JSON
syntax check.

## Claude — Gmail cleanup, the second half of the Vercel-noise fix (2026-09-01)

User asked to do both previously-offered mitigations, not just the
vercel.json fix above. Checked this session's Gmail MCP toolset for a
filter/rule-creation tool before doing anything — there isn't one; only
label create/apply and archive/trash/spam tools are exposed (no Gmail
Filters API equivalent). So a true "auto-archive all future matching
mail forever" rule isn't buildable through these tools.

Did the closest available equivalent: created a Gmail label
(`Vercel/Preview-Build-Noise`) and applied it to the 34-message Preview-
failure thread (`1a0558498899ce0f`) and the two old, already-resolved
Production-failure threads (`1a03fab09453e9fc`, `1a037854384f10a1`), then
removed `INBOX`/`UNREAD` from all three (archived + marked read). Per the
`label_thread` tool's own documentation, the label applies to "any future
messages added to it," and Gmail has been auto-grouping every new Vercel
notification for this project into the same long-running thread ID for
days — so as long as that grouping continues, new arrivals should pick up
the label; whether they also get silently re-archived rather than
reappearing in the inbox is standard Gmail behavior for a thread that
gets a new message, not something these tools control or guarantee.
Told the user this plainly rather than claiming a persistent filter was
created. Also functionally moot for this branch going forward since the
vercel.json fix above stops the emails from being generated in the first
place once it's live.

No code or doc file changed for this half (pure Gmail mailbox actions,
nothing in the repo) beyond this entry.

User then gave the literal push command themselves
(`git push origin claude/launch-terminal-q0czdf:master`), satisfying the
auto-mode classifier. Pushed: `origin/master` fast-forwarded
`99b8164`→`847be16`, carrying both the `vercel.json` fix and its docs.
Production deployment `dpl_B7DnP5ssbzoxzeMdxzqRs6NYWKrN` started building
immediately (`VERCEL_GIT_COMMIT_REF=master` correctly continues the build
under the new `ignoreCommand`, not skips it). The `ignoreCommand` rule is
now live platform-wide: any future push to a branch other than
`master`/`staging` (this session's, Codex's, or anyone else's) will no
longer trigger a failed Preview build.

## Claude — dependency hygiene + HTTP-boundary review pass, no bug found (2026-09-01)

User asked for any other legitimate no-cost work, explicitly excluding the
paused Supabase/n8n/Twilio/Vapi batch. Two pieces:

**Dependency hygiene.** `npm audit` (with and without `--omit=dev`): 0
vulnerabilities. `npm outdated`: nothing security-relevant behind; a
handful of packages have major versions available (`next` 16.3.4, `ai`
7.x, `typescript` 7.x, `vitest` 4.x, `eslint` 10.x, `next-auth` — note the
"latest" 4.24.15 shown by npm is actually *older* than this repo's
installed `5.0.0-beta.32`, an artifact of how npm resolves a pre-release
current version against a stable "latest" dist-tag, not a real available
upgrade). Not touched — a major-version bump is real upgrade work with
regression risk, out of scope for opportunistic no-cost cleanup and not
something to do unprompted.

**Live dev-server check.** This session's own docs had flagged that the
app has never actually been driven in a browser this session, only
verified statically (typecheck/lint/tests/build). Booted `npm run dev`
(Turbopack) locally: starts clean in ~2.4s, `/sign-in` returns 200 with
correct title/content, no console or server errors. Confirmed this
sandbox has no `DATABASE_URL`/`AUTH_SECRET`/etc. anywhere (not in
`.env.local` — none exists — nor in the shell environment), so this is as
far as browser verification can go here: anything past the sign-in page
needs a real database this environment doesn't have, matching the same
constraint already documented all session for the DB-backed test suite.
Attempted a raw POST to exercise a "development account" sign-in button
directly; inconclusive by design (a plain curl POST doesn't reproduce
Next.js's Server Action wire protocol), and not worth engineering further
just to rediscover the already-known no-DB limitation.

**HTTP-boundary review.** The prior five review passes this session
covered the shared provider/integration *logic* (`src/server/
integrations/`) but not, as a distinct target, the thin Next.js route
handlers that sit in front of it — the actual internet-facing surface.
Read all of them against `.claude/rules/security.md`: `POST /api/
internal/twilio/sms`, `POST /api/internal/twilio/status`, `POST /api/
internal/n8n/events`, `POST /api/internal/vapi/events`, `GET /api/admin/
calendar/authorize`, `GET /api/admin/calendar/callback`, `GET /api/
internal/cron/privacy-purge`, the NextAuth catch-all, and `src/proxy.ts`.

Every route: rejects a missing signature/authorization header before
reading the body, reads the raw body exactly once (no re-serialization
that would break a signature computed over the original bytes), returns
uniform no-detail failure for auth rejections (permanent vs. transient
correctly distinguished — `422`/`403` vs `503` — so a legitimate sender's
retry logic behaves correctly), and resolves tenancy only from a trusted
server-side mapping, never a client-supplied id. The calendar OAuth
callback re-verifies `integrations.manage` against the *state row's*
workspace, not the session's currently-selected one, and never echoes a
token into a URL or page. The cron route's bearer-secret check
(`verifyCronAuthorization`) uses SHA-256 + `timingSafeEqual`, already
constant-time. `proxy.ts` is correctly optimistic-only (cookie presence
gates a redirect, never authorization) with no admin path added to its
public allowlist. No bug, no security gap, nothing to fix.

Verification: read-only pass, no code changed. `npm audit`/`npm outdated`
output captured above; dev-server boot and `/sign-in` response inspected
directly (200, correct HTML, no error markers in response or server log).

## Claude — stale hosted app_test schema found on production (investigation only) (2026-09-01)

User asked to keep doing more no-cost maintenance. Three more pieces:

**TODO/FIXME/XXX sweep**: `grep -rn "TODO|FIXME|XXX|HACK:" src/` — zero
matches. Nothing forgotten.

**Clean production build**: `npx next typegen && npm run build` — exit 0,
compiled in 15.9s, all 26 routes correctly dynamic, zero warnings
anywhere in the full build log (checked, not just the tail).

**Supabase advisor refresh (read-only), with a real finding.** Security
advisor: staging 0 findings; production 2 WARN
(`function_search_path_mutable` on `app_test.create_default_workspace_
privacy_policy`/`app_test.initialize_call_privacy_state`). Performance
advisor: staging 152 findings, production 145 — every single one INFO-
level (`unused_index` on fresh data, expected per `staging-foundation.md`)
**except** 11 `unindexed_foreign_keys` INFO items on production, all on
`app_test.email_messages`/`email_threads`/`privacy_erasure_requests`.

Didn't take either finding at face value — traced both to ground truth
with direct read-only SQL (`pg_constraint`, `pg_indexes`,
`app.schema_migrations` vs `app_test.schema_migrations`) rather than
assuming the advisor's framing:

- The missing indexes and the two mutable-search-path functions both
  come from one migration, `20260825151957_provider_privacy_advisor_
  hardening.sql` — applied to production's `app` schema (Aug 25, checksum
  `b39a49b990226412`) but **never applied to production's `app_test`
  schema at all**.
- Pulling the *full* `app` vs `app_test` migration-ledger diff on
  production showed this isn't an isolated gap: production's hosted
  `app_test` has only 3 of 19 migrations recorded (`call_privacy_
  lifecycle`, `privacy_purge_scheduler`, `privacy_erasure_requests`, all
  applied at the same instant, 2026-08-25 05:28:29 UTC) and even those
  3 have **checksum mismatches** against `app`'s current ledger. All 16
  foundational migrations (0001-0011 plus vapi/email/knowledge) were
  never applied to production's `app_test` at all.
- Checked staging's `app_test` for comparison: **zero** migrations
  applied there — fully empty schema.

**Read as a whole, this is not a live risk, and not something to fix by
migrating `app_test` forward.** `app_test` is the disposable, test-shaped
schema (`database.md`) that the DB-backed test harness tears down and
fully rebuilds (`db:reset` + `db:migrate`) at the start of every real
hosted-DB test run — staging's empty schema is exactly what that pattern
looks like at rest between runs. Production's partial 3-migration remnant
with mismatched checksums is leftover debris from one interrupted or
early test run on Aug 25, sitting unused since; it holds no real tenant
data and nothing in the running application reads or writes it. The
correct fix if it's ever used again is the same `db:reset`+`db:migrate`
cycle that already self-heals this — not a manual migration bridge, and
not something this sandbox can even attempt (no `MIGRATION_DATABASE_URL`
here).

**The one optional, genuinely actionable item**: production's stale
`app_test` schema is the literal source of the 2 security-advisor WARN
findings (the only non-clean security findings across both projects).
Dropping it (`DROP SCHEMA app_test CASCADE` on the production project)
would clear that advisor noise for free, since it's explicitly disposable
test-only data covered by `db:reset`'s own drop-and-recreate semantics —
but this agent did not do it unprompted: it's a mutating action against a
live hosted database project, however low-stakes the target, and that
warrants asking first rather than assuming. Left exactly as found; no
schema was created, dropped, or altered. Only read-only SQL
(`select`/`pg_constraint`/`pg_indexes` introspection) was run.

Verification: entirely read-only investigation, zero writes to any
database. `npm run build`/`next typegen` output captured above.

## Claude — runtime/log health check clean, test-coverage angle abandoned (2026-09-01)

User asked to keep going, without yet answering whether to drop
production's stale `app_test` (left open — see entry above, still
untouched).

**Vercel production runtime errors (7-day window, the max lookback):**
3 error groups, all already-known history — same deployment IDs
(`dpl_H6qiAb4cso2qcupiacXcrWJHpsw1`, `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN`)
already investigated and dismissed as non-issues in this file's
2026-08-27 entry. The one Postgres constraint error
(`provider_document_id` NOT NULL violation) was thrown by the old
`ConfigurationRepository.addKnowledge`, which no longer exists — deleted
as dead code in the 2026-08-31 reconciliation entry above. **Zero new
runtime errors since Aug 27** — 5 clean days, a genuine positive
confirmation, not a new problem.

**Supabase log check (24h window, the max per call) on both projects:**
Both clean. Production's only non-routine `postgres_logs` entry in the
window was one `relation "integration_records" does not exist` error —
traced via `log_attributes.parsed.query`/`parsed.date` to a raw
`execute_sql` MCP call from **2026-08-31T23:42:15Z**, an ad-hoc query
missing the `app.` schema prefix. This is the exact first (failed)
attempt behind this file's own 2026-08-31 "Twilio/Vapi live certification
investigated" entry, which then re-ran the query correctly qualified and
got its answer — a self-inflicted, already-superseded exploratory-query
slip from a previous session, not an application bug. Staging's only
non-routine entry was a single "Connection reset by peer" — routine
client-disconnect noise. Nothing actionable in either.

**Test-coverage gap sweep — attempted, abandoned as unreliable.** Started
by diffing `src/server/{db/repositories,actions}/*.ts` against `.test.ts`
siblings by filename; that produced a long "NO TEST" list, but checking
the actual test layout (`find src/server -name "*.test.ts"`) showed this
codebase groups tests thematically (`tenant-isolation.test.ts`,
`schema-hardening.test.ts`, `knowledge.test.ts` covering several
`knowledge/*` source files, etc.), not 1:1 by filename — so the filename
diff was mostly false positives, not a real signal. No `vitest --coverage`
config exists to get a reliable answer instead, and standing one up now
would be scope creep that wouldn't even mean much here: the tests that
would matter most for this question are DB-backed and skip in this
sandbox regardless (no live DB). Dropped rather than report a misleading
list.

Verification: `get_runtime_errors`/`query_logs` are both read-only. No
code or database change from this entry.

## Claude — secret-scan confirmation + missing global security headers fixed (2026-09-01)

User asked to keep going. Two pieces:

**Secret-scan confirmation across all of git history**, directly relevant
given this project's earlier real key-exposure incident (a Pinecone key
pasted into local CLI history, never into this repo — confirmed then,
re-confirmed more thoroughly now). GitHub's `run_secret_scanning` tool
needs GitHub Advanced Security, which isn't enabled on this repo, so used
two manual methods instead: (1) confirmed no `.env*` file other than the
values-free `.env.example` was ever committed, in any commit, ever
(`git log --all --diff-filter=A --name-only`); (2) `git log --all -G` (pickaxe)
across full history for common leaked-secret shapes (Pinecone `pcsk_`,
Anthropic `sk-ant-`, Google `AIza`/`ya29.`, AWS `AKIA`, Slack `xox[bp]-`,
Twilio `AC[a-f0-9]{32}`, and any `postgres://user:pass@host` connection
string). The `ya29.` and connection-string hits were all read in full
context and are exactly what they should be: a runbook checklist item
telling an operator to grep for that literal prefix and expect nothing,
a unit test verifying `Secret`'s redaction using an obviously-fake token
string, and connection-string test fixtures using the literal words
"secret"/"password" as the placeholder credential against fake hosts
(`pooler.example.test`, `db.invalid`). Nothing real. Also read
`credential-store.ts`/`secret-store.ts`/`env.ts`/`.env.example` in full —
every value is `process.env`-sourced or empty by design, nothing
hardcoded. Clean confirmation, not just an absence of hits.

**Missing global security headers — a real gap, fixed.** `next.config.ts`
had zero global HTTP security headers; the only header anywhere in the
app was a route-specific `X-Content-Type-Options: nosniff` on `/api/
health`. Confirmed via grep across `src/`, `next.config.ts`, and
`vercel.json` — nothing else sets `X-Frame-Options`, a CSP, `Referrer-
Policy`, or `Permissions-Policy` anywhere. (One nuance: `docs/staging-
foundation.md`'s 2026-08-22 certification already observed HSTS on
`/sign-in` — that was Vercel's own platform-level default for HTTPS
deployments, not anything this app's code set; explicitly setting it now
makes that guarantee this app's own, not a platform assumption.)

Read Next's own bundled docs (`node_modules/next/dist/docs/.../headers.md`)
for the exact `headers()` config shape and the standard recommended
header set before writing anything, per `.claude/rules/frontend.md`.
Added to `next.config.ts`, applied to every route (`/:path*`):
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`, and
`Strict-Transport-Security: max-age=63072000; includeSubDomains`.

Two deliberate exclusions, both judgment calls made explicit rather than
silently assumed:

- **No Content-Security-Policy.** A correct CSP needs a careful audit of
  every legitimate script/style/font/connect source this app actually
  uses (Next's own hydration scripts, any Vercel toolbar/analytics,
  fonts, HMR in dev) — getting it wrong breaks the app rather than
  hardening it, and this sandbox has no live database to verify an
  authenticated page renders correctly under a candidate policy. `X-
  Frame-Options: DENY` is the narrow, unambiguous piece of what CSP would
  otherwise cover here (clickjacking) — this dashboard has no legitimate
  reason to be framed by anyone, same-origin included. Left as a flagged
  follow-up, not attempted today.
- **No HSTS `preload` directive.** Submission to the browser preload list
  is effectively permanent and applies to every subdomain forever, even
  ones that might need plain HTTP later — a real, hard-to-reverse
  decision that deserves an explicit choice, not a default. Used
  `includeSubDomains` alone, which is fully reversible by just changing
  the header.

Confirmed camera/microphone/geolocation are safe to restrict:
`grep -rn "getUserMedia|navigator.geolocation|navigator.mediaDevices|RTCPeerConnection" src/`
— zero matches; this app never uses any of them (voice calls are
server-side Twilio/Vapi, not browser mic access).

Verification: `npx next typegen && npm run typecheck && npm run lint` —
clean. `npm run build` — exit 0, 0 warnings (full log checked). Booted
the dev server and confirmed all five headers appear correctly on both
`/sign-in` and `/api/health` via `curl -sD -` (the route's own redundant
`nosniff` doesn't conflict — same value, last-wins per Next's own
documented header-overriding rule). Full `npx vitest run`: 41/41 files,
396/396 tests passed, 5 files/199 tests skipped as expected (DB-backed,
no live DB here) — nothing broke.

## Claude — CI confirmed healthy, extensions clean, RLS boundary independently verified (2026-09-01)

User asked to keep going. Three checks, no code changes.

**CI health.** Never verified this session despite extensive manual
checking. `.github/workflows/ci.yml` ("Repository validation") exists,
runs `next typegen` → `typecheck` → `lint` → `npm test` →
`deploy:build` + `audit:client-secrets` on every push to `master`/
`staging` and every PR. Pulled the last 30 runs: every one green
(`conclusion: success`) except one `cancelled` run that was just
superseded by a newer push to the same ref under the `cancel-in-progress`
concurrency group — not a failure. By design it does **not** run on
arbitrary task-branch pushes (only `master`/`staging`/PRs), so today's
later commits on this branch (everything after the `847be16` master
fast-forward) haven't been independently CI-verified yet, only checked
locally in this sandbox — expected given the trigger config, not a gap.

**Supabase extensions, both projects.** Only 5 actually installed on
either: `pgcrypto`, `pg_stat_statements`, `supabase_vault`, `uuid-ossp`,
`plpgsql` — all standard Supabase defaults. Notably absent: `pg_net`/
`http` (would let the database itself make outbound HTTP calls). Clean,
minimal, nothing to flag.

**RLS is disabled on every `app`-schema table on production — verified
this is the documented, correct architecture, not a gap.** Queried
`pg_class`/`pg_policy` directly: all 45 tables in `app` show
`rls_enabled: false`, `policy_count: 0`. Re-read `database.md`'s own
line carefully before treating this as a finding: "RLS is not a
decorative security claim: Auth.js identity is not automatically
`auth.uid()`... Application authorization and private-schema access
remain authoritative" — this is *describing* the real boundary (private
schema + app-layer authorization via `app_runtime`'s scoped grants), not
claiming RLS itself does the work. Correct: this app never uses Supabase
Auth, so `auth.uid()` is always null and an RLS policy built on it would
be actively misleading, not protective.

Didn't stop at re-reading the doc — independently tested the actual
claim it depends on: that `app` is genuinely unreachable via Supabase's
auto-generated PostgREST API (the one thing that would make
RLS-disabled dangerous if false). The read-only test needed one live
external HTTP call against the production project's public anon key, which
the auto-mode classifier correctly flagged for approval before running;
asked the user, they approved it specifically. Result, decisive:
`GET .../rest/v1/users` with `Accept-Profile: app` →
`406 {"code":"PGRST106","message":"Invalid schema: app"}` — PostgREST's
own error names the exposed set explicitly: `Only the following schemas
are exposed: public, graphql_public`. The `public` schema probe for
`workspaces` also 404s (`PGRST205`, table not found) — confirms `public`
holds none of the application's tables either. The documented security
model is independently confirmed to actually hold, not just asserted.

No code or database change from this entry — investigation and one
externally-approved read-only HTTP request only.

## Claude — user context: this is a first-time build, paused batch is a cash-flow decision (2026-09-01)

User disclosed this is their first software build and they are not
technical, and asked this agent to use its own judgment going forward.
Responded with a plain-language status summary instead of continuing
unprompted technical auditing: the engineering (security, tests, CI,
deployment) is solid and independently verified throughout today's
passes; the product itself is not live yet because every external
provider (Twilio, Vapi, n8n, Supabase Pro) is still intentionally in
simulated/disabled mode, per the standing pause already on record above
(2026-08-27/2026-08-31 entries).

User then clarified the *reason* for the pause, which matters for
whoever picks this up next: it's a cash-flow decision, not a readiness
one. They want to get revenue into the account first, then fund the live
batch — not "this isn't ready" but "I'm not spending yet." Confirmed:
keep the practice/simulated version exactly as-is and working; do not
push toward live setup or spend anything until the user explicitly says
they're ready. This is the same standing rule as before, now with the
actual reason recorded so it reads as a deliberate business decision,
not an open technical blocker, if this file is read cold later.

Also: on the strength of "use your judgment" alone, this agent
deliberately did **not** drop production's stale `app_test` schema
(the one small pending cleanup from earlier passes) — a live database
mutation still needs the user's specific yes, general delegation
language doesn't cover it. Still open, still harmless either way.

No code or database change from this entry.
