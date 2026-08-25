# AI Receptionist

## Project identity

AI Receptionist is a commercial multi-tenant receptionist platform.

## Mandatory startup

At the beginning of a task:

1. Read `CLAUDE.md`.
2. Read `.claude/CURRENT_TASK.md`.
3. Run `git status`.
4. Inspect only code relevant to the current task.

Read `.claude/PROJECT_STATE.md` only when current implementation status is needed.
Load additional scoped files only when relevant:

- Auth, RBAC, or tenancy: `.claude/rules/tenancy-auth.md`
- Database, Supabase, or migrations: `.claude/rules/database.md`
- Security, secrets, or webhooks: `.claude/rules/security.md`
- Provider or integration work: `.claude/rules/providers.md`
- UI or frontend: `.claude/rules/frontend.md`
- Shared component structure or composition: `.claude/rules/design-system.md`
- Testing or release verification: `.claude/rules/testing.md`
- n8n: `.claude/providers/n8n.md`
- Google Calendar: `.claude/providers/google-calendar.md`
- Twilio: `.claude/providers/twilio.md`
- Vapi: `.claude/providers/vapi.md`
- Call recording, transcripts, consent, retention, or erasure:
  `.claude/rules/privacy.md`
- Gmail or email: `.claude/providers/gmail.md`
- Knowledge or Pinecone: `.claude/providers/knowledge.md`
- Production or release readiness: `docs/production-readiness.md`

Do not read every scoped file by default.

## Permanent architecture rules

- Auth.js / NextAuth v5 is authentication. Do not introduce Supabase Auth.
- Supabase Postgres is authoritative application persistence.
- n8n is orchestration, not application storage.
- Platform privilege and workspace roles are separate; a workspace owner is not a platform operator.
- All tenant access is server-authorized and workspace-scoped.
- Never trust browser-supplied role or workspace authorization.
- Provider credentials remain server-only.
- Reuse the shared provider and integration plumbing.
- HTTP or transport success does not guarantee provider semantic success.
- External success plus failure of the authoritative local write becomes `sync_required`.
- Cross-tenant leakage is a release blocker.
- Never describe simulator evidence as live verification.
- Backend security must enforce client/admin separation.
- Preserve unrelated working-tree changes.

## Work style

- Search before broad reading and inspect the smallest relevant dependency chain.
- Prefer the smallest architecture that preserves correctness, security, and maintainability.
- Do not rediscover completed work or repeatedly run the full test suite.
- Do not start the next phase automatically.
- The latest user instruction and repository truth override stale documentation.
- Source-of-truth order: latest user instruction, repository/runtime state, current tests,
  scoped current documentation, then older notes.

## Completion behavior

At the end of every successfully completed task:

- Update the relevant Claude Markdown files so they match the verified repository
  and runtime state; never leave known-stale task or status claims behind.
- Update `.claude/CURRENT_TASK.md` when the phase, completed work, blockers, or
  next action changed.
- Update `.claude/PROJECT_STATE.md` when implementation status or verification
  evidence changed.
- Replace `.claude/handoffs/latest.md` with a concise current checkpoint covering
  changes, verification, remaining work, and the next safe action.
- Update any related scoped rules, provider notes, runbooks, or other Markdown
  documentation affected by the task.
- Do not record unverified claims or turn `CLAUDE.md` into project history.
