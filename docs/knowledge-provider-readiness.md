# Business Knowledge Provider Readiness

Updated: 2026-08-26

## Decision

**READY for the already-certified isolated staging CRUD flow. NOT YET READY for
automatic backlog operations or Production Pinecone.**

The hosted staging application has passed a real authenticated round trip from
Business Profile through scoped Postgres persistence and Pinecone retrieval,
then through deletion in both systems. Production intentionally has no Pinecone
credential. Eight historical staging rows remain pending and require a separate,
controlled reconciliation phase.

## Implemented boundary

- Server-issued namespace per authorized workspace.
- Durable provider document identity, synchronization state, monotonic version,
  safe error state, provider timestamp, and deletion tombstone.
- Explicit create, update, deactivate/delete, search, and retryable
  reconciliation operations.
- Deterministic simulator for local tests and fail-closed disabled/live modes.
- Runtime validation, bounded search, normalized failures, and local-authority
  hydration of provider match ids.
- Stale-write and stale-settlement protection.
- Attempt-once handling when provider success cannot be confirmed locally:
  `sync_required` is terminal for batch reconciliation.
- Warning-aware action projection that preserves an accepted local write.

## Remote evidence

- Staging Supabase: 19/19 migrations, namespace mapping hardened, runtime update
  denied on the immutable namespace table.
- Production Supabase: 19/19 migrations with the same hardening independently
  verified.
- Staging Vercel: Knowledge code and branch-scoped live Pinecone configuration
  deployed; Production and generic Preview were not given Pinecone credentials.
- Staging Pinecone: READY integrated-inference index using
  `llama-text-embed-v2`, dimension 1024, `content` field mapping.
- Real staging owner certification: create → reload → scoped DB row with provider
  identity and `synced` state → semantic Pinecone result → UI delete → DB
  tombstone → Pinecone result absent. The test entry was removed.

## Local operational hardening

A protected manual reconciliation command is implemented locally but is not
deployed or invoked:

- owner-level `business.edit` authorization on every Server Action call;
- workspace derived only from the verified AuthContext;
- strict input that cannot choose a workspace or provider resource;
- provider-free dry run;
- exact execute confirmation and a maximum batch size of 100;
- disabled-mode refusal;
- content-free health counts for pending/error/sync-required/synced;
- safe preview/start/completion/failure audit events;
- no automatic or manual batch replay of `sync_required`.

## Local verification

- New reconciliation and action tests: 11/11 pass.
- TypeScript and targeted ESLint: pass.
- Production build, 56-artifact client-secret audit, and whitespace check pass.
- The full gate passed typecheck and lint. Its test phase passed 34/42 files and
  377 tests; 91 failed and 96 skipped after another process repeatedly rebuilt
  shared `app_test`, causing missing fixtures/tables, stale schema shape, and one
  tuple-concurrency error. All 11 new reconciliation/action tests passed inside
  that run. A clean, uncontested database/full-suite run remains required before
  release.
- The local dashboard rendered its expected expired-session sign-in state with
  no browser console errors.

## Remaining staging reconciliation gate

1. Obtain explicit approval for live provider writes.
2. Run the protected dry run and confirm the bounded eligible count.
3. Reconcile the eight historical staging rows only.
4. Verify workspace-scoped DB states and Pinecone records.
5. Perform semantic success and cross-workspace negative probes.
6. Confirm `sync_required` is not replayed and inspect sanitized runtime logs.
7. Record exact results and any cleanup in the Claude state/handoff files.

## Production boundary

Production Pinecone requires its own approved account/index, credential path,
data residency and retention decision, cost/limit policy, monitoring, deployment,
tenant-isolation certification, and rollback plan. Production schema readiness
does not authorize live provider traffic.
