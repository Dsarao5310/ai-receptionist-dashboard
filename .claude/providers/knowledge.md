# Business Knowledge

Status: **STAGING CRUD LIVE-CERTIFIED; SCHEMA 19/19 IN STAGING AND PRODUCTION; RECONCILIATION COMMITTED BUT NOT LIVE-EXECUTED**.

## Permanent boundaries

- Business Knowledge in Postgres is authoritative. Pinecone is a secondary
  retrieval index, never tenant authority or application storage.
- Every namespace is opaque, server-issued, persisted in the private schema,
  and resolved only through an authorized workspace repository.
- No action accepts a workspace, namespace, index, provider document id,
  credential, embedding setting, or provider error from a client.
- Provider matches supply ranked ids only. Results are re-authorized and
  rehydrated from active, non-deleted, workspace-scoped local rows.
- Credentials and provider details remain server-only. Client DTOs and audit
  metadata contain no namespace, provider id, raw error, content, or secret.
- `pending` and retryable `error` may be reconciled. `sync_required` means an
  external effect may already have succeeded and must never be batch-replayed.
- Provider success followed by failed local confirmation parks the row as
  `sync_required`; an accepted local write remains saved and surfaces a warning.

## Current live evidence

- Staging and production have migrations 18 and 19 applied and verified (19/19).
- Only Preview branch `staging` has live Pinecone mode and its isolated secret/
  index host. Production and generic Preview remain fail-closed.
- Authenticated staging certification passed the complete add, reload, database,
  semantic-search, delete, tombstone, and provider-removal path. Test data was
  cleaned up.
- The staging Pinecone index is READY with integrated
  `llama-text-embed-v2`, dimension 1024, and `content` field mapping.
- Eight pre-existing staging Knowledge rows remain `pending` from migration
  backfill. They were not part of the certification entry and have not been
  reconciled live.

## Reconciliation operations

- `KnowledgeSyncRepository.syncStatus()` returns content-free counts for
  `pending`, `error`, `sync_required`, and `synced`, retryable total, and oldest
  retryable timestamp for its authorized workspace.
- `readKnowledgeSyncHealthAction()` requires `business.edit` and returns only
  that safe summary.
- `reconcileKnowledgeAction()` validates a strict dry-run/execute command,
  re-authorizes the caller, and passes only the resulting AuthContext to the
  server-only reconciliation DAL.
- Dry-run mode never constructs or invokes provider work.
- Execute mode requires `RECONCILE KNOWLEDGE`, rejects disabled provider mode,
  and processes at most 100 retryable rows.
- Preview/start/completion/failure audit events contain counts and safe outcome
  totals only. A completion-audit failure returns a warning rather than inviting
  replay after provider settlement.
- The mechanism is committed in `9a5b957`. No dashboard control or schedule
  invokes it, and it has not contacted Pinecone through reconciliation.
- Vitest holds a bounded session advisory lock across the complete run so two
  processes cannot rebuild shared `app_test` concurrently.

## Verification

- Accepted uncontested suite: 42/42 files and 564/564 tests pass, including all
  reconciliation/action and database-backed tenant tests.
- TypeScript, full lint, production build, and client-secret audit pass.
- Two overlapping schema-hardening processes both passed 3/3; the second waited
  for the first lock holder, proving whole-run `app_test` serialization.
- These are repository/test results, not live provider certification evidence.

## Next live gate

After explicit approval: authenticate as an authorized staging owner, run dry
run first, reconcile only the bounded historical backlog, verify DB and Pinecone
state, perform cross-workspace negative probes, scan sanitized runtime logs, and
record cleanup. Production Pinecone remains a separate approval phase.
