# Business Knowledge

Status: **LIVE KNOWLEDGE/PINECONE FLOW CERTIFIED END-TO-END ON STAGING; SCHEMA HARDENING (MIGRATIONS 18+19) COMPLETE ON STAGING AND PRODUCTION; PRODUCTION STILL HAS NO LIVE PINECONE CREDENTIAL**.

- Business Knowledge remains the business-facing authority; retrieval vendor, index,
  namespace, credential, and embedding details remain backend/admin concerns.
- Every index or namespace mapping must be trusted, server-managed, and tenant-scoped.
  The local foundation now persists one opaque server-issued namespace per
  authorized workspace; no action accepts a workspace or namespace from a client.
- Knowledge create, update, deactivate, and delete operations now have explicit
  synchronization and reconciliation behavior. Disabled mode preserves local
  writes as pending; simulated mode indexes deterministically; provider failures
  retain safe error state; deletes are tombstoned before idempotent provider removal.
- Cross-workspace retrieval, indexing, filtering, or namespace access must be impossible.
  All repository access is bound to an authorized `AuthContext`, and provider calls
  receive only the namespace resolved by that scoped repository.
- Client DTOs expose business content, not provider infrastructure. Provider document
  ids, namespace, sync version, safe internal error state, index, credential, and
  embedding details remain in the private server/database layer.
- Monotonic sync versions prevent stale upserts from replacing newer content or
  resurrecting a newer deletion. A stale completion cannot mark a newer local revision
  as synced.
- Retrieval input and provider matches are runtime-validated at the server
  boundary. The service enforces the requested limit and converts raw provider
  failures or malformed matches to a safe retrieval error without exposing SDK
  details.
- Provider matches supply ranking ids/scores only. Every id is re-authorized in
  the current workspace and rehydrated from active local Business Knowledge;
  unknown, inactive, deleted, or foreign ids are discarded.
- Automatic reconciliation includes only `pending` and retryable `error` rows.
  `sync_required` is manual-attention state and is never automatically replayed.
- Stale failure settlement is version-aware on its return path: when a guarded
  failure update loses to a newer revision, callers receive `superseded` rather
  than a false `needs_attention` result.
- Settlement updates require an expected version and an explicitly retryable
  current state, so same-version workers cannot overwrite `synced` or
  `sync_required` terminal outcomes.
- External provider success and local success settlement have separate failure
  boundaries. If `markSynced()` fails after the provider has completed, the row
  is parked in `sync_required` with a safe settlement-specific code and is not
  replayed by automatic reconciliation.
- A locally accepted write with provider attention is projected to the dashboard
  as saved-with-warning. The optimistic local row is retained and refreshed;
  only true local rejection rolls it back.
- `KNOWLEDGE_PROVIDER_MODE=simulated` is development-only. Production validation
  rejects simulated mode and permits live mode only on the dedicated `staging`
  Preview branch with complete server-only Pinecone credentials. Production remains
  blocked in practice because it has no Pinecone credential.
- Migration `20260825215335_knowledge_provider_foundation.sql` is applied and
  verified in both staging and production (2026-08-26). The intended Vercel
  project's Preview branch `staging` has isolated live Pinecone configuration;
  Production and generic Preview do not.
- Pure contract tests, production-policy tests, and the final focused hosted
  database suite pass. The database suite is green 9/9, including tenant
  isolation, stale-write ordering, tombstones, safe failures, and input bounds.
- The retrieval-boundary follow-up passes 8/8 pure contract tests plus typecheck
  and targeted ESLint. Local rehydration is one deduplicated workspace-scoped
  batch query rather than an N+1 path.
- Hosted regressions for `sync_required` attempt-once behavior, terminal-state
  settlement, foreign-match rejection, and the real batch query pass in the
  final 17/17 Knowledge suite.
- The expanded post-success settlement gate passes 9/9 pure contracts and
  19/19 complete Knowledge tests. Its hosted case proves a completed provider
  call plus failed local confirmation remains attempt-once in `app_test`.
- The accepted-save action projection passes 2/2 focused tests plus typecheck
  and targeted ESLint.
- The latest repository gate passes typecheck, warning-free full lint, 40/40 test
  files, and 552/552 tests. The focused Knowledge release surface passes 47/47,
  and the production build plus 56-artifact client-secret audit pass.
- Local migration review is green: forward-only SQL, migrator ownership,
  private-schema isolation, and least-privilege runtime grants are covered by a
  permanent executed-schema test that passes 3/3.
- Staging remote verification is green through file 18: 18/19 ledger, 8/8 entry backfill,
  least-privilege runtime access, direct runtime read, zero security findings,
  and only INFO-level unused-index performance notices.
- Production remote verification is green through file 18, matching staging: 18/19
  ledger with checksum parity, `knowledge_provider_namespaces` owned by
  `app_migrator` with 0 rows (namespaces are server-issued on first real use),
  `app_runtime` holding select/insert/update with delete revoked, `anon`/
  `authenticated` holding zero grants, all 8 existing entries (2 workspaces)
  backfilled and left `pending`, and no new Security or Performance Advisor
  finding introduced.
- File 19 (`knowledge_namespace_immutability`) revokes unused runtime update
  authority on the immutable namespace mapping. It was generated by the
  official Supabase CLI after current docs/changelog review, and its privilege
  assertion passes in the 3/3 disposable-schema suite. **Applied and verified
  on staging (2026-08-26)**: ledger reports 19/19, and
  `has_table_privilege('app_runtime', 'app.knowledge_provider_namespaces',
  'UPDATE')` independently confirms `false`. **Now also applied and verified
  on production** (2026-08-26, separate explicit approval): production
  `db:status` reports 19/19 and the same `has_table_privilege` check against
  production also returns `false`. Both environments are hardened.
- A controlled local smoke test against the isolated staging Pinecone index proved
  live upsert, search, remove, and confirm-absent behavior in a dedicated non-tenant
  namespace. This verifies the adapter/provider path only; it is not tenant UI or
  database-backed staging certification.
- READY staging deployment `dpl_3EP4kdrsAYdydeF7a37qxnfRWYGN` still runs commit
  `ccf6272`, which predates the uncommitted Knowledge application code. A real
  authenticated owner create reached the old action and failed its database insert
  because migration 18 now requires `provider_document_id`; the transaction rolled
  back. Deploying matching application code is the next explicit gate.
- The official Pinecone Developer MCP server is registered globally for Codex
  through `npx.cmd -y @pinecone-database/mcp` with the existing local API key.
  The key is masked in inspection output. A fresh Codex task is required before
  those MCP tools appear; setup alone is not provider certification.
- MCP verification now passes in a refreshed task: all nine tools loaded, a
  read-only account call listed both indexes READY, and the intended staging
  index reports integrated `llama-text-embed-v2`, dimension 1024, `content`
  field mapping, and zero records/namespaces. No provider mutation was made.
