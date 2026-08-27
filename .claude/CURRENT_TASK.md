# Current Task

Phase: **Monitoring and alerting foundation**

Status: **PRODUCTION LIVENESS LIVE-VERIFIED VIA VERCEL BYPASS — EXTERNAL MONITOR CONFIGURATION UNVERIFIED — 2026-08-27**

## Authoritative checkpoint

- Local `master` and `origin/master` are at `f2d725c`; the health route and proxy
  fix are committed ancestors `d1b2d84` and `bf8774b`.
  `origin/staging` remains isolated at `64fa59a`.
- The working tree is clean except the live coordination update and the
  pre-existing untracked `.claude/worktrees/`, which is not part of the task and
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

## Runtime boundary and next action

Production deployment `dpl_DzM2nQB42EGDVccnDdupih8zQf6j` is READY at
`f2d725c`. GET and HEAD were live-verified with the Vercel automation bypass and
returned the expected 200 responses and no-store headers. The bypass value was
read locally and was not printed or committed.

An UptimeRobot account exists, but the monitor itself, probe interval, failure
and recovery thresholds, alert contacts, acknowledgement target, escalation
path, and controlled alert/recovery evidence have not been verified. No error
tracker or log/trace drain has been configured.

The next safe implementation work is a migration-based disposable-schema
recovery rehearsal. It can verify migration replay and invariant checks, but it
must not be represented as a provider-managed backup restore. A true backup
restore remains blocked on Supabase dashboard restore access.

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

## Merge note — branch `fix/undo-calendar-sync` brought up to date (2026-08-27)

This branch (PR #4, commits `e59cc7c`/`eb255c0`) had diverged from `master`
since `797f4b3` (before all Knowledge/Pinecone certification, migration 19,
the Nodemailer fix, and the monitoring work). Merged current `origin/master`
into it to prepare for an eventual merge decision — no code conflicts, only
these three accumulating doc files, resolved by keeping master's content
and re-recording the unique fix below rather than the branch's now-stale
intermediate history.

**The unmerged fix itself, still pending explicit approval:**
`restoreAppointmentAction` (the Undo behind a cancel/reschedule toast) wrote
status/date/time straight to the database and never called the calendar, so
undoing a cancellation or reschedule could leave a connected calendar and the
dashboard silently disagreeing. The fix reused existing, previously-unwired
plumbing (`appointment.book`/`createExecutor` in `calendar-sync.ts`, already
implemented and unit-tested but never called): added `requestAppointmentBooking`
to `workflows.ts` mirroring the existing reschedule/cancel functions, and
wired `restoreAppointmentAction` through the same validate → workflow →
`commitWithSyncGuard` sequence — undo-of-cancel re-books the event,
undo-of-reschedule moves it back, a plain status/notes-only undo stays
database-only. Also added the slot/business-hours validation undo-of-cancel
was missing entirely. New hosted-DB regression tests mirror the existing
reschedule/cancel suite. Verification: typecheck, full lint, and the full
suite all green — 40/40 test files, 555/555 tests (552 baseline + 3 new).

**Still not merged** — this is a booking-engine correctness change touching a
live calendar, which `CLAUDE.md` explicitly flags as needing explicit
approval before merge. Nothing about the merge decision has changed; this
update only makes the branch mergeable without conflicts against current
`master`, and re-verification against the now-current tree is the next step
before that approval request.
