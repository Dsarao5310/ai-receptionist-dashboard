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
Task: — (last: UI/frontend review pass over src/app/, src/components/, src/features/. Found and fixed one real bug — setInternalNotes/setFeatureFlag in workspace-stores.tsx applied optimistic writes but never rolled back on server refusal, unlike every other mutator in the file; SaveBar hid itself at the exact moment the failure toast fired. Fixed to match the established rollback pattern, verified typecheck/lint/396 tests green, pushed as 3cadcb5. Rest of the layer held up clean. Standing reminder: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready, see CURRENT_TASK.md's 2026-08-27/2026-08-31 entries.)
Started: —
Last updated: 2026-09-01
