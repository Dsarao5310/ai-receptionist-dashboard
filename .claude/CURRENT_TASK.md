# Current Task

Phase: **Email Provider Foundation**

Status: **COMPLETE — LOCAL + DISPOSABLE-DATABASE VERIFIED — 2026-08-24**

## Goal

Build a local, provider-agnostic email application foundation that preserves
durable mailbox, thread, and message identity; enforces trusted tenant mapping
and database-backed idempotency; and uses the existing server-only integration
spine without claiming Gmail connectivity.

## Assigned scope

- Add forward-only private-schema persistence for workspace mailboxes, threads,
  and messages with tenant-binding constraints and least-privilege runtime grants.
- Add deterministic simulated inbound and outbound email lifecycles behind the
  shared provider boundary.
- Resolve inbound tenancy only from a trusted mailbox mapping; ignore payload
  workspace claims.
- Preserve provider message/thread ids only in server-side records and expose
  business-safe status/content through existing conversation projections.
- Use database uniqueness for redelivery/concurrency and the existing sync guard
  for any simulated external-success/local-write failure.
- Add hostile tenant, replay, malformed-time, redaction, and disabled-mode tests.

## Explicitly out of scope

- No Gmail OAuth client/scopes, account connection, Pub/Sub/watch registration,
  live mailbox read, live send, provider webhook, secret creation/configuration,
  remote migration, deployment, environment mutation, or commit.
- No n8n live certification or workflow provisioning.
- No customer-facing email controls until the server contract is verified.

## Verification order

1. Migration and repository constraints in the disposable `app_test` schema.
2. Deterministic contract/simulator tests and tenant/replay hostility.
3. Focused provider and client-boundary tests.
4. Typecheck, lint, consolidated tests, build, and client-secret audit once.

## Definition of done

Email can be exercised end to end in simulation through trusted tenant mapping,
durable identities, normalized outcomes, and safe client projections, while live
Gmail remains visibly unavailable and no external side effect occurs.

## Result

- Added private-schema mailbox/thread/message persistence with composite tenant
  foreign keys, global provider-resource uniqueness, and no runtime delete grant.
- Added local simulated inbound and outbound lifecycles through the shared
  inbound and operation/idempotency spines. No public email route was added.
- Trusted mailbox mappings decide tenancy and mapped mailbox addresses are
  rechecked before writes; payload workspace claims have no authority.
- Live mode fails closed in both provider transport and production validation.
- Focused verification passed 40/40 checks, including 10 database-backed email
  cases. Typecheck, lint, production build, and the 49-artifact client-secret
  audit also passed.
- A consolidated suite run was not claimed: Claude's separately documented
  background `npm run check` rebuilt the same disposable `app_test` schema while
  Codex's run was active, producing cross-suite missing-table errors. This was a
  test-schema collision, not an email assertion failure; rerun the consolidated
  gate when only one session owns `app_test`.

## Evidence boundary

This is application-ready simulator/database evidence only. No Gmail account,
OAuth consent, scopes, watch/Pub/Sub lifecycle, provider webhook, live send/read,
remote migration, deployment, environment change, n8n access, or commit occurred.
