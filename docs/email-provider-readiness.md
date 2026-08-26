# Email provider readiness

Date: 2026-08-24 (America/Vancouver)

## Decision

**APPLICATION-READY + LOCAL SIMULATOR/DATABASE VERIFIED; NOT GMAIL-READY.**

The application now has the durable, tenant-safe email channel beneath a future
Gmail connection. It does not have Gmail OAuth, approved scopes, mailbox watch
or Pub/Sub lifecycle, a public provider callback, live send/read, credentials,
or live certification. Its schema is included in the verified 17-file staging
and production checkpoint. The fail-closed application code is deployed, but no
Gmail connection or public email route exists.

## Implemented contract

- `email_mailboxes` is the only trusted provider-resource-to-workspace mapping.
  Provider mailbox identity and normalized address cannot be claimed twice.
- `email_threads` binds provider threads to one mapped mailbox and optionally to
  one scoped customer/conversation.
- `email_messages` retains provider message identity and bounded business content.
  Runtime deletion is revoked so replay/idempotency evidence cannot be erased by
  an application request.
- All customer/conversation/mailbox/thread foreign keys include `workspace_id`.
  Cross-tenant ids therefore fail at the database boundary as well as in scoped
  repositories.
- Inbound simulation verifies its local-only gate, parses bounded JSON, resolves
  tenancy from the mailbox mapping, claims the provider message through the
  shared inbound receipt table, and applies the business write in one transaction.
- Outbound simulation uses `customer.message` on the existing operation spine.
  Stable workspace-scoped idempotency prevents repeat side effects, a mapped n8n
  workflow takes precedence, and accepted-provider/local-write divergence uses
  the existing `sync_required` guard.

## Safety properties verified

- Payload `workspaceId` has no authority.
- Unknown mailboxes and mapped-address mismatches are rejected.
- Concurrent copies of one provider message produce one accepted write and two
  duplicates.
- Known customers are matched by normalized tenant-scoped address.
- Two workspaces cannot claim the same provider mailbox identity or address.
- Outbound retry causes one simulator side effect and stores `accepted`, never
  the stronger and unproven `delivered` state.
- Disabled mode refuses inbound/outbound provider work.
- The runtime role cannot delete email mailbox/thread/message identity.
- Production validation rejects simulated mode and deliberately rejects live
  mode until Gmail OAuth and watch lifecycle exist.
- Business-client import closure does not reach provider infrastructure.

## Verification evidence

- Focused gate: 40/40 tests passed across email, registry, production config,
  and client-boundary suites.
- Email-specific suite: 10/10 passed against the disposable Postgres schema,
  rebuilding the complete local migration chain first.
- TypeScript and ESLint passed.
- The optimized Next.js production build passed and contains no public email route.
- The generated client-secret audit passed across 49 artifacts without printing values.
- A consolidated suite count is intentionally not reported for this phase. A
  Claude-owned background `npm run check` rebuilt the same disposable schema
  during Codex's attempted full runs and caused unrelated suites to lose tables.
  Rerun the consolidated gate with one owner of `app_test` before release.

## Gmail phase gates

Before any live implementation, explicitly approve:

1. Gmail/Workspace account and operator ownership.
2. Minimal OAuth scopes, consent-screen verification/classification, encryption,
   refresh/revocation, alias/send-as rules, and disconnect semantics.
3. Watch/Pub/Sub topic ownership, authenticated push verification, history-id
   checkpointing, expiration renewal, missed-notification recovery, backfill
   bounds, replay handling, monitoring, and alert ownership.
4. Which messages may be read, retained, sent, quoted, summarized, or used by a
   model, including privacy/legal policy and customer notice.
5. An isolated staging target, remote migration window, non-production mailbox,
   controlled send/read/replay/revoke test matrix, and rollback evidence.

## Hard stop

No live provider mode, OAuth request, Gmail account access, secret configuration,
watch/Pub/Sub creation, public callback, remote migration, deploy, n8n change,
real message, or commit is authorized by this foundation.
