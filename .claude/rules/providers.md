# Shared Provider Rules

- Keep provider-specific translation behind the shared server-side provider framework.
  Reuse `IntegrationAdapter`, the shared inbound pipeline, `runWorkflowOperation`,
  `commitWithSyncGuard`, `SecretStore`/`credentialStore`, provider-time normalization,
  normalized errors, capability dependencies, and audit infrastructure.
- The inbound pipeline order is authentication/signature, schema validation, trusted
  tenant resolution, database-arbitrated idempotency, transaction, safe events, and audit.
- Credentials and raw provider payloads remain server-only. Client DTOs expose business
  capabilities, not provider infrastructure.
- Operation state and idempotency are durable. Database uniqueness, not check-then-act,
  arbitrates duplicates and concurrent delivery.
- Normalize provider errors and timestamps at adapter boundaries. Offsetless time must
  not silently inherit browser or server timezone.
- Validate provider semantic success in the provider-specific lifecycle; transport success
  alone is insufficient.
- Any authoritative local write after confirmed external mutation must use the sync guard.
  On failure, settle as `sync_required` and refuse automatic replay of the side effect.
- Keep platform diagnostics and client capability summaries separate at server boundaries.
  Audit important mutations without secrets or raw customer/provider payloads.
- Connection health and feature-enabled state are separate; derive client capability state
  from normalized integration data rather than duplicate mutable flags.
- Do not force every provider into one lifecycle. Shared plumbing remains common while
  provider-specific asynchronous and semantic states stay in their provider module.
- For n8n-routable operations, an active mapped workflow wins over a direct adapter.
