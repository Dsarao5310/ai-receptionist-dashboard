# Gmail and Email

Status: **NOT STARTED**.

- Integrate email through authenticated server/n8n and shared provider boundaries.
- Preserve durable mailbox, thread, and message identity without exposing raw provider
  internals to business clients.
- Resolve tenancy from trusted server mappings, never an email payload workspace claim.
- Use database-backed idempotency for inbound delivery and outbound side effects.
- When interpreting scheduling intent, an explicit customer-requested time wins over
  ambiguity in quoted text or message headers.
- Client UI says Email and exposes business-safe state, not provider credentials, IDs,
  raw headers, workflow references, or errors.
- Do not implement or connect Gmail until explicitly assigned.
