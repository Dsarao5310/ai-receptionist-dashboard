# Gmail and Email

Status: **APPLICATION-READY + SIMULATOR/DATABASE VERIFIED**.

- Private `app`-schema mailboxes, threads, and messages preserve durable Gmail-shaped
  identity without exposing provider ids to business clients.
- Inbound simulation runs through the shared authenticated ingestion pipeline;
  tenancy comes only from an active mailbox mapping and payload workspace claims
  are ignored.
- Provider message uniqueness and shared inbound receipts provide database-backed
  replay/concurrency arbitration. Outbound simulation uses the shared operation
  idempotency and sync-guard spine; a mapped n8n workflow still wins.
- Address normalization rejects ambiguous/header-injection input. Mailbox addresses
  are rechecked before every inbound/outbound write.
- When interpreting scheduling intent, an explicit customer-requested time wins over
  ambiguity in quoted text or message headers.
- The server adapter only exposes healthy simulated capability for sandbox-shaped
  records with a usable mapped mailbox. Existing production-shaped seed data is
  projected fail closed.
- No public email callback or customer email control was added in this phase.

## Live hard stop

`EMAIL_PROVIDER_MODE=live` is deliberately rejected. Do not add/connect Gmail
OAuth, request scopes, create watch/Pub/Sub resources, add a public webhook,
configure secrets, perform live send/read, apply the migration remotely, deploy,
or certify Gmail without an explicitly approved phase. Auth.js email magic-link
sign-in is separate and remains disabled.

See `docs/email-provider-readiness.md` for contracts, evidence, and remaining gates.
