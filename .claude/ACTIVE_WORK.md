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

Status: in-progress
Task: Review pass on src/services/ and src/lib/ (scheduling, timezone, business-hours math, and other shared business logic underpinning both UI and backend) — no-cost, not yet given a dedicated pass today (only touched incidentally via imports from the UI/backend review passes). Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready, see CURRENT_TASK.md's 2026-08-27/2026-08-31 entries.
Started: 2026-09-01
Last updated: 2026-09-01
