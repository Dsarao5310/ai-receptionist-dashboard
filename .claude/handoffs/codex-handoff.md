# Handoff: Codex ↔ Claude — superseded

Status: **CLOSED 2026-08-25**.

The original handoff coordinated two agents working in the same uncommitted
`ui/dashboard-reconstruction` tree at `7cfbf44`. That condition no longer exists:
PR #1 merged the work to `master` as `5af8fd7`, followed by the CI fix `ccf6272`.

Current state belongs in:

- `.claude/PROJECT_STATE.md`
- `.claude/CURRENT_TASK.md`
- `.claude/handoffs/latest.md`

Claude's historical review notes remain in `.claude/handoffs/claude-notes.md`.

## Preserved boundaries

- n8n remains externally inaccessible and not live-certified.
- Do not expose or invent credentials.
- Do not change Vercel environment variables, remove projects, redeploy/promote,
  apply remote migrations, configure providers, or perform live certification
  without an explicitly approved phase.
- Inspect the current branch, HEAD, working tree, and authoritative Markdown
  before any new mutation.

## Vercel follow-up

The intended Vercel project is healthy on production commit `ccf6272`. A second
project named `ai-receptionist-dashboard-dsarao` is connected to the same GitHub
repository and produces duplicate failed deployments because its production
configuration is invalid. Disconnecting/removing it is a separate destructive
external action requiring explicit approval.
