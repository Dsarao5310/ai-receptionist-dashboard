# Current Project State

Updated: 2026-08-26

## Repository checkpoint

- Branch: `master`; current committed HEAD: `364e30a`.
- PR #2 merged the Business Knowledge/Pinecone foundation. Staging was updated
  to the certified application code at commit `0b444ac`; later commits are
  documentation-only.
- The working tree currently contains Codex's local Knowledge reconciliation
  implementation and a separate Claude-owned Nodemailer dependency upgrade.
  `.claude/worktrees/` is untracked and is not part of this task.
- No commit, push, deployment, provider mutation, or remote database change was
  made by the current task.

## Live platform status

- Supabase: **STAGING 19/19; PRODUCTION 19/19**. Both environments have the
  Knowledge foundation and namespace-immutability hardening applied and
  independently verified.
- Authentication and tenancy: Auth.js remains authoritative; hosted staging
  OAuth/RBAC/tenant checks and the documented production owner/no-membership
  checks are live-verified. Cross-tenant leakage remains a release blocker.
- Vercel: intended production and isolated staging deployments are operational.
  Generic Preview remains fail-closed. The duplicate
  `ai-receptionist-dashboard-dsarao` project remains external cleanup debt and
  requires explicit approval to disconnect or remove.
- Google Calendar: live-verified historically.
- n8n: application-ready but externally inaccessible and not live-certified.
- Twilio: simulator-verified; live certification remains blocked by account/
  number prerequisites.
- Vapi, Gmail, and model provider: application-ready/simulator-verified only;
  no live certification is claimed.
- Monitoring, alert ownership, restore drill, comprehensive accessibility QA,
  and full operational/privacy certification remain pilot blockers.

## Business Knowledge and Pinecone

- **Isolated staging is live-certified end-to-end.** A real owner UI operation
  passed UI → server action → scoped Postgres row → Pinecone upsert/search →
  synchronized state → UI delete → Postgres tombstone → Pinecone removal.
- The staging index uses integrated `llama-text-embed-v2` inference with 1024
  dimensions and the `content` field mapping. Production has no Pinecone
  credential and remains fail-closed.
- Provider matches are ranking hints only. The application re-authorizes every
  id through local active, non-deleted, workspace-scoped Business Knowledge.
- Provider success followed by failed local settlement becomes `sync_required`;
  it is never automatically replayed. Retryable reconciliation includes only
  `pending` and `error`.
- Eight historical staging rows remain pending after migration backfill. The
  live certification entry was separate and was cleaned up after verification.

## Local reconciliation implementation

- A server-only reconciliation DAL and protected Server Action now exist locally.
- Authorization is `business.edit`; workspace scope comes only from the verified
  AuthContext. Client input cannot select another workspace or provider resource.
- Dry run is provider-free. Execute requires an exact confirmation phrase,
  rejects disabled provider mode, and is capped at 100 retryable rows.
- Operational status is content-free and reports pending/error/sync-required/
  synced totals and oldest retryable age.
- Safe audit events cover preview, start, completion, and unexpected failure.
- The mechanism is not wired into dashboard UI, not deployed, and has not been
  invoked against staging or production.

## Current verification

- Reconciliation/action unit tests: 11/11 pass.
- TypeScript, full lint, production build, 56-artifact client-secret audit, and
  `git diff --check`: pass.
- The consolidated test phase is not green: 34/42 files and 377 tests passed;
  91 failed and 96 skipped after concurrent rebuilds of shared disposable
  `app_test` removed fixtures/tables and produced one `tuple concurrently
  updated`. The new reconciliation tests passed inside that run. Rerun the full
  database gate with one schema owner before release.
- The local dashboard is running on port 3000. The in-app Browser rendered the
  expected expired-session sign-in page with no console errors.

## Approval-gated next phases

1. Run a controlled staging dry run and reconcile the eight historical pending
   rows, then verify scoped DB state, Pinecone records, semantic retrieval,
   sanitized logs, and cross-workspace negatives.
2. Enable or provision Production Pinecone only as a separate data-policy,
   credential, cost, monitoring, deployment, and certification phase.
3. Remove the duplicate Vercel project, deploy, commit, push, alter environment
   variables, or apply future remote migrations only with explicit approval.
