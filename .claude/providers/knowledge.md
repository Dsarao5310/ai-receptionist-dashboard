# Business Knowledge

Status: **STAGING CRUD AND HISTORICAL RECONCILIATION LIVE-CERTIFIED; SCHEMA 19/19; PRODUCTION DISABLED**.

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
- Isolated staging deployment `dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa` is READY at
  `64fa59a` and contains the protected reconciliation foundation. Production is
  READY at `4899725` (`dpl_Ei7f5WEVuFtko1zFhYoaBNhXRh6N`) but has no Pinecone
  credential.
- Authenticated staging certification passed the complete add, reload, database,
  semantic-search, delete, tombstone, and provider-removal path. Test data was
  cleaned up.
- The staging Pinecone index is READY with integrated
  `llama-text-embed-v2`, dimension 1024, and `content` field mapping.
- The eight pre-existing staging Knowledge rows from migration backfill were
  reconciled live after explicit approval. Coastal now has 5 synchronized rows
  total and Harbour has 4; both have 0 pending, 0 errors, and 0 `sync_required`.
- Provider-free authorized dry runs completed for both staging workspaces:
  Coastal 4 eligible and Harbour 4 eligible, with 0 errors, 0 `sync_required`,
  and 0 attempted. Each wrote a content-free preview audit; read-only status
  checks confirmed the same unchanged backlog.

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
  invokes it. One explicitly approved staging run synchronized the historical
  eight-row backlog in two exact four-row workspace batches.
- Vitest holds a bounded session advisory lock across the complete run so two
  processes cannot rebuild shared `app_test` concurrently.

## Verification

- Accepted uncontested suite: 42/42 files and 564/564 tests pass, including all
  reconciliation/action and database-backed tenant tests.
- TypeScript, full lint, production build, and client-secret audit pass.
- Two overlapping schema-hardening processes both passed 3/3; the second waited
  for the first lock holder, proving whole-run `app_test` serialization.
- Shared operator CLI guards pass 6/6 focused tests covering project targeting,
  bounds, active-owner resolution, explicit-actor fail-closed behavior, and
  content-free preview metadata.
- Live execution evidence: 8/8 attempted and synchronized, 0 adverse outcomes,
  0 remaining retryable, 0 `sync_required`, both completion audits recorded,
  and the final 5/5 Coastal plus 4/4 Harbour status confirmed read-only.
- A Coastal actor was denied Harbour status access before any provider call.

## Next live gate

The historical staging backlog gate is complete. Production Pinecone remains a
separate approval phase covering policy, credential, index, cost, monitoring,
deployment, tenant-isolation certification, and rollback.
