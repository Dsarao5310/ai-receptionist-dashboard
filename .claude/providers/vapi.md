# Vapi

Status: **APPLICATION-READY + SIMULATOR VERIFIED** for inbound call lifecycle
events. No Vapi account, assistant, phone, credential, webhook registration, or
live call is connected.

## Implemented

- `VAPI_MODE` is explicit and production refuses `simulated`.
- API and webhook credentials resolve only through the server credential store.
- `/api/internal/vapi/events` accepts authenticated `status-update` and
  `end-of-call-report` messages through the shared bounded inbound pipeline.
- Tenancy resolves from globally unique, server-owned assistant and voice-phone
  mappings. Payload workspace metadata has no authority; conflicting resources
  are rejected.
- Postgres arbitrates duplicate deliveries and stores monotonic provider event
  time so older events cannot regress a terminal call.
- Existing conversation/call records hold normalized summary, transcript,
  duration, status, and safe terminal reason. Raw payloads and provider resource
  ids do not enter client DTOs.
- Recording URLs are deliberately not persisted.
- The local privacy foundation now creates tenant-bound call privacy state,
  enforces explicit consent before any future recording locator can be stored,
  orders consent events, supports erasure/expiry, and redacts sensitive call
  content from staff payloads. Vapi still does not call the recording-storage
  gate.
- The local daily privacy purge scheduler is bearer-authenticated,
  lease-protected, bounded, and disabled by default. Its code and Vercel cron
  definition are deployed, but it is not enabled, remotely migration-verified,
  live-certified, or connected to an external monitor.

## Still required

- Provision isolated staging Vapi resources and custom bearer credential without
  placing secret values in chat or database config JSON.
- Implement outbound API use, tool calls and operation correlation only as a
  separately assigned phase.
- The model-provider application foundation now exists and is simulator
  verified; live-certify it independently before connecting it to Vapi.
- Obtain business/legal approval for consent wording and retention values, add a
  monitored purge schedule and administration workflow, apply the migration in
  isolated staging, and certify the privacy controls before enabling recording
  ingestion. See `docs/privacy-readiness.md`.
- Execute live webhook, call, failure, cleanup, and tenant-isolation certification.

Never describe the current simulator evidence as a live Vapi connection.
