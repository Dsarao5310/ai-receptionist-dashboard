# Production readiness handoff

Audit date: 2026-08-22 (America/Vancouver)

## Decision

**NO-GO for a real client launch.** Authentication, tenant isolation, staging,
database persistence, and Google Calendar have strong evidence. The product is
still missing live voice/model capability, live n8n and Twilio certification,
monitoring, recovery proof, and privacy/operational controls.

## Status matrix

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Supabase persistence | LIVE VERIFIED | Production-shaped and isolated staging projects use private `app`/`app_test` schemas, separate runtime/migrator roles, migrations through `0011`, tenant-binding constraints, and verified least privilege. |
| Auth.js | LIVE VERIFIED | Google OAuth, account selection, session persistence, sign-out, and safe continuation passed over hosted HTTPS. Auth.js remains the only authentication system. |
| RBAC | LIVE VERIFIED | Coastal owner, manager, staff, Harbour owner, and platform operator passed their hosted staging route matrix. |
| Tenancy | LIVE VERIFIED | Ordinary users saw only their workspace; the operator switched between both; cross-workspace reads/mutations remain server-scoped and database-tested. |
| Isolated staging | LIVE VERIFIED | Stable branch alias, separate OAuth client, separate Supabase project, branch-scoped Preview secrets, five real identities, and deployment `dpl_2YM2FkEQ3MPEjv5PeEqzhpfDME3E` at commit `96a124d` are verified. |
| Production deployment | LIVE VERIFIED | Fail-closed production artifact `dpl_BEFqRuNxs5qNveGnyV6XqEnhPvwT` remains READY. This pass does not alter or redeploy production. |
| Google Calendar | LIVE VERIFIED | Real OAuth, encrypted token storage, CRUD, reconciliation, tombstone/replacement behavior, tenant isolation, idempotency, and `sync_required` behavior were verified previously. |
| n8n | EXTERNALLY BLOCKED | Architecture and simulator coverage exist. Real instance URL, independent signing secrets, activated staging workflows/mappings, and execution of `n8n-live-certification.md` remain. |
| Twilio | EXTERNALLY BLOCKED | Implementation and simulator tests pass; the account has no owned SMS-capable number and live callback certification is outstanding. |
| Vapi | NOT STARTED | No adapter, assistant/phone mapping, webhook lifecycle, call certification, or credentials. See `vapi-readiness.md`. |
| Gmail/email provider | NOT STARTED | No real adapter, provider OAuth/send lifecycle, or event certification. Auth.js email magic links remain deliberately disabled. |
| Pinecone/knowledge provider | NOT STARTED | No live adapter, indexing lifecycle, namespace certification, or credentials. |
| Model provider | NOT STARTED | No model policy, keys, latency/cost controls, evaluation, or live certification. |
| CI | COMPLETE | Non-deploying GitHub Actions installs on pinned Node 20, then runs typecheck, lint, credential-free tests, fail-closed build, and client-secret audit. Database-backed tests remain a protected staging release gate. |
| Monitoring | NOT STARTED | No production error tracker, trace/log drain, uptime monitor, or provider health dashboard with an owner. |
| Alerting | NOT STARTED | No paging route, severity policy, acknowledgement target, or escalation schedule. |
| Backups/recovery | PARTIAL | Forward-only and isolated restore procedures are documented; no isolated restore drill has been executed. |
| Security | PARTIAL | Tenant hardening, private schemas, credential rotation, bounded webhooks, safe redirects, client-secret audits, and focused tests exist; recurring scanning and operational response are not complete. |
| Performance | NOT STARTED | No production load, concurrency, latency-budget, or capacity certification exists. |
| UI/mobile/accessibility | PARTIAL | Core hosted role flows passed, but comprehensive mobile, keyboard, screen-reader, loading, failure, and retry QA is incomplete. |
| Privacy/compliance | NOT STARTED | Retention/deletion, recording consent, access review, privacy terms, and regulatory review are unresolved. |
| Onboarding/offboarding | PARTIAL | Staging identity and membership provisioning is proven; client onboarding, revocation/offboarding, support ownership, and escalation are not end-to-end certified. |

## Current verified deployment evidence

- Staging origin:
  `https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app`
- Staging deployment: `dpl_2YM2FkEQ3MPEjv5PeEqzhpfDME3E`, commit
  `96a124d`, READY.
- Production origin: `https://ai-receptionist-dashboard-jade.vercel.app`
- Production deployment: `dpl_BEFqRuNxs5qNveGnyV6XqEnhPvwT`, commit
  `7566124`, READY and unchanged by this pass.
- Staging Google matrix: Coastal owner/manager/staff, Harbour owner, and platform
  operator; operator switching, cross-tenant isolation, account selection, and
  sign-out passed with no Vercel runtime errors during the test window.

## n8n readiness

The browser cannot name a workflow. Authorized semantic operations resolve an
active workspace mapping; a mapped workflow wins over a direct adapter. The
operation row and stable workspace-scoped idempotency identity exist before the
external request, requests have an explicit timeout, and failures are
normalized. Inbound processing follows signature, schema, trusted workflow-ref
tenant resolution, database uniqueness, and a single transaction. Inactive
workflow mappings no longer authorize inbound mutation.

Run the read-only preflight, then the ordered live runbook:

```text
npm run n8n:preflight -- --workspace ws_coastal_bloom --expected-origin https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app --expected-project-ref jhkbsfsbnynysplvnwca
```

Live certification remains blocked on the real n8n URL, two independent signing
secrets, and activated staging workflow references. `appointment.booked` is the
current inbound booking contract; outbound `appointment.book` remains automated
only until a trusted product call site exists.

## Release gates

For every release: focused changed-area tests, typecheck, lint, full tests where
the isolated database is available, fail-closed build, client-secret audit,
Preview browser verification, migration status, and runtime error scan. CI does
not deploy and does not receive production or provider credentials.

## Verification for this pass

- Focused n8n, production-configuration, inbound-pipeline, and client-boundary
  suite: 6 files, 96 tests passed.
- Calendar/n8n compatibility regression suite: 2 files, 88 tests passed.
- Consolidated suite: 25 files, 437 tests passed, including the hosted staging
  database-backed groups.
- TypeScript and lint passed.
- The fail-closed Next.js production build passed with synthetic non-secret
  configuration and all provider modes disabled.
- The generated-client audit passed across 50 artifacts without printing secret
  values.
- No deployment, provider, production variable, migration, or database row was
  changed by this pass.

## Shortest path to a limited pilot

1. Provision and live-certify n8n using `n8n-live-certification.md`.
2. Obtain an SMS-capable Twilio number and execute the existing Twilio runbook.
3. Implement and independently certify Vapi plus a model provider.
4. Add monitoring, alert ownership, uptime checks, and execute an isolated
   restore drill.
5. Finalize privacy/recording/retention policy and onboarding/offboarding.
6. Complete mobile/accessibility/failure-state QA and run a controlled internal
   pilot before any real client.

## Rollback rule

Database migrations remain forward-only. Capture a verified backup, record the
prior deployment ID, and prove application rollback compatibility before every
production release. Never run `db:reset` against staging or production-shaped
data. Follow `operations-runbook.md`.
