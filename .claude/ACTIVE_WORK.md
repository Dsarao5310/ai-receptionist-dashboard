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
Task: STANDING USER INSTRUCTION (already on record in CURRENT_TASK.md's 2026-08-27 "restore drill blocked on plan tier" entry, re-confirmed by the user just now): Supabase Pro upgrade + n8n + Twilio + Vapi are batched together — nothing that costs money or nudges toward any of the four until the user says the whole batch is ready. Confirmed production's Twilio/Vapi "configured" integration_records are fake seed data (fictional 555 number shared across both demo workspaces, provider_sid null, vapi_assistants empty). User confirmed target is Coastal Bloom workspace, has a Vapi assistant already, needs to buy a Twilio number — all paused. On reflection, dropped the idea of speculatively building a Vapi function-calling endpoint now — its actual shape (tool name/params, when the AI should call it) is a product design question this agent doesn't have enough input to answer yet, not just a coding task, and building it blind risks a wrong/wasted shape. Pivoting instead to a review pass over src/app/, src/components/, src/features/ (the UI/frontend layer) — deliberately untouched all session, genuinely no-cost, no external accounts involved.
Started: 2026-08-31
Last updated: 2026-08-31
