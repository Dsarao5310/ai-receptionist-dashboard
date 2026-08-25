# Handoff: Codex ↔ Claude

Two agents are working this same uncommitted tree (branch `ui/dashboard-reconstruction`,
HEAD `7cfbf44`, nothing committed). This file exists so neither one silently
overwrites or races the other. Read `.claude/PROJECT_STATE.md`,
`.claude/CURRENT_TASK.md`, and `.claude/handoffs/latest.md` first — this file
does not repeat their content, only who owns what next.

## Ground rule: file ownership

- `.claude/PROJECT_STATE.md`, `.claude/CURRENT_TASK.md`, and
  `.claude/handoffs/latest.md` are Codex's running log for its own feature
  work. Claude will not edit these three files while Codex is active, to
  avoid clobbering an in-progress write (this already happened once today —
  Claude had a stale diff open for review when Codex landed the privacy
  purge scheduler + erasure requests underneath it).
- Claude's own notes/handoffs go in this file or a new
  `.claude/handoffs/claude-notes.md`, never by editing Codex's three files
  above.
- Before either agent starts a working-tree-mutating task (not a read-only
  check), look at `git status` / file mtimes for changes that aren't your
  own. If the tree moved since you last looked and it wasn't you, treat the
  other agent as active and hold off rather than assume it's safe to edit.

## n8n — still blocked for both agents

No external n8n staging instance, owner access, or two 32+ character signing
secrets exist in this environment. Neither agent should start n8n live
staging certification, paste secrets into chat, or treat n8n as reachable.
This has not changed since it was first recorded blocked.

## What Codex should continue

The feature-implementation track it has been running: privacy
scheduler/erasure/operator-health work is marked complete as of the last
`CURRENT_TASK.md` update, so the next material phases per
`PROJECT_STATE.md`'s "Current priority" are:

- External alerting for the purge scheduler (missing-run/failed-run alerts,
  escalation target, recovery procedure) — needs an owner/operations
  decision before implementation, per the existing "Remaining work" list in
  `handoffs/latest.md`.
- Identity-proofing / true reauthentication for erasure requests (currently
  a durable request + recorded method/actor + destructive confirmation, but
  no automated identity proofing).
- Gmail/email integration (recorded **NOT STARTED**).
- Knowledge/Pinecone integration (recorded **NOT STARTED**).
- Continuing Twilio and Vapi toward live certification *only* as their own
  explicitly authorized, narrowly-scoped phases — same approval-boundary
  rules as everything else in this project (no live account/call/webhook
  registration without explicit sign-off).

Keep using the existing verification bar (`npm run check`, `npm run build`,
`node scripts/audit-client-secrets.mjs`, plus the focused privacy/scheduler
test gates) and keep updating `PROJECT_STATE.md` / `CURRENT_TASK.md` /
`handoffs/latest.md` the way you have been.

## What Claude will be handling

- A correctness/simplification code-review pass over the accumulated
  uncommitted diff (`git diff master`), looking for real bugs introduced
  across the UI redesign + provider foundations — not feature work. Started
  once already (2026-08-24) via 8 parallel review-agent angles; all 8 failed
  on an account-level session rate limit before producing results, so this
  is still outstanding. Will re-capture the diff fresh (not reuse the stale
  one) before resuming, and will report findings rather than silently
  auto-fixing anything mid-diff while Codex may still be editing the same
  files.
- Anything that needs the live connected Supabase (`AI Receptionist` /
  `AI Receptionist Staging` projects) or Vercel (`ai-receptionist-dashboard`
  project) accounts for **read-only inspection** — schema/advisor checks,
  deployment/build logs — when asked. Not migrations, not deploys, not
  credential changes, per the project's existing approval boundaries.
- Gmail/Calendar-account-level checks using the connected accounts, if and
  when that becomes relevant to the Gmail/email integration work above —
  again read-only unless explicitly told otherwise.
- Keeping this file (and `claude-notes.md` if created) current, without
  touching Codex's three status files.

## Current split is deliberately narrow

Claude is not picking up any of the feature-implementation items above
unless the user redirects — this file exists to prevent duplicate work and
file collisions, not to divide the whole backlog in half.
