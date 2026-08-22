# Vapi readiness analysis

Status: **NOT STARTED**. This is architecture guidance only; no Vapi account,
assistant, phone number, credential, webhook, or live call is connected.

## Reuse without modification

Vapi must use the existing server-side provider framework:

- `IntegrationAdapter` for connection, health, and safe capability projection;
- `credentialStore` / `SecretStore` for server-only credentials;
- the shared inbound pipeline for authentication, schema validation, trusted
  tenant resolution, database-arbitrated idempotency, transaction, events, and
  audit;
- `runWorkflowOperation` and `commitWithSyncGuard` for booking side effects and
  `sync_required` handling;
- provider-time normalization and normalized errors;
- server authorization plus platform/business UI separation.

## Vapi-specific domain work

- A globally unique trusted mapping from Vapi assistant/phone identifiers to a
  workspace. Payload `workspaceId` must never authorize a call.
- Versioned schemas for call started, call ended, transcript updates, recording
  metadata, tool calls, and provider delivery/status events.
- A durable call lifecycle that tolerates events arriving late, duplicated, or
  out of order without regressing terminal state.
- Provider semantic success from Vapi callbacks, not HTTP acceptance alone.
- Tool-call correlation to stable operation IDs for booking, rescheduling,
  cancellation, and customer messaging.
- Explicit recording/transcript consent, retention, deletion, and access rules.
- Client-safe call DTOs that omit assistant IDs, phone mappings, webhook data,
  credentials, execution references, raw prompts, and provider errors.

## Required future certification

Certify signature failure, stale/replayed delivery, unknown assistant/phone,
cross-tenant tool calls, duplicate/out-of-order lifecycle events, partial
transcripts, recording availability/failure, tool timeout, provider-declared
failure, `sync_required`, client leakage, operator diagnostics, and cleanup.
Select and certify the model provider separately; Vapi transport readiness does
not certify model quality, latency, cost, or safety.
