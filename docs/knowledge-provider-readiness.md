# Business Knowledge Provider Readiness

Updated: 2026-08-26

## Current status

**Live, certified end-to-end through the real UI on staging (2026-08-26).**
The application code (server actions, repositories, UI) merged via PR #2
(`f365cea`) and is deployed to both staging and production. The full round
trip — UI save, database `provider_document_id`/`provider_sync_state`,
Pinecone semantic search, and delete — is verified live against the
redeployed staging deployment. Production has the code but no
`KNOWLEDGE_PROVIDER_MODE`/Pinecone credential configured, so it remains
fail-closed in practice there; no production live certification is claimed.

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
  proved the real adapter/provider path only, ahead of any database-backed or
  authenticated UI certification.
- Authenticated staging UI certification (2026-08-26): after PR #2 merged and
  staging redeployed at `0b444ac` (`dpl_5ypffPNJxgW3YNxzeni5Ufjsr63D`, READY),
  the real Coastal Bloom owner added a Knowledge entry through the live UI. It
  survived a hard reload; the database row showed `provider_document_id` set
  and `provider_sync_state = synced`; Pinecone semantic search found the real
  vector with correct fields; delete removed it from both DB and Pinecone. No
  stray test data was left behind. This is the database-backed, authenticated
  UI certification the isolated smoke above did not by itself provide.

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

The intended Vercel project has `KNOWLEDGE_PROVIDER_MODE`, `PINECONE_API_KEY`,
and `PINECONE_INDEX_HOST` configured only for Preview branch `staging`; the key
is a server-only Secret and is not documented. Production remains
unconfigured for Pinecone (no `KNOWLEDGE_PROVIDER_MODE`/credential) and
generic Preview was untouched. The Knowledge application code (server actions,
repositories, UI) merged to `master` via PR #2 (`f365cea`); production
redeployed at `f365cea` then at docs-only follow-up `0b444ac`, and the user
pushed `master:staging` directly, redeploying staging at `0b444ac`
(`dpl_5ypffPNJxgW3YNxzeni5Ufjsr63D`, READY).

This resolved the earlier schema/code skew recorded here: deployment
`dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN` at commit `ccf6272` predated the Knowledge
application code, so a real authenticated owner create then reached the old
action and failed on migration 18's required `provider_document_id`, with
Postgres rolling the insert back. That gap is closed — see the authenticated
staging UI certification above.

File 19 is local only. It preserves runtime select/insert and revokes unused
update on the namespace mapping. Its permanent schema assertion passes against
disposable `app_test`; staging/production `app` application remains separately
approval-gated.

## Remaining gates

1. Done. PR #2 merged (`f365cea`); both production and staging were
   redeployed with application code matching migration 18. See "Remote state"
   above.
2. Done for create/persist/search/delete. The authenticated staging UI
   certification above correlated UI, scoped database rows, and live Pinecone
   state for create, hard-reload persistence, semantic search, and delete.
   Edit and deactivate were not separately exercised in this pass.
3. Not yet run. Cross-workspace negative probes on the live Knowledge UI flow,
   and confirmation that no provider identifier, namespace, credential, or raw
   error reaches client state under those probes, remain outstanding.
4. Migration file 19 and any Production Pinecone credential/request remain
   separate explicit approval phases; production has no Pinecone credential
   configured.

Production remains fail-closed in practice without Pinecone credentials. The
authenticated staging certification above covers the tenant-aware hosted
application flow on staging only; it does not extend to production.
