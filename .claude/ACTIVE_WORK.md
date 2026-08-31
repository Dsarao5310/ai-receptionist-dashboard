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
Task: Re-ordered per user: live Twilio/Vapi certification first (found receptionist-simulator.ts is explicitly a UI preview stand-in, not the real call path — "when a real AI backend is connected this module is the single thing that gets replaced" — so there's no live assistant yet for Knowledge search to hook into). Investigating current Twilio/Vapi credential/account state before proposing concrete next steps; this needs the user's direct involvement (accounts, phone numbers, live test calls). Knowledge-search wiring (#1) and the backup-restore drill (#3) queued after.
Started: 2026-08-31
Last updated: 2026-08-31
