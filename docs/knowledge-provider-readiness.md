# Business Knowledge Provider Readiness

Updated: 2026-08-26

## Current status

**Application foundation built, schema verified in staging and production, and
the isolated live Pinecone adapter verified. The database-backed staging UI flow
is not certified because deployed code is behind the migrated schema.**

Business Knowledge remains the owner-facing authority. The application now has
a private server boundary for explicit provider synchronization without
exposing Pinecone, namespaces, provider document ids, credentials, indexes, or
embedding details to client DTOs.

## Implemented locally

- One opaque, server-issued provider namespace per authorized workspace.
- Workspace-scoped provider document identity and reconciliation state.
- Explicit create, update, deactivate/delete, and reconciliation operations.
- Local preservation when the provider is disabled.
- Deterministic simulated indexing, deletion, and bounded lexical retrieval.
- Safe normalized provider failure state with no raw body or credential leakage.
- Runtime validation of retrieval input and provider matches, server-enforced
  result limits, and retrieval-specific safe error normalization.
- Workspace-scoped re-authorization and local hydration of provider match ids;
  provider metadata is not treated as tenant authority and unknown/inactive/
  deleted/foreign ids are discarded.
- Deduplicated batch hydration resolves the bounded provider matches with one
  workspace-scoped database query rather than an N+1 query path.
- Automatic reconciliation selects only retryable `pending`/`error` rows;
  `sync_required` remains parked for explicit manual reconciliation.
- Version-aware failure settlement reports stale failed attempts as superseded.
- Atomic settlement requires both the expected version and a retryable source
  state, protecting `synced` and `sync_required` from same-version worker races.
- Provider execution and local success confirmation use separate failure
  boundaries. A failed confirmation after provider success is parked as
  `sync_required`, preventing automatic replay of an uncertain external effect.
- Server actions represent local acceptance and provider attention separately.
  An accepted Knowledge write remains in the optimistic dashboard and refreshes
  from durable state while a synchronization warning is shown; it is not rolled
  back as though Postgres rejected it.
- A forward-only privilege migration revokes unused runtime update authority on
  the immutable workspace-to-provider namespace mapping.
- Tombstoned deletion before idempotent provider removal.
- Monotonic sync versions that ignore stale upserts/deletes and prevent stale
  completions from settling newer revisions.
- Server adapter/registry projection and production configuration gates.
- Current Pinecone SDK adapter using server-only API key/index-host configuration,
  integrated-inference text upsert/search, namespaced deletion, and normalized
  retryability without raw SDK or credential leakage.

## Verification evidence

- TypeScript: pass.
- Targeted ESLint: pass.
- Pure provider contract tests: 2/2 pass.
- Production configuration tests: 13/13 pass.
- Final focused hosted database suite: 9/9 pass after the shared `app_test`
  contention cleared. Coverage includes distinct server-issued namespaces,
  foreign-entry-id rejection, monotonic version ordering, disabled-mode
  persistence, safe provider failures, tombstoned deletion, input bounds, pure
  provider contracts, and registry projection.
- Executed-schema hardening suite: 3/3 pass. The Knowledge namespace table is
  owned by `app_migrator`, the private schema remains inaccessible to `anon` and
  `authenticated`, and `app_runtime` has the required select/insert/update
  access without delete. Runtime access to the new sync-state column is also
  asserted. Targeted ESLint and typecheck pass.
- Registry projection suite: 4/4 pass after removing stale expectations that
  classified Pinecone as wholly unimplemented. Production-shaped state remains
  projected fail-closed; only the deterministic simulator is locally ready.
- First consolidated rerun: 530/532 tests passed across 37/38 files. The only
  two failures were those now-corrected registry expectations. The final rerun
  below resolves this intermediate checkpoint.
- Final consolidated rerun: typecheck, full lint, 38/38 test files, and 531/531
  tests pass, including the corrected registry projection, Knowledge database,
  and executed-schema hardening coverage.
- Retrieval-boundary follow-up: 8/8 pure contract tests, TypeScript, and targeted
  ESLint pass. It covers invalid-input short-circuiting, malformed provider-match
  rejection, result limiting, normalization of raw provider failures, and local
  authority rehydration with unknown-id rejection.
- Hosted-database regressions cover `sync_required` attempt-once behavior,
  terminal-state settlement, provider-supplied cross-workspace matches, and the
  real batch-hydration query. Final Knowledge result: 17/17 pass against
  disposable `app_test`. Schema hardening passes 3/3.
- Post-success settlement follow-up: 9/9 pure contracts, TypeScript, and
  targeted ESLint pass. The expanded complete Knowledge suite passes 19/19
  against disposable `app_test`; a completed provider write followed by failed
  local confirmation is persisted as `sync_required`, excluded from automatic
  reconciliation, and invoked exactly once.
- Accepted-save projection follow-up: 2/2 focused tests, TypeScript, and targeted
  ESLint pass; provider attention no longer triggers a false local rollback.
- Latest repository gate (2026-08-26): typecheck, warning-free full lint, 40/40
  test files, and 552/552 tests pass. The focused Knowledge release surface is
  47/47; the Next.js production build and 56-artifact client-secret audit pass.
- Controlled isolated live smoke: a dedicated non-tenant namespace in the
  staging Pinecone index passed upsert, search, delete, and confirm-absent. This
  proves the real adapter/provider path only; it is not a database-backed,
  authenticated, or cross-tenant UI certification.

## Remote state

The repository contains the foundation migration
`20260825215335_knowledge_provider_foundation.sql` and local follow-up
`20260826033517_knowledge_namespace_immutability.sql`.

Staging and production are both verified through file 18 and currently sit at
18/19 after separate explicit
approvals for each environment (staging by Codex on 2026-08-25, production by
Claude on 2026-08-26). In both, the namespace table is migrator-owned; all
existing entries (8/8 staging, 8/8 production) were backfilled and remain
pending; both indexes exist; `anon`/`authenticated` lack private-schema
access; the runtime can read and has select/insert/update without delete.
Security Advisor is clear in both and Performance Advisor reports only
unused-index INFO notices.

The intended Vercel project now has `KNOWLEDGE_PROVIDER_MODE`,
`PINECONE_API_KEY`, and `PINECONE_INDEX_HOST` configured only for Preview branch
`staging`; the key is a server-only Secret and is not documented. Production and
generic Preview were untouched. Deployment `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN`
is READY at commit `ccf6272`, but that commit predates the uncommitted Knowledge
application code. A real authenticated owner create therefore reached the old
action and failed on migration 18's required `provider_document_id`; Postgres
rolled the insert back. This is schema/code skew, not a Pinecone failure.

File 19 is local only. It preserves runtime select/insert and revokes unused
update on the namespace mapping. Its permanent schema assertion passes against
disposable `app_test`; staging/production `app` application remains separately
approval-gated.

## Required gates before staging UI certification

1. Explicitly approve committing and pushing the reviewed combined working tree,
   then redeploy the `staging` branch so application code matches migration 18.
2. Run the authenticated staging create/edit/search/deactivate/delete matrix and
   correlate UI, scoped database rows, Pinecone state, and sanitized runtime logs.
3. Include cross-workspace negative probes and verify no provider identifier,
   namespace, credential, or raw error reaches client state.
4. Keep migration file 19 and every Production Pinecone credential/request as
   separate explicit approval phases.

Production remains fail-closed in practice without Pinecone credentials. The
isolated live adapter smoke is real provider evidence, but it does not certify
the tenant-aware hosted application flow.
