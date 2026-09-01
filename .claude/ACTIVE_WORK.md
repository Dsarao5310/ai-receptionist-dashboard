# Active Work Status

Live "who is doing what right now" board — separate from `CURRENT_TASK.md`,
`PROJECT_STATE.md`, and `handoffs/latest.md`, which record *finished* work.
This file records *in-progress* work so the other agent can avoid colliding
(touching the same files, the same shared database schema, or pushing/
deploying at the same time).

Read this at the start of every task (part of mandatory startup). Only edit
your own section — never the other agent's. Update it:
- the moment you start a task: set Status to `in-progress`, fill in Task/
  Started/Last updated.
- at natural checkpoints during a long task (refresh Last updated).
- the moment you finish: set Status to `idle`, clear Task, and put the
  actual result in `CURRENT_TASK.md`/`PROJECT_STATE.md`/`handoffs/latest.md`
  as usual — this file is not a history log, it gets overwritten every time.

Neither agent runs continuously in the background — "checking periodically"
in practice means checking here at the start of each new task/turn, which is
already mandatory. There is no live polling.

## Codex

Status: idle
Task: — (last: recovery rehearsal commit pushed; intended Production deployment READY)
Started: —
Last updated: 2026-08-27

## Claude

Status: idle
Task: — (last: confirmed CI is real and healthy — .github/workflows/ci.yml runs typecheck/lint/test/build/audit on every master/staging push and PR, last 30 runs all green (one "cancelled" was just a superseded concurrent run, not a failure); by design it doesn't run on arbitrary task-branch pushes, so today's later commits here are only locally-verified, expected not a gap. Supabase extensions on both projects: clean, only 5 standard ones installed, no pg_net/http. Checked RLS on production's app schema — disabled on all 45 tables, 0 policies — re-read database.md carefully and confirmed this is the documented correct architecture (RLS built on auth.uid() would be meaningless since this app never uses Supabase Auth; the real boundary is private schema + app-layer authorization), then independently verified the claim itself rather than trusting the doc: one user-approved read-only curl against the production PostgREST API with Accept-Profile: app confirmed a hard 406 "Invalid schema: app" — the app schema is genuinely unreachable via the auto-API, so RLS-disabled is safe as designed. No code/database changes this round. Still-open from before: whether to drop production's stale app_test schema — not yet answered. Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready.)
Started: —
Last updated: 2026-09-01
