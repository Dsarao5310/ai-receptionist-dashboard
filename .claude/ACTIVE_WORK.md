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
Task: — (last: full-git-history secret scan — clean, only test-fixture/runbook-checklist matches found, confirmed by reading each in context (GitHub's own secret-scanning tool needs Advanced Security, not enabled on this repo, so did it manually: git log -G pickaxe across common leaked-key shapes plus a full read of credential-store.ts/secret-store.ts/env.ts/.env.example). Found and fixed a real gap: next.config.ts had zero global security headers (only a route-specific nosniff on /api/health) — added X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, and Strict-Transport-Security globally, read Next's own bundled docs for the exact config shape first. Deliberately did NOT add a CSP (needs a careful source audit this no-DB sandbox can't fully verify; flagged as a follow-up) or HSTS preload (effectively permanent, a real decision, not a default). Verified: typecheck/lint/build clean (0 warnings), headers confirmed on real curl responses, full test suite 396/396 passed. Committed and pushed. Skipped the planned Supabase list_extensions check for time. Still-open from before: whether to drop production's stale app_test schema — not yet answered. Standing reminder unchanged: Supabase Pro + n8n + Twilio + Vapi upgrade batch remains paused — user will say when ready.)
Started: —
Last updated: 2026-09-01
