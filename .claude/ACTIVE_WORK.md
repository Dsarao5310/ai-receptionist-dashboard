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
Task: — (last: extended the doc-staleness pass to all 14 docs/*.md files, not just the 2 already fixed. Checked the rest for the same class of drift — stale deployment IDs, a wrong "active blocker" claim, misleading URLs/refs in the operational runbooks. Found one more (minor, consistency-only) item in knowledge-provider-readiness.md; everything else — n8n/twilio/vapi/calendar certification runbooks — checked clean against today's independently-confirmed facts (staging origin, project refs, production URL). Doc sweep now genuinely complete. Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready, see CURRENT_TASK.md's 2026-08-27/2026-08-31 entries.)
Started: —
Last updated: 2026-09-01
