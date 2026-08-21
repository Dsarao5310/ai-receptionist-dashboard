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
| Auth.js, durable roles, tenant authorization | Production Google owner flow verified; broader role matrix remains | The canonical production origin is `https://ai-receptionist-dashboard-jade.vercel.app`. Google OAuth, durable identity resolution, an active Coastal Bloom Salon owner membership, protected-route persistence, owner/operator separation, sign-out, and safe deep-link continuation were exercised over real HTTPS. Manager, staff, platform-operator, and real cross-tenant hosted identities are still unavailable; their coverage remains automated rather than live. Email magic links remain disabled. |
| Supabase schema | Ready in current environment | Migrations `0001` through `0009` are applied; runtime and migration credentials are separated. |
| Google Calendar | Live-validated | OAuth, encrypted token storage, CRUD, reconciliation, tombstone repair, tenant isolation, and idempotency are covered. Production redirect/callback URLs still need deployment values. |
| n8n | Simulator-verified only | Mappings and signed/idempotent contracts exist. `N8N_BASE_URL` and provisioned production workflows are missing. |
| Twilio | Built, simulator-verified only | Signed webhooks, delivery lifecycle, tenant mapping, idempotency, and partial-failure handling pass. Account owns no SMS-capable number; public callbacks and live certification are missing. |
| Vapi voice | Not implemented | Fails closed; no real adapter, assistant, number, webhook lifecycle, or live certification. |
| Gmail/email | Not implemented | Fails closed; no real adapter, OAuth/send lifecycle, webhook/event handling, or live certification. |
| Pinecone/knowledge | Not implemented | Fails closed; no real adapter, indexing lifecycle, tenant namespace validation, or live certification. |
| Model provider | Not implemented | Fails closed; no real adapter, keys, model policy, cost/latency controls, or live certification. |
| Security scan | Fixed locally | Four findings were remediated: mock success, unbounded webhook bodies, optional Twilio status callback, and open redirect. Exposed database credentials were independently rotated and invalidated on 2026-08-21. |
| CI/CD and deployment | Production validated; isolated staging database ready | Vercel deployment `dpl_BEFqRuNxs5qNveGnyV6XqEnhPvwT` built commit `7566124` in `iad1` using `npm run deploy:build`. Production variables remain Production-only. Separate Supabase project `jhkbsfsbnynysplvnwca` is healthy, migrated through `0011`, seeded without real identities or provider secrets, and passed its security and focused database test gates. The `staging` Git branch/Preview origin, branch-scoped variables, staging OAuth client, migration job, browser matrix, and rollback proof remain. |
| Observability and recovery | Blocked | No production error tracking, alert routing, uptime checks, backup restore drill, or incident runbook. |
| Privacy/compliance | Blocked | No finalized retention/deletion policy, consent/disclosure review, access review, or client-facing privacy terms. |
| Onboarding and operations | Blocked | No tested client onboarding/offboarding, human escalation, support ownership, or live-provider runbooks beyond Calendar/Twilio. |

## Verified gates

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 24 files and 429 tests passed in 503.50 seconds against the
  isolated staging database on the current working tree.
- Final focused projection/tenant regression: 3 files and 55 tests passed.
- `npm run typecheck` and `npm run lint`: passed after the final route gates.
- Hosted `npm run deploy:build`: production configuration gate, TypeScript compilation, and Next.js 16.3.1 build passed on deployment `dpl_BEFqRuNxs5qNveGnyV6XqEnhPvwT`, with n8n, Google Calendar, and Twilio explicitly disabled.
- Current local `npm run deploy:build`: not re-certified because Node 24.19.0 fails before repository code runs with `uv_os_get_passwd ... ENOMEM`; the same failure reproduces with a one-line `os.userInfo()` process. This is recorded as a workstation-level blocker, not an application build failure.
- `npm run audit:client-secrets`: passed across 52 browser-readable build artifacts; values were never printed.
- Prior local browser QA: safe continuation, owner/staff/operator role gates, operator workspace switching, sign-out, and protected back-navigation passed with no browser console warnings/errors.
- Hosted HTTPS preflight on 2026-08-21: an unauthenticated request to the canonical `/sign-in` route returned `200 OK` with HSTS and private/no-store caching; the production UI exposed Google only, and Vercel runtime logs showed successful `GET`/`POST /sign-in` requests with no application errors.
- Hosted Google OAuth now completes through `https://ai-receptionist-dashboard-jade.vercel.app/api/auth/callback/google`. The real account resolved to an active, audited `owner` membership for Coastal Bloom Salon; the account menu displayed `Coastal Bloom Salon · Owner`.
- Hosted session behavior: a new protected navigation retained the authenticated identity, `/settings` returned `200`, and the platform-only `/admin/settings` rendered `Access denied` for the business owner.
- Hosted sign-out returned to `/sign-in`; a subsequent request to `/analytics?range=7d` redirected to `/sign-in?next=%2Fanalytics%3Frange%3D7d&reason=expired`, preserving only a same-origin continuation. Raw browser cookie storage was not inspected; Secure/httpOnly/SameSite settings remain code-and-build verified while persistence and invalidation are behaviorally verified.
- Focused post-deploy regression: 5 files and 66 tests passed (`identity-flow`, authorization, tenant isolation, production configuration, and safe redirects).
- Read-only database verification: all nine migrations applied and the recorded
  `ws_coastal_bloom` workflow mappings were already restored exactly.
- Read-only Twilio verification: the trial account owns zero phone numbers.

The production build deliberately disables unfinished providers. This proves the
fail-closed deployable path; it does not certify provider functionality.

## Hosted Auth.js verification — 2026-08-21

- Canonical production origin: `https://ai-receptionist-dashboard-jade.vercel.app`
- Vercel project: `ai-receptionist-dashboard` (`prj_Rw7kj3tAD3aJn2fmS3YuoupSRsRM`)
- Verified deployment: `dpl_BEFqRuNxs5qNveGnyV6XqEnhPvwT`, commit `7566124`, production, `iad1`
- Build command: `npm run deploy:build`; the Vercel log records the production configuration check before the Next.js build.
- Production `AUTH_URL`: corrected from the placeholder value to the canonical HTTPS origin and restricted to Production.
- Google provider: the exact production callback is registered and the authorization-code flow completes successfully.
- Development credentials provider: absent from the production sign-in UI.
- Runtime database boundary: the sign-in/session preflight no longer reports infrastructure unavailability after the environment repair.
- Staging/Preview: fail-closed but not provisioned. `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `N8N_MODE`, `GOOGLE_CALENDAR_MODE`, and `TWILIO_MODE` are scoped to Production only. The project has only Production deployments from `master`; no Preview deployment, staging branch, custom environment, or staging hostname exists. A future Preview therefore cannot inherit production credentials, but it also cannot pass the production configuration gate until independent staging values are supplied.
- Hosted real identity: the Google account is active, remains a platform `member`, and has one active `owner` membership for `ws_coastal_bloom`. The original workspace `owner_user_id` was not changed. The membership grant produced an append-only `membership.added` audit event.
- Hosted authorization: owner business access and platform-operator denial passed. Session persistence, sign-out invalidation, and safe protected-route continuation passed.
- Remaining hosted gaps: no real manager, staff, or platform-operator identities were supplied, and no second authorized real account exists for a live cross-tenant matrix. Those cases are not claimed from fixture identities; the focused automated authorization and tenant-tampering suite remains the evidence.

### Hosted role and tenant matrix

| Boundary | Certification | Evidence / blocker |
| --- | --- | --- |
| Coastal Bloom Salon owner | LIVE HTTPS VERIFIED | Real Google OAuth identity, durable owner membership, protected business routes, owner/operator separation, session persistence, sign-out invalidation, and safe continuation passed on the canonical production origin. |
| Manager | AUTOMATED ONLY / NOT AVAILABLE | Authorization and tenant tests pass; the only configured manager is a fixture `.example` identity that cannot complete Google OAuth. |
| Staff | AUTOMATED ONLY / NOT AVAILABLE | Authorization and tenant tests pass; the only configured staff member is a fixture `.example` identity that cannot complete Google OAuth. |
| Platform operator | AUTOMATED ONLY / NOT AVAILABLE | Operator workspace access and role-axis separation pass in automated coverage; the configured operator is a fixture `.example` identity. |
| Second tenant | AUTOMATED ONLY / NOT AVAILABLE | Bidirectional cross-tenant reads and mutations are rejected in the database-backed suite; no second real Google identity is provisioned for hosted testing. |

### Staging separation status

- Production safety boundary: complete for environment scoping. Preview no longer receives any production Auth.js secret, Google OAuth credential, database URL, or provider-mode value.
- Selected model: the existing Vercel project with a dedicated `staging` branch, stable branch alias, and branch-scoped Preview variables, backed by a separate Supabase staging project. A second Vercel project and paid custom environment are not justified.
- Live account audit: Preview branch tracking is enabled, Preview has no environment variables or deployments, custom Vercel environments require Pro, the Supabase organization has one production project and no branches, and the current quotes are $0/month for a separate project versus $0.01344/hour for a branch.
- Destructive-certification database: ready and isolated. The explicitly approved separate Supabase project `jhkbsfsbnynysplvnwca` is healthy in `ca-central-1`; `app_migrator` and `app_runtime` are separated, migrations `0001` through `0011` are applied, the guarded seed passed with two fixture workspaces and no real identity overrides, Security Advisor has 0 findings, and the fresh-project Performance Advisor has only 56 unused-index INFO notices.
- Reproducibility defect found and fixed: numbered migrations `0001` through `0009` initially lacked hardening present in production. Idempotent `0010_production_hardening_parity.sql` restores the composite tenant FKs, indexes, recursive sensitive-config guard, pinned function search paths, and function ACLs; `0011_twilio_fk_indexes.sql` covers the two later Twilio FKs. Staging and its disposable `app_test` schema received both; production was not modified.
- Isolation proof: staging contains exactly one staging marker and no non-fixture users, provider secrets, or OAuth states; production contains no staging marker and retains its known non-fixture user. No production data was copied into staging.
- Focused staging database suite: 5 files and 66 tests passed, covering Auth.js identity resolution, role authorization, bidirectional tenant tampering, runtime limits, production configuration, and safe redirects.
- Hosted staging remains incomplete: create/push the `staging` branch, record its stable Vercel branch alias, create a separate Google OAuth Web client, add branch-scoped Preview variables with a unique `AUTH_SECRET`, authorize real role/tenant identities, and run the HTTPS matrix.
- Provider modes must remain explicitly `disabled` in staging until each provider's own certification phase begins.
- Do not reuse the production OAuth client or production database for Preview/staging, and do not claim staging isolation merely because Preview now fails closed.
- Repository preparation: `docs/staging-foundation.md` records the exact sequence, and `npm run db:seed:staging` refuses the known production project, requires explicit project-ref confirmation, verifies runtime/migration role separation, supports authorized real identity overrides, creates a staging-only marker, and verifies that provider/OAuth secret tables remain empty.

### Google Cloud callback

The OAuth 2.0 web client used by `AUTH_GOOGLE_ID` now accepts this exact Authorized redirect URI:

`https://ai-receptionist-dashboard-jade.vercel.app/api/auth/callback/google`

Do not add deployment-specific preview callbacks to this production client. A future staging environment needs its own origin, callback, OAuth client, secrets, database, and provisioned test identities.

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

1. Configure an independent staging/Preview origin, OAuth client, secrets,
   database, explicit disabled provider modes, and access controls. Provision
   real manager, staff, and platform-operator test identities there and execute
   the remaining HTTPS role and cross-tenant matrix.
2. Keep the now-verified Google Auth.js provider as the only production sign-in
   method. Do not enable email magic links until durable Auth.js
   verification-token persistence is proven.
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
