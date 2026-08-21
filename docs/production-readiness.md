# Production readiness handoff

Audit date: 2026-08-21 (America/Vancouver)

## Decision

**NO-GO for a real client launch.** The fail-closed application build is healthy,
but the receptionist's core live providers, production deployment controls, and
credential hygiene are not ready. Do not expose the current environment to a
client.

## Status matrix

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Auth.js, durable roles, tenant authorization | Deployment foundation ready in code | Production validation, canonical redirects, secure-cookie configuration, Proxy coverage, continuation handling, and identity/tenant tests exist. Real Google credentials and HTTPS end-to-end validation are still required. Email magic links fail closed until an Auth.js adapter exists. |
| Supabase schema | Ready in current environment | Migrations `0001` through `0009` are applied; runtime and migration credentials are separated. |
| Google Calendar | Live-validated | OAuth, encrypted token storage, CRUD, reconciliation, tombstone repair, tenant isolation, and idempotency are covered. Production redirect/callback URLs still need deployment values. |
| n8n | Simulator-verified only | Mappings and signed/idempotent contracts exist. `N8N_BASE_URL` and provisioned production workflows are missing. |
| Twilio | Built, simulator-verified only | Signed webhooks, delivery lifecycle, tenant mapping, idempotency, and partial-failure handling pass. Account owns no SMS-capable number; public callbacks and live certification are missing. |
| Vapi voice | Not implemented | Fails closed; no real adapter, assistant, number, webhook lifecycle, or live certification. |
| Gmail/email | Not implemented | Fails closed; no real adapter, OAuth/send lifecycle, webhook/event handling, or live certification. |
| Pinecone/knowledge | Not implemented | Fails closed; no real adapter, indexing lifecycle, tenant namespace validation, or live certification. |
| Model provider | Not implemented | Fails closed; no real adapter, keys, model policy, cost/latency controls, or live certification. |
| Security scan | Fixed locally | Four findings were remediated: mock success, unbounded webhook bodies, optional Twilio status callback, and open redirect. Exposed database credentials were independently rotated and invalidated on 2026-08-21. |
| CI/CD and deployment | Repo foundation ready; external setup blocked | `check`, `deploy:check`, `deploy:build`, and client-secret audit commands exist with a deployment runbook. No staging/production host, domain, secret store, migration job, or rollback proof exists yet. |
| Observability and recovery | Blocked | No production error tracking, alert routing, uptime checks, backup restore drill, or incident runbook. |
| Privacy/compliance | Blocked | No finalized retention/deletion policy, consent/disclosure review, access review, or client-facing privacy terms. |
| Onboarding and operations | Blocked | No tested client onboarding/offboarding, human escalation, support ownership, or live-provider runbooks beyond Calendar/Twilio. |

## Verified gates

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 24 files and 428 tests passed in 500.05 seconds on the final Auth.js/deployment tree.
- Final focused projection/tenant regression: 3 files and 55 tests passed.
- `npm run typecheck` and `npm run lint`: passed after the final route gates.
- `npm run deploy:build`: production configuration gate and Next.js build passed with n8n, Google Calendar, and Twilio explicitly disabled.
- `npm run audit:client-secrets`: passed across 50 browser-readable build artifacts; values were never printed.
- Local browser QA: safe continuation, owner/staff/operator role gates, operator workspace switching, sign-out, and protected back-navigation passed with no browser console warnings/errors. Real HTTPS and Google OAuth remain unverified.
- Read-only database verification: all nine migrations applied and the recorded
  `ws_coastal_bloom` workflow mappings were already restored exactly.
- Read-only Twilio verification: the trial account owns zero phone numbers.

The production build deliberately disables unfinished providers. This proves the
fail-closed deployable path; it does not certify provider functionality.

## Security changes in this audit

- Server provider registration now fails closed for every unimplemented provider.
- Dashboard loading projects stale durable rows through the active server adapter,
  so unavailable or disabled providers cannot render as operational.
- A connect action records success only after semantic connected/healthy state.
- n8n request bodies are capped at 256 KiB; Twilio request bodies at 64 KiB.
- Twilio live mode requires a public inbound URL and dedicated status callback,
  and live sends always request delivery updates.
- Sign-in continuation targets accept only safe same-origin paths.
- Production configuration requires a canonical public HTTPS Auth URL and public
  HTTPS provider callbacks; localhost and temporary tunnel hosts are rejected.

## Database credential exposure: resolved 2026-08-21

The exposed `app_runtime` and `app_migrator` passwords were independently
replaced with strong generated credentials. The immediately retired credential
for each role was explicitly rejected through direct Postgres authentication,
and the final replacements were verified through the configured transaction and
session poolers. Only `.env.local` required an update; no staging, hosting, or CI
secret store exists yet. Exact-value and connection-string scans found no unsafe
repository or build-output copies. Chat/tool history remains outside repository
control; invalidation is the remediation for those inaccessible copies.

Least privilege was reverified: `app_runtime` cannot create schema objects,
cannot own `app`, cannot create roles/databases, has no superuser, replication,
or BYPASSRLS attribute, and cannot update/delete audit history. `app_migrator`
retains schema ownership and transactional DDL without superuser, role-creation,
database-creation, replication, BYPASSRLS, or runtime-role membership. The
provider-secret encryption master key was not changed.

## Shortest path to a limited pilot

1. Follow `docs/deployment-foundation.md`: choose staging and production
   hosting, configure `AUTH_URL`, Google sign-in, trusted HTTPS callbacks,
   environment separation, and access controls, then execute the HTTPS browser
   matrix.
2. Configure and end-to-end test a real Auth.js provider. Do not enable email
   magic links until durable Auth.js verification-token persistence is proven.
3. Provision n8n and certify every mapped workflow using real webhook delivery,
   failure, retry, duplicate, and timeout paths.
4. Claim an SMS-capable Twilio number and execute
   `docs/twilio-live-certification.md`, including delivery failure and callback
   verification.
5. Implement and independently certify Vapi plus the selected model provider.
   Voice is the product's core path; without these, this is not an AI receptionist.
6. Add CI gates for typecheck, lint, the database-backed suite, migration status,
   and production build; require them before deployment.
7. Add production monitoring, alert ownership, uptime checks, backup/restore
   validation, rollback practice, retention/deletion policy, and incident response.
8. Run real browser QA for owner, manager, staff, and platform-operator flows;
   include mobile, accessibility, failure states, loading, and retry recovery.
9. Run a controlled internal pilot before onboarding a real client.

## Rollback and recovery rule

Database migrations remain forward-only. Before each release, capture a verified
backup, record the prior deploy identifier, and test application rollback against
the migrated schema. Never use `db:reset` on a production-shaped database.
