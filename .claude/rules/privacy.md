# Call Privacy

Read this file for call recording, transcript, consent, retention, sensitive
access, or erasure work.

## Current boundary

- Recording provider ingestion is disabled. Vapi must continue to omit all
  recording URLs until a separately assigned live-integration phase.
- `workspace_privacy_policies` is fail closed: recording defaults to `disabled`.
- Explicit-consent mode requires meaningful notice text, but that text and the
  final retention values still require business/legal approval.
- Default technical ceilings are 90 days for transcripts and 30 days for
  recordings; configured values are bounded to 1–365 and 1–90 days.

## Authority and access

- Staff may see operational call records but not raw transcripts, transcript
  previews, or summaries.
- Managers, owners, and platform operators may view sensitive call content in
  an authorized workspace.
- Only owners and platform operators may change privacy policy or explicitly
  erase sensitive call content. Server enforcement is mandatory; UI hiding is
  not authorization.
- The business Settings Privacy tab may receive only the safe policy DTO and
  disabled/scheduled status. It must not receive provider configuration, cron
  secrets, recording locators, run-ledger internals, or raw errors.
- Global purge health belongs only on the server-rendered `/admin/privacy`
  platform-operator route. Authorize the operator before reading the ledger and
  expose only sanitized run id/status/timing/counts/error code plus lease
  freshness. Never include workspace ids, content, locators, provider payloads,
  raw errors, or secrets.
- Keep the operations-health page read-only. Do not add run-now, retry,
  enablement, or lease mutation controls, and never describe in-app status as
  external monitoring or alerting.
- Every query and mutation stays bound to an authorized workspace. A foreign
  call id must resolve as not found and must not create a misleading audit row.
- Administrative erasure must use a durable `privacy_erasure_requests` record.
  Do not add a direct Server Action or service shortcut around the request
  state machine.
- Identity verification is an out-of-band fact recorded by method, actor, and
  time. An app checkbox or typed deletion phrase is operator attestation or
  destructive confirmation only; never describe either as identity proof or
  reauthentication.
- Request rows accept only a constrained internal reference. Never add
  requester name, email, phone, free-text notes, transcript, recording locator,
  or provider payload fields to the request table or audit metadata.
- Completion requires `verified` state and exact fresh `ERASE <request-id>`
  confirmation. Complete the content erase and state transition atomically;
  completed/rejected requests and their audit chain remain non-deletable.

## Consent and storage

- Consent evidence is append-only and minimal: decision, source, policy version,
  actor when applicable, and timestamp. Never store raw customer wording,
  provider payloads, prompts, or audio as consent evidence.
- A recording locator may be stored only when workspace mode is
  `explicit_consent` and the call's latest consent projection is `granted`.
- Consent updates are ordered by provider timestamp. A delayed grant must never
  supersede a later denial or withdrawal.
- Recording locators remain server-only and must never enter client DTOs,
  logs, audit metadata, analytics, or error messages.

## Retention and erasure

- Expiry or explicit erasure clears transcript messages, summary, transcript
  preview, recording locator, and recording duration as applicable.
- Preserve the minimal operational record: call timing/status, intent, outcome,
  appointment link, consent evidence, and append-only audit history.
- Denial or withdrawal immediately erases both transcript and recording
  content. Never reopen eligibility from an older consent event.
- Purge workers use bounded batches and `FOR UPDATE SKIP LOCKED`. The local
  daily Vercel Cron foundation is disabled by default, requires a dedicated
  bearer secret when scheduled, prevents overlap with an expiring database
  lease, and records aggregate run history without tenant or content detail.
- Use `privacy:preflight` only against an explicitly confirmed isolated staging
  project. It must authenticate as `app_runtime`, remain read-only, verify all
  three privacy migration ledger entries and exact runtime grants, print no
  credential values, and reject the production project.
- Do not enable scheduled mode unless all three privacy migrations are applied,
  `CRON_SECRET` is configured separately with 32+ characters, the disabled
  deployment has been verified first, and an operator owns run/failure review.
- External metrics, alerting, retry escalation, remote execution, and recovery
  certification are not implemented.

## Evidence language

The current foundation is **APPLICATION-READY + DATABASE-TEST VERIFIED** only.
It is not deployed, remotely migrated, legally approved, externally monitored,
provider-connected, or live certified. The scheduler is local/database-test
verified only and remains disabled by default.
