# Vapi readiness

Status: **APPLICATION-READY + SIMULATOR VERIFIED** for the inbound call
lifecycle foundation. No Vapi account, assistant, phone number, credential,
registered webhook, live-certified model provider, or live call is connected.
The separate model-provider application foundation is simulator verified but is
deliberately not wired into Vapi in this phase.

## Implemented contract

- `VAPI_MODE=disabled|simulated|live`; production rejects `simulated`.
- Live configuration requires a private API key, a 32+ character webhook bearer
  token, and the exact HTTPS callback `/api/internal/vapi/events` on `AUTH_URL`.
- Vapi server messages use the current `{ message: { type, call, ... } }`
  envelope and bearer custom-credential authentication documented by Vapi.
- `status-update` and `end-of-call-report` are versioned as inbound schema 1.
- All bodies are bounded to 1 MiB before JSON parsing.
- Provider timestamps must carry a UTC offset; server-local time is never guessed.

Current Vapi references:

- [Server authentication](https://docs.vapi.ai/server-url/server-authentication)
- [Server events](https://docs.vapi.ai/server-url/events)

## Tenant and persistence boundary

- `vapi_assistants.assistant_id` is globally unique.
- Vapi phone resources reuse `provider_phone_numbers`; provider resource ids are
  globally unique per provider and voice mappings must be enabled.
- Assistant and phone mappings must agree when both are present. Unknown or
  conflicting mappings are permanently rejected.
- Payload `workspaceId`, metadata, provider organization data, or customer speech
  never authorizes tenancy.
- The shared inbound pipeline performs authentication, schema validation,
  trusted tenant resolution, Postgres idempotency, one transaction, integration
  event, and append-only audit.
- Call state records provider event time. Older or late `in-progress` messages
  cannot regress `completed`, `missed`, or `failed` terminal state.
- Final reports may update normalized summary and transcript lines. Raw payloads,
  assistant ids, phone resource ids, private diagnostics, and recording URLs do
  not enter client DTOs.
- Each new call now receives tenant-bound privacy state and a bounded transcript
  expiry. Recording storage remains unused and requires explicit granted consent
  if a future provider adapter invokes it.
- A disabled-by-default daily purge scheduler now exists locally with dedicated
  bearer authentication, an expiring database lease, bounded work, and
  sanitized execution history. Its code and cron definition are deployed, but
  the mode remains disabled. The schema is in the verified 17-file remote
  checkpoint; the secret, monitoring, purge execution, and live behavior are not
  certified.

## Verified evidence

On 2026-08-24, production code was exercised with deterministic signed Vapi
fixtures against the isolated Postgres test schema:

- invalid bearer rejection before database access;
- payload-workspace tampering ignored;
- cross-tenant assistant/phone mapping conflict rejected;
- duplicate delivery applied once through database uniqueness;
- final summary/transcript/duration persistence;
- older lifecycle event refused from regressing terminal state;
- recording URL omitted and provider identifiers absent from client call DTOs.

The latest full repository result is 477/477 tests across 29 files, plus
typecheck, lint, a successful 24-route production build, and a 48-artifact
client-secret audit. The privacy/Vapi/client focused gate passed 51/51 tests.

## Not implemented or certified

- Live API requests, webhook registration, or real calls.
- Assistant or phone provisioning UI/workflow.
- Outbound calling, `assistant-request`, tool calls, transfers, or appointment
  side effects.
- Model selection, latency/cost policy, evaluation, or safety certification.
- Partial/live transcript streaming.
- Recording ingestion, approved consent wording/retention, enabled purge
  execution, or live privacy certification.
- Live retry behavior, provider outage semantics, operator diagnostics, or
  cleanup certification.

Live readiness requires staging-only Vapi resources, environment-isolated
credentials, an independently certified model provider, approved privacy
policy, monitored purge execution, and the full hostile live matrix. The local
privacy foundation is database-test verified only; neither it nor Vapi is LIVE
VERIFIED.
