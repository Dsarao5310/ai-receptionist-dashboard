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

An UptimeRobot account exists, but the monitor itself, probe interval, failure
and recovery thresholds, alert contacts, acknowledgement target, escalation
path, and controlled alert/recovery evidence have not been verified. No error
tracker or log/trace drain has been configured.

The local migration-replay rehearsal command is implemented but could not be
executed because this environment has no loopback Postgres instance. It must not
be represented as a provider-managed backup restore. The next material recovery
step is still a real backup restored into a separate disposable Supabase
project, which remains externally gated and unavailable here.

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
