# n8n

Status: application-side integration and readiness are complete. Real staging
certification is the current next phase and remains externally blocked.

- n8n is orchestration; Supabase remains application-domain source of truth.
- An active workspace-scoped mapped workflow wins over a direct provider adapter.
- The browser cannot name or select workflow IDs, webhook URLs, or workflow references.
- Outbound requests use the signed application contract. Inbound events use signed,
  freshness-checked envelopes and the shared inbound pipeline.
- Resolve inbound tenancy from the trusted, globally unique `workflowRef` mapping, never
  from a payload workspace claim.
- Inactive mappings have no inbound authority. Disabling one makes its reference
  unrecognised until deliberately restored.
- Durable database uniqueness and operation rows arbitrate idempotency and concurrent
  redelivery.
- Confirmed external success followed by local authoritative write failure becomes
  `sync_required` and is not automatically retried.
- `npm run n8n:preflight` is read-only: it validates staging configuration and mappings,
  makes no n8n request, changes no rows, and prints no secrets.
- Follow `docs/n8n-live-certification.md` for the ordered live runbook; do not copy its
  checklist here.
- Outbound `appointment.book` remains **AUTOMATED ONLY** until a trusted product call site
  exists. Current live booking certification uses signed inbound `appointment.booked`.
- Do not claim **LIVE VERIFIED** until real staging n8n traffic proves the complete domain
  result, security boundary, idempotency, failure behavior, and cleanup.
