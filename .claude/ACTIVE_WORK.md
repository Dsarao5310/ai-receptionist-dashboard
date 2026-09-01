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
Task: — (last: user asked to do both mitigations for the Vercel Preview-failure noise — (1) stop the builds: added `ignoreCommand` to vercel.json so only master/staging branches actually build, verified all three branch cases, committed to this branch (d47e77a); (2) clean up the mailbox: no Gmail filter/rule-creation tool is exposed by this session's Gmail MCP server, only label/archive tools, so as the closest available equivalent, created label "Vercel/Preview-Build-Noise" and archived the 34-message Preview-failure thread plus the two old already-resolved Production-failure threads. User then gave the literal push command themselves and origin/master fast-forwarded 99b8164→847be16 — the ignoreCommand fix is now live platform-wide, not just on this branch. Production redeploy (dpl_B7DnP5ssbzoxzeMdxzqRs6NYWKrN) was confirmed BUILDING immediately after the push, as expected. Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready.)
Started: —
Last updated: 2026-09-01
