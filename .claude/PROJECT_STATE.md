# Current Project State

Updated: 2026-08-27

## Repository checkpoint

- Branch: `master`; `HEAD` and `origin/master`: `b91524c`.
- `9a5b957` commits the protected Business Knowledge reconciliation operations,
  their tests, current documentation, and whole-run `app_test` advisory lock.
- `42e8bad` updates Nodemailer to 9.0.5; `b91524c` adds the npm override needed
  for strict clean-environment dependency resolution.
- Working tree: only this documentation reconciliation plus the pre-existing
  untracked `.claude/worktrees/`; no application code is currently modified.

## Live platform status

- Supabase: **STAGING 19/19; PRODUCTION 19/19**. Knowledge namespace hardening
  is applied and independently verified in both environments.
- Authentication and tenancy: Auth.js is authoritative. Hosted staging OAuth,
  RBAC, and tenant checks are live-verified; cross-tenant leakage remains a
  release blocker.
- Vercel: the intended production and isolated staging projects exist. Generic
  Preview remains fail-closed. The duplicate `ai-receptionist-dashboard-dsarao`
  project remains approval-gated cleanup debt.
- Google Calendar is historically live-verified. n8n remains application-ready
  but externally inaccessible and not live-certified. Twilio, Vapi, Gmail, and
  the model provider still lack their respective live certification evidence.
- Monitoring, alert ownership, restore drill, comprehensive accessibility QA,
  and full operational/privacy certification remain pilot blockers.

## Business Knowledge and Pinecone

- Isolated staging is live-certified end-to-end for authenticated create,
  scoped Postgres persistence, Pinecone retrieval, delete, tombstone, and
  provider removal.
- Staging uses an isolated integrated-inference index. Production has no
  Pinecone credential and remains fail-closed.
- Provider results are ranking hints only; every id is re-authorized through
  active, non-deleted, workspace-scoped Postgres state.
- Provider success followed by failed local settlement becomes `sync_required`
  and is never batch-replayed. Retryable reconciliation selects only `pending`
  and retryable `error` rows.
- Eight historical staging rows remain pending after migration backfill.

## Reconciliation operations

- The protected server-only DAL and Server Action are committed on `master`.
- Authorization is `business.edit`; tenant and provider scope are derived only
  from server-authorized context.
- Dry run is provider-free. Execute requires exact confirmation, rejects
  disabled mode, and is bounded to 100 retryable rows.
- Status and audit output are content-free and contain only safe counts,
  timestamps, and normalized outcomes.
- The command is not wired into the dashboard or a schedule and has not been
  executed against staging or production.
- Vitest now holds a bounded session-level advisory lock for the complete run,
  preventing separate processes from rebuilding shared `app_test` concurrently.

## Current verification

- Accepted uncontested gate: **42/42 files; 564/564 tests passed**.
- TypeScript, full lint, production build, and client-secret audit passed.
- The lock was independently exercised with two overlapping schema-hardening
  runs: both passed 3/3, and the second waited for the first to release ownership.

## Approval-gated next phases

1. Confirm a staging deployment includes the reconciliation commit, then run an
   authorized dry-run-first reconciliation of the eight historical pending rows
   and verify scoped DB/Pinecone settlement and cross-tenant negatives.
2. Enable Production Pinecone only as a separate approved data-policy,
   credential, cost, monitoring, deployment, and certification phase.
3. Deploy, alter environment variables, remove Vercel projects, apply future
   remote migrations, commit, or push only with explicit approval.
