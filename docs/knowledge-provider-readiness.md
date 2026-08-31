# Business Knowledge Provider Readiness

Updated: 2026-08-27

## Decision

**READY for the certified isolated staging CRUD flow and completed historical
backlog reconciliation. NOT READY for Production Pinecone.**

The hosted staging application has passed a real authenticated round trip from
Business Profile through scoped Postgres persistence and Pinecone retrieval,
then through deletion in both systems. Production intentionally has no Pinecone
credential. The eight historical staging rows were reconciled in one explicitly
approved, bounded, audited staging phase.

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
- Deployment inspection on 2026-08-27: Production is READY at `4899725`
  (`dpl_Ei7f5WEVuFtko1zFhYoaBNhXRh6N`), while isolated staging remains READY at
  `64fa59a` (`dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa`).
- Staging Pinecone: READY integrated-inference index using
  `llama-text-embed-v2`, dimension 1024, `content` field mapping.
- Real staging owner certification: create → reload → scoped DB row with provider
  identity and `synced` state → semantic Pinecone result → UI delete → DB
  tombstone → Pinecone result absent. The test entry was removed.

## Local operational hardening

A protected manual reconciliation command is committed in `9a5b957` but is not
wired into a dashboard control or schedule. Its provider-free dry-run and one
explicitly approved, bounded staging execute have been invoked:

- owner-level `business.edit` authorization on every Server Action call;
- workspace derived only from the verified AuthContext;
- strict input that cannot choose a workspace or provider resource;
- provider-free dry run;
- exact execute confirmation and a maximum batch size of 100;
- disabled-mode refusal;
- content-free health counts for pending/error/sync-required/synced;
- safe preview/start/completion/failure audit events;
- no automatic or manual batch replay of `sync_required`.

The approved provider-free staging preview completed on 2026-08-27. Coastal
Bloom reported 4 eligible pending rows and 1 previously synced row; Harbour
Dental reported 4 eligible pending rows and no synced rows. Both had 0 retryable
errors, 0 `sync_required`, and 0 attempted. Each workspace recorded a
content-free preview audit, independently found by the read-only status command.
No Pinecone call or Knowledge-row mutation occurred.

The separately approved execute phase then ran exactly two four-row batches.
Coastal reported 4 attempted and 4 synchronized; Harbour reported 4 attempted
and 4 synchronized. Both had 0 superseded, 0 local-only, 0 needs-attention,
0 remaining retryable, 0 `sync_required`, and a recorded completion audit.
Read-only post-state is Coastal 5/5 synchronized and Harbour 4/4 synchronized.
A Coastal actor's Harbour status probe failed closed before any provider call.

## Local verification

- Accepted uncontested gate: 42/42 files and 564/564 tests pass, including all
  reconciliation/action and database-backed tenant checks.
- TypeScript, full ESLint, production build, client-secret audit, and whitespace
  check pass.
- Two deliberately overlapping schema-hardening processes both passed 3/3; the
  second waited for the whole-run advisory lock before rebuilding `app_test`.
- Six focused operator-guard tests pass for CLI parsing, bounded limits,
  direct/pooler project matching, explicit-actor refusal, active-owner
  resolution, and content-free preview projection.
- The local dashboard rendered its expected expired-session sign-in state with
  no browser console errors.

## Staging reconciliation result

The historical backlog gate is complete. Future operator runs must remain
status-driven, dry-run-first, exact-targeted, bounded, authorized, and audited.
Never replay `sync_required` rows.

## Production boundary

Production Pinecone requires its own approved account/index, credential path,
data residency and retention decision, cost/limit policy, monitoring, deployment,
tenant-isolation certification, and rollback plan. Production schema readiness
does not authorize live provider traffic.

### Production groundwork completed (2026-08-27)

- **Data policy**: settled as low-risk by design — Knowledge entries are
  business-authored FAQ/policy content (hours, services, pricing), not a field
  any workflow directs customer data toward. No specific data-residency
  requirement. No erasure-commitment wording exists yet (pre-launch, no real
  customers) — the existing tombstone+delete flow is technically sufficient
  when that commitment gets written.
- **Credential/index**: a separate, isolated production Pinecone index
  (`ai-receptionist-knowledge-production`) was created, mirroring staging
  exactly — AWS, us-east-1, Dense, On-demand, dimension 1024, integrated
  `llama-text-embed-v2`, `content` field mapping (the console's own quickstart
  defaults to a `text` field map, which does not match this app's code — this
  was caught and corrected before anything else happened). The `PINECONE_API_KEY`
  for this index must be generated and entered by the user directly (never
  through chat), same discipline as the earlier key rotation.
- **Deployment/certification (6/7) intentionally NOT done**: nothing in the
  live app currently calls Pinecone search — no dashboard page or the
  `receptionist-simulator` (which uses a plain in-memory `findKnowledge`
  lookup) or the (not-yet-certified) Vapi call flow reads from it. Flipping
  `KNOWLEDGE_PROVIDER_MODE=live` in Production today would sync writes to a
  live external index with zero functional payoff and real (if small) ongoing
  cost. Paused pending either a real search consumer being built, or an
  explicit decision to go live anyway.

### Rollback procedure

If production Pinecone is ever enabled and needs to be rolled back:

1. Set `KNOWLEDGE_PROVIDER_MODE` back to `disabled` (or `simulated` for local
   dev) in Vercel's Production environment variables.
2. Redeploy `master` — env var changes require a fresh build to take effect
   (Vercel bakes them in at build time, not read live from account settings).
3. No data-loss risk: Postgres remains authoritative throughout.
   `createKnowledgeSyncService().create/update/remove` already degrade
   gracefully when disabled — they return `{ state: "local_only" }` rather
   than throwing, so ordinary Knowledge CRUD keeps working with the write-sync
   simply skipped.
4. **Known gap to close before search ever ships to a real feature**:
   `KnowledgeSyncService.search()` explicitly throws
   `KnowledgeProviderError("knowledge_disabled", ...)` when disabled — this
   is not a silent fallback to a plain Postgres listing. Whatever UI/call-flow
   eventually calls `.search()` needs to catch that specific error and
   degrade visibly (e.g. "search temporarily unavailable") rather than
   propagate an unhandled failure. Not urgent today since nothing calls
   `.search()` yet, but must be handled before this ships to a live surface.
