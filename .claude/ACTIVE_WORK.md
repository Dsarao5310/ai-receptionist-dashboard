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
Task: — (last: Vercel production runtime-error scan (7d) — 3 error groups, all already-known/dismissed history from Aug 27, zero new errors since; one of them traced to the old ConfigurationRepository.addKnowledge, already deleted as dead code. Supabase log check (24h) on both projects — clean; production's one non-routine entry was a raw execute_sql MCP query missing the app. schema prefix from 2026-08-31T23:42:15Z, the already-documented first (failed) attempt behind this file's own 2026-08-31 Twilio/Vapi integration_records entry, not an app bug. Test-coverage gap sweep attempted then correctly abandoned: this codebase groups tests thematically, not 1:1 by filename, so a naive diff produced false positives; no coverage tooling configured and standing one up now would be scope creep that wouldn't mean much in this no-DB sandbox anyway. See CURRENT_TASK.md's 2026-09-01 entry. Still-open question from last pass: whether to drop production's stale app_test schema — not yet answered. Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready.)
Started: —
Last updated: 2026-09-01
