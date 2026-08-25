# Latest Handoff

## Checkpoint

Branch `ui/dashboard-reconstruction`, HEAD `7cfbf44`. Nothing was staged,
committed, deployed, remotely configured, or applied to staging/production.
The existing dirty UI, Vapi, model-provider, privacy, scheduler, and Claude-owned
review work was preserved.

## Completed: email provider foundation

- Added local migration `20260825044239_email_provider_foundation.sql` for
  tenant-bound mailbox, thread, and message identity in the private application
  schema. Provider mailbox/address and per-mailbox message/thread identities are
  database-unique; application runtime delete authority is revoked.
- Added a tenant-scoped email repository and trusted narrow mailbox resolver.
  Payload workspace ids are ignored, and the destination/source address must
  match the mapped mailbox before any write.
- Added bounded parsing and address normalization, local-only simulated inbound
  ingestion through the shared receipt/transaction pipeline, and deterministic
  outbound sending through the shared operation/idempotency and sync-guard spine.
- Registered a server Gmail adapter that is usable only for simulated sandbox
  state. `EMAIL_PROVIDER_MODE=live` and production simulation both fail closed.
- Added no public email route and no customer-facing email controls.

## Verification

- Email/database/provider/client-boundary gate: 40/40 passed across four files.
- Email-specific contract/database suite: 10/10 passed.
- Typecheck passed; lint passed.
- Production build passed; no public email route exists.
- Client-secret audit passed across 49 generated artifacts without printing values.
- `git diff --check` passed (line-ending warnings only).
- A new consolidated test count is not claimed. Claude's documented background
  `npm run check` rebuilt the shared disposable `app_test` schema during Codex's
  full-suite attempts, producing unrelated missing-table errors. The focused
  email suite had already rebuilt the migration chain and passed in isolation.

## Evidence level

**LOCAL + DISPOSABLE-DATABASE + SIMULATOR VERIFIED.** This is not Gmail-ready,
staging-ready, delivered-mail evidence, or live certification.

## Remaining email gates

1. Approve Gmail product/account ownership, minimal OAuth scopes, consent-screen
   classification, token lifecycle, mailbox alias policy, and reconnect/revoke flow.
2. Design Google watch/Pub/Sub renewal, authenticated push verification, history
   cursor recovery, replay/backfill, and operational alert ownership.
3. Add the public provider boundary only after those contracts are approved;
   retain trusted mailbox tenancy and database idempotency.
4. Apply/verify the migration in explicitly isolated staging, configure
   staging-only credentials, and run controlled live send/read/replay/revoke tests.

## Hard stop

Do not expose values, contact or configure Gmail, request OAuth scopes, create
watch/Pub/Sub resources, add a live provider callback, apply migrations remotely,
deploy, run n8n certification, send/read real mail, or commit automatically.
