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
Task: — (last: TODO/FIXME sweep clean, production build clean/0 warnings, and a Supabase advisor refresh that turned into a real finding — production's hosted app_test schema is stale, only 3/19 migrations applied with checksum mismatches on those, vs staging's app_test which is fully empty (0 migrations, expected — that's the disposable test schema at rest between real hosted DB-test runs, which tear it down and rebuild it fully via db:reset+db:migrate each time). Traced production's 2 security-advisor WARN findings and 11 of its performance-advisor INFO findings directly to this one gap (migration 20260825151957_provider_privacy_advisor_hardening.sql never applied to app_test there). Not a live risk — app_test holds no real tenant data, nothing in the running app touches it — so not fixed unprompted; only read-only SQL was run, nothing written/dropped. Offered the user the one optional cleanup (DROP SCHEMA app_test on production, self-heals via db:reset semantics) but left it for their call since it's a mutating action on a live hosted project. See CURRENT_TASK.md's 2026-09-01 entry. Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready.)
Started: —
Last updated: 2026-09-01
