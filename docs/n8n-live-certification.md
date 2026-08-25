# n8n staging live-certification runbook

This runbook certifies the real n8n boundary against the isolated staging
deployment. It never targets production. Complete it in order and retain the
evidence named in the final section.

## 1. Environment prerequisites

- Staging origin: `https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app`
- Staging Supabase ref: `jhkbsfsbnynysplvnwca`
- Certification workspace: `ws_coastal_bloom`
- Vercel Preview variables are restricted to Git branch `staging`.
- The n8n instance is staging-only, current, backed up, and reachable through a
  permanent HTTPS hostname.
- A platform operator and a Coastal Bloom owner can sign in to staging.

Do not continue if any value points at production project
`rkzwubwogtezqbuhieuo` or production origin
`https://ai-receptionist-dashboard-jade.vercel.app`.

## 2. Staging-only safety check

Pull branch-scoped Preview variables into a temporary local file, never a
tracked file. Confirm `AUTH_URL`, `DATABASE_URL`, and the Git branch before
enabling a provider. Do not place `MIGRATION_DATABASE_URL` in Vercel.

Run the read-only preflight after `N8N_MODE=live` and the n8n variables have
been added to the `staging` Preview branch:

```text
npm run n8n:preflight -- --workspace ws_coastal_bloom --expected-origin https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app --expected-project-ref jhkbsfsbnynysplvnwca
```

It reads configuration and workflow mappings, makes no n8n request, changes no
row, and never prints a secret.

## 3. n8n URL and credential requirements

- `N8N_BASE_URL` is the permanent public HTTPS instance base.
- Activate every workflow before using its production webhook URL. Test webhook
  URLs are not certification evidence.
- The outbound webhook path is `webhook/<URL-encoded workflowRef>` below the
  configured base.
- The app callback is exactly:
  `https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app/api/internal/n8n/events`.
- Keep provider credentials inside n8n or the server-side Vercel secret store;
  never add them to workflow payloads or browser-readable variables.

Run the n8n security audit (`n8n audit`, or the authenticated `/audit` API) and
save the summary. Resolve unprotected webhooks, risky nodes, unused credentials,
and missing security settings before certification.

## 4. Signing secrets

Create two independent random values of at least 32 characters:

- `N8N_REQUEST_SIGNING_SECRET`: app to n8n
- `N8N_WEBHOOK_SIGNING_SECRET`: n8n to app

The signing input is `v1:<unix-seconds>:<exact-raw-body>`. Send the digest as
`x-receptionist-signature: v1=<hex-hmac-sha256>` and the timestamp as
`x-receptionist-timestamp`. n8n must verify outbound app requests before parsing
or acting. Its inbound requests must sign the exact JSON bytes it sends. Never
log either secret or the signed raw body.

## 5. Workflow mappings

Using a read-only `app_runtime` session with `search_path=app`, verify:

```sql
select workspace_id, operation, capability, environment, status, workflow_ref
from workflow_mappings
where workspace_id = 'ws_coastal_bloom'
order by capability, operation nulls first;
```

Certification requires active staging mappings for `appointment.reschedule`,
`appointment.cancel`, `customer.message`, and `business.sync`, plus an active
voice mapping used by signed inbound bookings. References must match the
activated n8n production webhook paths and remain globally unique. Change
mappings only in a reviewed transaction using the controlled migration/admin
credential; rerun the preflight afterward.

`appointment.book` has a mapping and automated coverage but no trusted product
call site today. Do not create a test-only endpoint. The live booking path for
this phase is the signed inbound `appointment.booked` event.

## 6. Non-destructive health check

As a platform operator, test the n8n connection from the admin integration
screen. Require a healthy result and a corresponding safe admin event. Confirm
that the business-facing Connections page says only that automation is healthy;
it must not expose n8n, its URL, workflow references, execution references, or
signing details.

## 7. Outbound reschedule

Reschedule a disposable future staging appointment. Verify one n8n execution,
one `integration_operations` row, the mapped workflow reference, `succeeded`
status, one local appointment update, and safe audit/integration events. Repeat
the identical request and prove no second external effect occurs.

## 8. Outbound cancellation

Cancel a different disposable future appointment. Verify the same operation,
idempotency, audit, and local-state evidence. A failed workflow must leave the
appointment uncancelled.

## 9. Outbound customer message

Send only to a reserved staging destination. Verify mapped-workflow-wins,
stable idempotency, one execution, and normalized failure behavior. Do not use a
real customer address or phone number.

## 10. Outbound business sync

Change a harmless staging business field and invoke the existing business-sync
path. Verify interval-based hours and active service IDs arrive, credentials do
not, and the operation is visible only to the operator.

## 11. Signed inbound booking

From the active voice workflow, send a unique `appointment.booked` envelope with
schema version 1, unique `eventId`, the mapped `workflowRef`, an offset-bearing
`occurredAt`, a fictional customer, and a future in-hours slot. Expect `202
accepted`, one receipt, one customer/appointment effect, and one audit event in
the resolved workspace.

## 12. Invalid signature

Replay the body with a changed byte or a deliberately invalid signature. Expect
`401 {"error":"unauthorized"}`, no database query-derived detail, and no receipt
or business mutation.

## 13. Stale or future timestamp

Sign the unchanged body with a timestamp more than five minutes in the past and
then in the future. Both must return the same `401` response and write nothing.

## 14. Unknown and inactive workflow references

Send one validly signed event using an unknown reference. Then temporarily mark
a disposable mapping inactive and send its validly signed event. Both must be
rejected as unrecognised and must not mutate tenant data. Restore only the
disposable mapping and rerun preflight.

## 15. Duplicate and concurrent redelivery

Deliver one valid envelope three times sequentially, then repeat with a new
event ID from concurrent n8n branches. Each event ID may create exactly one
business effect. Redeliveries return `200 duplicate` with the original receipt.

## 16. Tenant isolation

Use Coastal Bloom's signed, mapped workflow reference while adding a
`workspaceId` claim for Harbour Dental; the claim must be ignored. Attempt to
cancel a Harbour appointment through the Coastal mapping; expect `unknown
appointment` and no Harbour mutation. Repeat in the opposite direction using a
properly provisioned Harbour staging workflow before certifying that tenant.

## 17. Timeout and normalized failures

Point one disposable mapping at a workflow that intentionally exceeds
`N8N_TIMEOUT_MS`, then at workflows returning 401, 500, non-JSON 200, and
`{"status":"failed"}`. Verify bounded completion, the correct failed or
retryable state, safe business messages, operator-only detail, and no raw body,
host, credential, or stack exposure.

## 18. `sync_required` fault injection

In the isolated test schema, force the local commit to fail after a confirmed
external success. Verify the operation becomes `sync_required`, is not
auto-retried, appears in the operator reconciliation queue, and retains only
safe diagnostic detail. Do not inject this fault into staging application data.

## 19. Admin operation visibility

Inspect `/admin/workflows` and `/admin/integrations` as the platform operator.
Confirm operation status, attempts, safe errors, timestamps, and correlations
are available. Owners, managers, and staff must receive Access denied.

## 20. Client infrastructure-leak and secret audit

Run:

```text
npm test -- --run src/services/client-boundary.test.ts src/server/integrations/n8n/orchestration.test.ts
npm run audit:client-secrets
```

Inspect browser payloads and console output for provider URLs, workflow IDs,
execution IDs, HMAC headers, database URLs, and secrets. Any leak is a blocker.

## 21. Cleanup

- Restore changed disposable mappings and staging business data.
- Keep certification receipts, operation rows, integration events, and audit
  history; they are evidence, not cleanup targets.
- Remove temporary local environment files securely.
- Leave `N8N_MODE=live` only if every required test passed and monitoring has an
  owner. Otherwise set the branch-scoped value back to `disabled` and redeploy
  staging.
- Never copy these values to Production.

## 22. Final evidence

Record the Vercel deployment ID/commit, n8n version and workflow versions,
workflow mapping query, preflight output, security-audit summary, test event and
operation IDs, HTTP outcomes, screenshots of operator/business boundaries,
runtime error scan, cleanup result, and the exact failed or passed checklist.

Only then change n8n from **SIMULATOR VERIFIED / EXTERNALLY BLOCKED** to **LIVE
VERIFIED**. Transport success alone is insufficient; every workflow must prove
its domain result and idempotency behavior.
