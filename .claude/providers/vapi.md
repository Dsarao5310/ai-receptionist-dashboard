# Vapi

Status: **NOT STARTED**. `docs/vapi-readiness.md` is architecture guidance only.

- Use a trusted, globally unique assistant/phone-to-workspace mapping. Payload workspace
  claims must not authorize calls.
- Model a durable call lifecycle richer than the shared integration-operation state:
  call start, end, provider failure, transcript updates, summary, recording metadata,
  and late or out-of-order events.
- Treat provider callbacks as the source of semantic lifecycle state; HTTP acceptance
  alone does not prove call success.
- Tool and business operations such as booking, rescheduling, cancellation, and messaging
  must pass through authenticated server/n8n boundaries with stable operation identity.
- Enforce tenant isolation, replay/idempotency handling, consent, retention, deletion, and
  client-safe DTO redaction.
- Reuse shared provider plumbing without stretching its operation state machine into an
  unnatural substitute for the Vapi call lifecycle.
- Do not implement or connect Vapi until explicitly assigned.
