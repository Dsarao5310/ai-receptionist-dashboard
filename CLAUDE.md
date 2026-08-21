@AGENTS.md

# AI Receptionist — CLAUDE.md

## Project identity

Project name:

**AI Receptionist**

This is a commercial multi-tenant AI receptionist platform.

It combines:

- Next.js dashboard
- Auth.js authentication
- Supabase Postgres persistence
- n8n automation/orchestration
- Vapi voice AI
- Twilio SMS/telephony
- Google Calendar
- Gmail/email
- knowledge/vector infrastructure
- AI/model providers

The product is designed for multiple business clients from one codebase.

---

# 1. MOST IMPORTANT WORKING RULE

Before changing anything:

1. Read this `CLAUDE.md`.
2. Read the user's latest prompt carefully.
3. Inspect the existing implementation.
4. Inspect relevant tests.
5. Inspect existing migrations/schema before changing database code.
6. Preserve established architecture unless the user explicitly asks to change it.

Do NOT rebuild working systems from scratch merely because another implementation would be possible.

Repository truth + the user's latest explicit instruction take precedence over older notes in this file.

If this file becomes stale, update the relevant current-status section after completing the phase.

---

# 2. DO NOT ASK UNNECESSARY QUESTIONS

When a task can be resolved safely by inspecting the repository, do that.

Do not interrupt implementation with questions such as:

- Which file should I edit?
- Should I use the existing architecture?
- Do you want me to run tests?
- Should I preserve the UI?

Inspect and make the best technically justified decision.

Only stop for clarification when proceeding would risk:

- data loss
- security regression
- irreversible external action
- conflicting product requirements that cannot be resolved from repository evidence

Prefer completing the task and reporting decisions afterward.

---

# 3. PRODUCT ACCESS MODEL

There is ONE dashboard/codebase.

There are fundamentally different platform and business access layers.

## Platform operator / admin

The platform operator may access technical infrastructure such as:

- client/workspace management
- n8n
- Vapi
- Twilio
- Google Calendar provider configuration
- Gmail/email provider configuration
- provider health
- workflow mappings
- usage
- technical logs
- errors
- subscriptions
- internal configuration
- integration diagnostics

## Business client

Business users should primarily see:

- Overview
- Conversations
- Calls
- Appointments
- Customers
- Analytics
- AI Receptionist
- Business Profile
- Connections / System Status
- business-facing Settings

Clients should NOT normally see technical provider implementation details.

Client vocabulary:

- Voice
- SMS
- Email
- Calendar
- AI Receptionist
- Business Knowledge

Admin vocabulary may include:

- Vapi
- Twilio
- n8n
- Google Calendar
- Gmail
- Pinecone
- model provider

Never expose provider-specific infrastructure merely by hiding it visually.

Backend authorization must enforce access.

---

# 4. AUTHENTICATION — LOCKED DECISION

Authentication is:

**Auth.js / NextAuth v5**

Do NOT migrate this application to Supabase Auth unless the user explicitly changes this architectural decision.

Do NOT run two competing authentication systems.

Current architecture:

Auth.js
→ verified server session
→ workspace membership / platform privilege
→ permission check
→ repository/database

Session principles:

- httpOnly signed JWT cookie
- sameSite=lax
- secure in production
- approximately 8 hour expiry
- approximately 1 hour rotation
- token contains minimal identity/platform data
- workspace role is re-read from membership data
- workspace role is not trusted from browser state
- revoked permissions should take effect without waiting for a long workspace-role JWT claim to expire

Never accept a role supplied by the browser.

---

# 5. ROLE MODEL

Platform privilege and workspace role are separate concepts.

## Platform role

Current platform role concept:

`operator`

Platform privilege can access technical/admin infrastructure.

## Workspace roles

Current business roles:

- owner
- manager
- staff

A business owner is NOT equivalent to platform operator.

Never accidentally grant platform permissions to a workspace owner.

Permissions must remain centralized.

Avoid scattered code such as:

if (role === "owner") ...

Prefer shared policy/permission helpers.

Frontend gates are UX only.

Server authorization is authoritative.

---

# 6. MULTI-TENANCY — CRITICAL

Every tenant-owned record must be scoped to a workspace.

Typical database column:

`workspace_id`

The server must never trust a browser-provided workspace ID as authorization.

Correct flow:

browser requests workspace/context
→ Auth.js session
→ server verifies membership/platform privilege
→ authorized workspace resolved
→ scoped repository/query
→ database

Bad:

client-provided workspaceId
→ database query

Good:

requested workspace
→ server authentication
→ authorization
→ authorized workspace context
→ scoped repository

Strongly prefer architecture conceptually similar to:

const ctx = await requireWorkspace(...)

ctx.repositories.appointments.find(...)

or the established equivalent.

Make unsafe unscoped tenant access difficult to write.

Cross-tenant data leakage is a release blocker.

---

# 7. DATABASE

Database:

**Supabase Postgres**

Supabase project:

**AI Receptionist**

Project ref:

`rkzwubwogtezqbuhieuo`

Supabase is used primarily as durable PostgreSQL persistence.

It is NOT the application's authentication system.

Primary private schemas:

- `app`
- `app_test`

`app_test` mirrors the production-shaped application schema for testing.

Do NOT expose these schemas directly to ordinary browser roles for convenience.

Current architecture:

Auth.js
→ Next.js server
→ authorization
→ `app_runtime`
→ private Postgres schema

Database migration role:

`app_migrator`

Runtime role:

`app_runtime`

Do not run the application as database superuser.

---

# 8. SUPABASE SECURITY STATE

The intended security model is server-side private-schema access.

Current known state:

- `anon` has no `app` / `app_test` application access
- `authenticated` has no `app` / `app_test` application access
- `app_runtime` is the server runtime database role
- helper functions are security-invoker
- helper functions are not executable by anon/authenticated
- helper functions are executable by app_runtime where required
- Supabase Security Advisor had 0 findings at the latest checkpoint
- database passwords for `app_runtime` and `app_migrator` were independently
  rotated on 2026-08-21 after diagnostic exposure; both immediately retired
  credentials were rejected through direct Postgres authentication, the final
  replacements work through the configured Supavisor poolers, and role grants
  and ownership remained unchanged

Do not weaken this.

RLS must not be added merely for appearances.

Because authentication is Auth.js, ordinary Supabase:

auth.uid()

does not automatically represent the application's Auth.js identity.

Application-level authorization + tenant-scoped queries are authoritative.

Meaningful database defense-in-depth is welcome, but do not create fake security.

---

# 9. LIVE DATABASE HARDENING MIGRATIONS

The following Supabase migrations were applied during persistence hardening and must remain represented in source control:

- `20260818171718_security_and_fk_indexes`
- `20260818172351_harden_sensitive_config_guard`
- `20260818173100_enforce_tenant_relationship_integrity`
- `20260818173437_index_tenant_foreign_keys`
- `20260818173513_lock_down_private_schema_functions`

## security_and_fk_indexes

Purpose:

- pinned helper function search paths
- added missing FK-support indexes

## harden_sensitive_config_guard

Hardened:

`config_has_no_sensitive_values(jsonb)`

The old implementation failed on object-shaped JSON.

The corrected implementation recursively supports:

- objects
- arrays
- nested structures
- null

A configuration object marked:

`sensitive: true`

must not contain an exposed:

`value`

field.

## enforce_tenant_relationship_integrity

Added composite database relationships so tenant-owned records cannot point across workspaces.

Invalid example:

Workspace A appointment
→ Workspace B customer

Postgres should reject this independently of application authorization.

At the latest checkpoint there were:

**24 composite tenant-binding constraints**

across `app` and `app_test`.

A hostile live update attempting to link an appointment to a customer in another workspace was tested and rejected by PostgreSQL.

## index_tenant_foreign_keys

Added composite indexes required for those tenant foreign keys.

Do not delete them simply because a new/demo database reports them unused.

## lock_down_private_schema_functions

Restricted helper function execution and tightened default function privileges.

Current intended state:

anon execute → false

authenticated execute → false

app_runtime execute → true where required

Functions remain security-invoker, not security-definer.

---

# 10. MIGRATION RULES

All schema changes must be reproducible from source control.

Never leave important schema modifications existing only in hosted Supabase.

Before writing migration SQL:

1. inspect existing migrations
2. inspect live schema if needed
3. understand the current migration mechanism
4. avoid duplicate migrations
5. avoid destructive resets of remote production-shaped data

Never run a destructive remote reset unless explicitly requested and clearly appropriate.

Migration changes must be reviewed and tested.

---

# 11. CURRENT DATABASE CONTENT

The live database already contains a production-shaped schema and seeded development/demo data.

Do not recreate it.

At the latest checkpoint, `app` included approximately:

- 2 workspaces
- 5 users
- 4 workspace memberships
- 92 customers
- 888 conversations
- 443 calls
- 509 appointments
- 14 services
- 14 integration records
- audit events
- business configuration

These figures are checkpoint information, not permanent invariants.

Do not destroy the remote data merely to make a migration easier.

---

# 12. EXISTING DOMAIN SCHEMA

The database already contains major models including:

Identity/security:

- users
- workspaces
- workspace_memberships
- invitations
- audit_events

Business configuration:

- business_profiles
- business_hours
- business_hour_intervals
- special_hours
- special_hour_intervals
- services
- knowledge_entries
- ai_configurations

Operational domain:

- customers
- conversations
- conversation_messages
- conversation_actions
- calls
- appointments
- activity_events
- notifications
- user_notification_preferences
- user_workspace_settings

Integrations/orchestration:

- integration_records
- integration_events
- integration_operations
- integration_inbound_events
- workflow_mappings
- external_calendar_blocks
- provider_credentials
- provider_secrets
- oauth_states

Inspect and reuse these.

Do not create parallel replacement tables without a demonstrated need.

---

# 13. DOMAIN SOURCE OF TRUTH

The server/database is the authoritative source for business-domain data.

Client stores are NOT the database.

Client state is appropriate for:

- theme
- accent
- density
- sidebar state
- filters
- drawers
- modals
- form drafts
- temporary optimistic presentation state

Client-persisted state should NOT be authoritative for:

- customers
- calls
- conversations
- appointments
- business profile
- services
- hours
- knowledge
- AI configuration
- integrations
- workflows

Avoid duplicate mutable truths.

---

# 14. REPOSITORY ARCHITECTURE

Use bounded server-side repository/service modules rather than one giant database module.

Examples may include:

- IdentityRepository
- WorkspaceRepository
- CustomerRepository
- ConversationRepository
- CallRepository
- AppointmentRepository
- BusinessProfileRepository
- ServiceRepository
- KnowledgeRepository
- AIConfigurationRepository
- IntegrationRepository
- NotificationRepository
- AuditRepository

Follow existing names if the codebase already established them.

Production should use database-backed implementations.

In-memory implementations may remain for:

- deterministic unit tests
- explicit development fixtures

Production must not silently fall back to fake data when the database fails.

---

# 15. SERVER READS AND WRITES

Protected business reads and writes should follow:

authenticate
→ authorize
→ resolve workspace
→ load authoritative state
→ validate
→ query/mutate database
→ audit if appropriate
→ return safe DTO
→ revalidate affected UI

Do not trust frontend-computed validity.

Do not trust frontend-owned domain records.

---

# 16. SCHEDULING ARCHITECTURE

Business timezone is authoritative.

Never use the viewer/browser timezone as business truth.

Current scheduling concepts remain separate:

## Temporal validity

Is the requested time in the future?

## Business-time validity

Does the entire appointment fit inside valid operating hours?

## Actual availability/capacity

Is the provider/calendar slot genuinely available?

These are NOT the same thing.

Do not call a business-hours-valid time "available" unless actual availability has been checked.

---

# 17. TRUSTED CLOCK

Frontend time:

UX convenience only.

Server time:

authoritative.

Protected scheduling writes must not accept a trusted `now` from the browser.

Use the established trusted server clock such as:

`serverNow()`

or equivalent.

Normal rescheduling requires:

requested instant > trusted current instant

Past or exact-current-time rescheduling is invalid.

Historical correction, if needed later, must be a separate explicit admin capability.

Do not weaken normal scheduling rules.

---

# 18. BUSINESS HOURS

Business hours support interval lists.

Do not regress to one opening/closing pair per day.

Must support split shifts such as:

09:00–12:00
13:00–18:00

Special hours override weekly hours.

Special hours can represent:

- closed date
- changed intervals
- reason/label

Entire appointment duration must fit within a valid interval.

---

# 19. SERVICE IDENTITY AND HISTORY

Service catalogue entries use stable IDs.

Never use service names as identity.

Appointments store:

- `serviceId` / `service_id`
- immutable service snapshot

Snapshot includes at least:

- name
- price model
- price
- duration

Definitions:

**Catalogue = current truth**

**Snapshot = historical booking truth**

If a service is:

- renamed
- repriced
- duration changed
- deactivated
- deleted

historical appointment data remains unchanged.

Do not rebuild historical appointment display from current catalogue values.

Service drift is derived, not persisted.

Service deactivation alone is not drift.

---

# 20. APPOINTMENT DATABASE INTEGRITY

Current appointment storage preserves:

- workspace
- customer
- optional service reference
- immutable service snapshot
- scheduled date/time information
- timezone-aware absolute instants
- status
- source
- provider synchronization metadata where applicable

Database relationships include tenant-binding protection.

Do not weaken cross-workspace relationship constraints.

Appointment → customer should remain tenant-consistent.

Appointment → service should remain tenant-consistent while allowing historical snapshot survival when a service reference is removed.

---

# 21. CHILD-TABLE TENANCY

Not every child table requires its own redundant `workspace_id`.

Some tables intentionally inherit tenant ownership through a tenant-scoped parent.

Examples include:

- conversation_messages
- conversation_actions

Access must happen through the authorized/scoped parent.

Do not add redundant workspace fields simply for consistency unless there is a concrete security/query requirement.

---

# 22. CUSTOMER DERIVED STATE

Avoid persisting stale convenience values when they can be reliably derived.

Examples previously vulnerable to staleness:

- appointment count
- next/upcoming appointment
- last interaction

Prefer deriving from authoritative domain records.

If future scale requires materialization, implement it deliberately with consistency guarantees.

---

# 23. ANALYTICS

Analytics derives from authoritative business-domain records.

Do not create a second manually maintained analytics truth.

Use:

- conversations
- calls
- appointments
- customers

Business-timezone date boundaries must remain correct.

Do not build a warehouse prematurely.

---

# 24. PROVIDER ARCHITECTURE

Provider-specific code must remain behind adapter/service boundaries.

Providers include:

- Vapi
- Twilio
- Google Calendar
- Gmail
- n8n
- Pinecone / knowledge provider
- model provider

Normal client UI must not depend on raw provider payloads.

Normalize provider responses at adapter boundaries.

## Reuse the shared provider framework

A new provider implements only provider-specific translation. It must **not**
reimplement authorization, workspace scoping, credential storage, idempotency,
operation states, webhook ingestion, error normalization, provider-time
normalization, audit, or client/admin separation — those already exist and are
listed with their locations in `docs/provider-integration.md`, which also holds
the provider readiness template and the live-certification checklist.

Specifically reuse:

- `IntegrationAdapter` (`services/adapters/types.ts`) — connect/disconnect/test/capabilities
- `ingestInboundEvent` (`integrations/inbound/pipeline.ts`) — the inbound gate
  sequence: signature → schema → tenant → idempotency → transaction
- `runWorkflowOperation` — operation lifecycle and idempotency
- `commitWithSyncGuard` — any local write following a confirmed external mutation
- `SecretStore` / `credentialStore`, `provider-time.ts`, `NormalizedError`
- `CAPABILITY_DEPENDENCIES` — client-facing capability status

Idempotency is arbitrated by database uniqueness, never check-then-act.

**Provider semantic success must be validated independently of transport
success.** An HTTP 2xx is not proof the operation succeeded in the provider's
domain — Google returns 200 when patching a deleted event that stays
`cancelled`. Where that check belongs differs per provider: Google's arrives in
the response body, Twilio's and Vapi's arrive later on a webhook. Keep the
check in the provider adapter; do not force it into one synchronous hook.

Never auto-retry `sync_required` — the external side effect already happened.

---

# 25. PROVIDER TIME BOUNDARY

Provider timestamps must be normalized through the established provider-time abstraction.

Conceptually:

provider payload
→ provider adapter
→ provider-time normalization
→ canonical instant
→ domain/database

Do not add ad hoc provider timestamp parsing.

Offsetless timestamps without a stated timezone must not silently inherit browser/server timezone.

If a provider timestamp format is unsupported, extend the established abstraction instead of bypassing it.

---

# 26. PROVIDER SECRETS

Provider credentials must never be exposed to browser state.

Never put:

- API keys
- auth tokens
- refresh tokens
- webhook secrets
- database passwords

into:

- React state
- persisted frontend stores
- client DTOs
- localStorage
- NEXT_PUBLIC environment variables
- console logs

Frontend should normally know only:

- configured
- not configured
- masked safe metadata

Real secret storage and rotation are server-side responsibilities.

---

# 27. CURRENT PROVIDER SECRET STATE

At the latest Supabase checkpoint:

- `app.provider_credentials` had 0 rows
- `app.provider_secrets` had 0 rows
- `app.oauth_states` had 0 rows

Equivalent `app_test` tables were also empty.

No production provider credentials were connected.

Integration config may contain safe descriptors such as:

- API key configured/not configured
- OAuth configured/not configured
- credential required

but never secret values.

Preserve this until a dedicated provider-connection phase.

**Update, 2026-08-18:** this checkpoint has been superseded for Google Calendar specifically. `GOOGLE_CALENDAR_MODE=live` is now configured for local development, a real Google OAuth client is connected, and `app.provider_secrets` holds live-encrypted `google_access_token` / `google_refresh_token` rows for `ws_coastal_bloom`, synced against the dedicated **"Ai receptionist test"** Google Calendar. Twilio, Vapi, Gmail, Pinecone and other providers remain disconnected. Do not treat the "0 rows" figures above as still accurate for Google Calendar.

---

# 28. PROVIDERS NOT YET CONNECTED

Unless the user's latest prompt explicitly begins a provider integration phase:

DO NOT connect:

- Vapi
- Gmail
- Pinecone
- real model-provider credentials

Mock provider adapters should remain server-side for these.

React components should not directly call provider implementations.

**Google Calendar and n8n are no longer in this "not connected" category** — see §29 (n8n orchestration, already implemented) and §54–§55 (Google Calendar, the first real external provider connection, live-validated against a dedicated test calendar). Do not treat that as approval to begin Vapi, Gmail, Pinecone, or real model-provider connection work automatically — each still requires its own explicit instruction.

**Twilio (2026-08-18): built and simulator-verified, NOT live-certified.** The full SMS integration exists — trusted number→workspace mapping (`provider_phone_numbers`, unique on the number), inbound messages, outbound sends through the orchestration spine, delivery-status callbacks, `X-Twilio-Signature` verification, idempotency, partial-failure `sync_required`, tenant isolation, and client/admin separation. It runs on `TWILIO_MODE=simulated` and **has never sent or received a real message**: a read-only probe confirmed the trial account owns **no phone number**, so certification is deferred. Do not describe Twilio as live-verified. `docs/twilio-live-certification.md` holds exactly what remains once an SMS-capable number is claimed.

---

# 29. N8N ARCHITECTURE

The n8n AI receptionist already exists.

Do not rebuild it inside the dashboard.

Its responsibilities include orchestration around:

- bookings
- cancellations
- rescheduling
- availability
- voice
- SMS
- email
- knowledge
- multi-client behavior
- idempotency
- atomic reservation/concurrency protection

**The dashboard ↔ n8n orchestration architecture is already implemented**, not a future design. Established, current behavior:

Dashboard
→ authenticated server operation
→ authorization
→ validation/idempotency
→ integration layer
→ n8n/backend workflow
→ provider/database

Inbound:

n8n/provider
→ signed/authenticated server endpoint
→ idempotency
→ workspace resolution
→ validation
→ Supabase
→ dashboard

Confirmed established properties:

- the browser cannot select or name an arbitrary workflow
- application operations resolve through workspace-scoped `workflow_mappings`, never through a client-supplied workflow/webhook identifier
- a mapped, `active` workflow always wins over the direct provider adapter (see below)
- there is no generic arbitrary webhook/workflow execution surface exposed anywhere
- inbound n8n events use authenticated, signed ingestion (HMAC over the raw body + timestamp, replay-windowed)
- the inbound payload's own claimed workspace is never trusted — the workspace is resolved through the trusted `workflow_mappings.workflow_ref` mapping, not from a field in the body
- idempotency is enforced through durable database constraints/operation records (`integration_operations`), not in-memory state
- Supabase remains the dashboard's source of truth; n8n is orchestration, not page-data storage
- reconciliation / `sync_required` exists for the case where the external system succeeds but the local database write fails
- client (business-user) UI does not expose n8n infrastructure, workflow refs, or execution ids

Never expose unrestricted n8n webhooks directly to the browser.

A workspace's `workflow_mappings` row for an operation (`appointment.book` / `appointment.reschedule` / `appointment.cancel`) always wins over the direct provider adapter when its `status` is `active` — this precedence is intentional and must not be weakened. `status` may legitimately be toggled to `inactive` as a *reversible, test-session-only* mechanism (e.g. to prove a direct provider adapter against a real provider while `N8N_MODE=simulated`); any such toggle must be captured before the change and restored to its exact original value afterward, and must never be left inactive outside an explicit, scoped test session.

**Development/test transport caveat:** development and test n8n execution may still use simulated transport (`N8N_MODE=simulated`), where an operation resolves to a mapped workflow but the actual n8n call is faked locally. Do not describe simulated n8n transport as live production provider execution — say "simulated" explicitly. Automated tests always run this way regardless of `.env.local` (see §36).

---

# 30. ADMIN VS CLIENT INTEGRATION DATA

Client-facing connection summary and admin integration records are different concepts.

Client may see:

- Voice Connected
- SMS Active
- Email Active
- Calendar Connected
- AI Receptionist Online

Client must not be able to query:

- provider IDs
- workflow IDs
- credential metadata
- raw provider errors
- technical infrastructure configuration

Do not create one large admin object and rely only on React to hide technical fields.

Backend/API boundaries must prevent unauthorized retrieval.

---

# 31. CONNECTION HEALTH VS ENABLED STATE

Connection state and feature-enabled state are different.

Example:

Twilio connected

does not necessarily mean:

AI Receptionist SMS channel enabled

Do not conflate:

connected

with:

enabled

Client capability health should derive from normalized integration state.

Avoid duplicate mutable status flags.

---

# 32. AUDITING

Security-sensitive and important business mutations should create safe audit events where appropriate.

Examples:

- appointment rescheduled
- appointment cancelled
- business hours changed
- service modified
- AI configuration changed
- membership modified
- integration state changed
- workflow mapping changed

Audit data should include as appropriate:

- actor
- workspace
- action
- target
- timestamp
- safe metadata

Never log secrets.

---

# 33. UI DESIGN SYSTEM

Preserve the established visual direction.

Design language:

- quiet minimalism
- warm-neutral surfaces
- low chrome
- hairline/subtle borders
- restrained shadows
- 8–12px radii
- one primary accent
- green/yellow/red mainly for operational semantics
- clean sans-serif typography
- tabular figures for metrics
- restrained charts
- progressive disclosure

Current shell includes:

- left sidebar
- top bar
- mobile navigation
- command palette
- notifications
- light/dark/system themes
- accent
- density
- collapsed sidebar state

Do not redesign unrelated surfaces during backend/database/integration phases.

Cosmetic-only cleanup can wait unless it blocks usability, accessibility, or functionality.

---

# 34. RESPONSIVENESS

All significant features must remain usable around:

375px mobile width

No unintended page-level horizontal overflow.

Technical admin tables may scroll inside intentional containers.

Do not make admin tooling unnecessarily desktop-only.

---

# 35. ACCESSIBILITY

Preserve:

- keyboard navigation
- visible focus
- labels
- accessible dialogs
- aria-invalid
- aria-describedby
- aria-live where appropriate
- non-color-only status indicators
- good contrast
- reduced-motion support

Do not regress previously corrected muted-text contrast.

---

# 36. TESTING PHILOSOPHY

Do not consider work finished simply because TypeScript compiles.

Relevant changes should be verified through the appropriate combination of:

1. unit/domain tests
2. repository/database tests
3. authorization/tenant-isolation tests
4. integration/server-action tests
5. browser/manual QA
6. typecheck
7. lint
8. production build

Tests should be deterministic.

Avoid random mock behavior.

Inject clocks into time-sensitive domain logic where applicable.

Automated tests always run against `GOOGLE_CALENDAR_MODE=simulated` (and other providers' simulated modes) regardless of what `.env.local` currently has configured for manual/live-validation sessions — the test harness sets this itself and never reads the ambient live-mode configuration.

---

# 37. TENANT SECURITY TESTS

Whenever persistence/auth/repository code changes, test hostile cases.

At minimum consider:

- Workspace A user requests Workspace B record
- foreign appointment ID
- foreign customer ID
- changed workspace cookie
- changed route/query workspace value
- forged role in payload
- revoked membership
- direct admin server action
- owner attempting platform action
- manager/staff attempting restricted actions
- cross-workspace relationship write

Hidden navigation is not a security test.

The server and/or database must reject unauthorized operations.

---

# 38. DATABASE TENANT DEFENSE

Database-level tenant relationship integrity is intentional defense-in-depth.

Composite tenant FKs were added to relationships that already carry workspace ownership.

At the latest checkpoint there were 24 tenant-binding composite constraints across `app` and `app_test`.

Do not remove them just because application authorization exists.

Application authorization and database relational integrity complement each other.

---

# 39. PERFORMANCE ADVISOR INTERPRETATION

At the latest checkpoint:

Supabase Security Advisor:

0 findings

Performance Advisor:

only INFO-level unused-index notices after FK and tenant-index hardening.

Do NOT aggressively remove indexes simply because development statistics report them unused.

Especially preserve indexes required for:

- foreign keys
- tenant composite relationships
- actual expected dashboard query patterns

Reassess index usage only after representative production workload exists.

---

# 40. FRESH-BROWSER VERIFICATION

Development HMR can leave stale console output.

When investigating browser failures:

1. fix actual code
2. reload/restart where needed
3. verify in a fresh tab/session
4. distinguish stale HMR logs from current failures

Do not dismiss real console errors without a clean reproduction.

---

# 41. DO NOT OVER-ENGINEER

Prefer the smallest architecture that preserves:

- correctness
- tenant isolation
- maintainability
- reproducibility
- future provider integration seams

Do not add without clear need:

- unnecessary microservices
- a second auth framework
- a second booking engine
- a data warehouse
- Supabase Realtime
- complex event sourcing
- excessive abstraction

Wait for the relevant phase.

---

# 42. PRESERVE CURRENT FEATURES

Before declaring a major phase complete, avoid breaking:

- Overview
- Conversations
- Calls
- Appointments
- appointment calendar
- detail drawers
- reschedule
- past-time restriction
- cancellation
- Undo
- notes
- Customers
- customer detail/deep links
- Analytics
- AI Receptionist
- Business Profile
- weekly hours
- special hours
- Services
- Knowledge
- Test Receptionist
- Connections
- Admin Integrations
- Admin Workflows
- Settings
- authentication
- RBAC navigation
- workspace switching
- command palette
- notifications
- themes/accent/density
- mobile navigation

---

# 43. CURRENT BUILD PRIORITY

Functionality and architecture come first.

Do not spend backend/persistence/integration phases on harmless cosmetic polish unless:

- it blocks functionality
- it causes accessibility failure
- it causes layout breakage
- it materially misleads the user

Cosmetic cleanup is intentionally deferred until the dashboard/core product is functionally complete.

---

# 44. BUG HANDLING

If a real bug directly related to the phase is discovered:

fix it.

Do not ignore it merely because the prompt did not explicitly name it.

If a discovered issue is unrelated and risky to expand into:

document it in the completion report rather than allowing uncontrolled scope creep.

**Two live-validation findings (2026-08-18) — both now FIXED and live-verified. See §55.** Both were found only by running against real Google, and both are regression-tested:

1. **Cancelled-tombstone PATCH.** Google returns HTTP 200 when PATCHing an already-cancelled event, with the body still `status: "cancelled"`. `rescheduleAppointmentEvent` now treats that identically to a 404 — the event is unusable, so a replacement is created and becomes the new mapping (old id preserved as `replacedEventId` for audit). Do not revert to the old assumption that a deleted event's PATCH returns 404; real Google disproved it.
2. **Executor-owned local write.** Each executor (`rescheduleExecutor` / `cancelExecutor` / `createExecutor` in `calendar-sync.ts`) performs its *own* mapping/sync write after the external call, and that write sat outside `commitWithSyncGuard`. A failure there surfaced as a generic `retryable_failure`, which a retry was free to repeat — on the create path that meant a second real Google event with nothing in the database pointing at it. Each executor now wraps that write in `commitWithSyncGuard` with its own `operationId` and returns `LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS`, which `runWorkflowOperation` recognises and leaves settled as `sync_required` (a state that already refuses retries under the same idempotency key).

The general rule both produced is in §54: **provider semantic success must be validated, not inferred only from HTTP status** — and, correspondingly, *any* local write that follows a confirmed external mutation must be sync-guarded, wherever in the stack it happens.

---

# 45. EXTERNAL SERVICES

Never invent success.

When no real provider is connected, say so.

Do not describe mock behavior as:

- live
- synced with provider
- confirmed externally

Use accurate language such as:

- mock
- simulated
- locally derived
- provider not yet connected

when applicable.

---

# 46. SOURCE OF TRUTH ORDER

When instructions or implementation evidence conflict, use this order:

1. user's latest explicit instruction
2. actual repository/runtime/database state
3. automated tests representing intended behavior
4. this CLAUDE.md
5. older comments/documentation

If a later intentional phase changes architecture, update this file.

---

# 47. WORK STYLE

For substantial tasks:

- inspect first
- understand current implementation
- make focused changes
- test incrementally
- fix regressions
- perform broad verification at the end

Do not rewrite entire modules without necessity.

Prefer established project patterns when sound.

Do not create decorative controls.

Every visible interactive control should:

- function,
- be intentionally disabled with explanation,
- or not exist yet.

---

# 48. STOP RULE

When the user's prompt says:

STOP after this phase

obey it.

Do not automatically begin:

- next provider
- n8n integration
- next architecture phase
- unrelated polish

Finish with verification and a handoff report.

---

# 49. REQUIRED COMPLETION REPORT FORMAT

For major implementation phases, report consistently:

# [Phase Name] Complete

## What changed

High-level implementation summary.

## Architecture

Important architecture/data-flow decisions.

## Security / tenancy

Authorization, tenant isolation, secret-boundary changes.

## Bugs found and fixed

Only real issues encountered.

## Tests

Include:

- tests added
- total passing count
- important cases

## Tooling

Report:

- typecheck
- lint
- production build

## Browser QA

What was manually verified.

## Remaining decisions

Only genuine unresolved decisions.

## Readiness

State clearly whether the application is ready for the next named phase.

Never hide failures.

Never claim tests were run if they were not.

---

# 50. PERSISTENCE — COMPLETED PHASE

Supabase/persistence is **not** the current unfinished phase. It is done and proven, not a pending goal:

- Supabase is the durable application source of truth
- Auth.js authentication, server-side authorization, and workspace-scoped Supabase/Postgres repositories are all in place
- users, memberships, workspaces, customers, conversations, calls, appointments, business configuration, AI configuration, integrations, workflow mappings, and audit events are all database-backed
- client stores are no longer authoritative for business-domain data (see §13)
- `app` and `app_test` are column-identical
- five Supabase hardening migrations were applied and remain represented in source control:
  - `20260818171718_security_and_fk_indexes`
  - `20260818172351_harden_sensitive_config_guard`
  - `20260818173100_enforce_tenant_relationship_integrity`
  - `20260818173437_index_tenant_foreign_keys`
  - `20260818173513_lock_down_private_schema_functions`
- Security Advisor has 0 findings; Performance Advisor has only unused-index INFO findings
- composite tenant relationships were hardened; cross-workspace FK tampering was tested and rejected
- private helper functions are locked down; `app_runtime` is the runtime database role
- Auth.js remains authentication; Supabase Auth is intentionally not used

Provider credential/secret/OAuth tables are **no longer uniformly empty**: Google Calendar now has live rows for its connected workspace — see §27 and §55. Twilio, Vapi, Gmail, Pinecone, and other providers remain unconnected.

Do not re-open persistence work, and do not describe it as pending or as "the current phase," unless the user explicitly identifies a persistence regression or gap.

---

# 51. CURRENT ACTIVE PHASE AND WHAT'S NEXT

Persistence is complete (§50) and the dashboard ↔ n8n orchestration architecture is already implemented (§29) — neither is the current phase, and neither should be described as upcoming or unfinished.

**The current active phase is: finish Google Calendar real-provider validation and reconciliation hardening** (§54, §55) — including the fix for the cancelled-event-tombstone defect described in §44 and §55.

After Google Calendar live validation is fully complete and reported done, the likely next provider is **Twilio**, followed later by **Vapi**. Gmail, Pinecone, and real model-provider credentials remain further out still.

Do not begin Twilio, Vapi, Gmail, Pinecone, or any other provider automatically — each still requires its own explicit user instruction, even once Google Calendar validation is complete.

---

# 52. PRODUCT PRINCIPLE

This product must remain simple for the business client and powerful for the platform operator.

The client should experience:

**AI Receptionist**

not:

**a collection of n8n, Vapi, Twilio, Google, Pinecone and API configuration screens**

Hide technical complexity through correct architecture, not fake frontend security.

The platform operator retains technical control.

The backend enforces the distinction.

---

# 53. FINAL RULE

Do not optimize for finishing the prompt fastest.

Optimize for leaving the repository:

- correct
- secure
- reproducible
- testable
- understandable
- maintainable
- ready for the next phase

without undoing architectural decisions that have already been implemented and proven.

---

# 54. GOOGLE CALENDAR — LIVE PROVIDER ARCHITECTURE

Google Calendar is the first real external provider connection in this project. A real Google OAuth authorization has been completed against a dedicated, non-personal test calendar: **"Ai receptionist test."** Never use a personal or production client calendar for destructive testing.

Established architecture:

- Auth.js remains dashboard authentication; Google OAuth is workspace **provider authorization** only — it never substitutes for or extends Auth.js session identity
- OAuth `state` is signed and one-time consumable
- Google access/refresh tokens are stored encrypted, server-side, in `provider_secrets`
- provider secrets never reach the browser (see §26)
- the selected calendar is validated against the calendars the connected account actually returns from Google — a submitted calendar id Google doesn't offer is rejected, never written through
- business timezone remains authoritative; calendar timezone never replaces it (see §16, §25)
- application appointments carry external event mappings and private extended-property metadata (the application's own appointment id), so identity survives a renamed event
- external calendar blocks (busy time from events the application didn't create) are distinct from customer appointments — they occupy capacity but never become a customer or appointment row
- external changes (a moved or deleted event) can produce reconciliation states (`external_change_detected`, `sync_required`) rather than being silently accepted or silently ignored
- Supabase remains the durable business-domain source of truth; Google Calendar is a **synchronized external scheduling representation**, not a second source of truth

## Provider semantic success must be validated, not inferred only from HTTP status

A provider can return HTTP success while the returned resource is still semantically unusable. Adapters must check the provider's own domain state in the response body before marking an operation synchronized/successful — an HTTP 200 is necessary but not sufficient.

Current confirmed example: Google Calendar returns `200 OK` for a PATCH against an already-cancelled event, with the response body still showing `status: "cancelled"`. See §55 for the specific fix requirement this produced. Treat this as a general adapter-design rule, not a one-off Google quirk — apply the same "check the domain state, not just the transport status" discipline to future provider adapters (Twilio, Vapi, Gmail).

---

# 55. LIVE GOOGLE VALIDATION STATUS

Real OAuth and real Google Calendar access are working end-to-end. Live validation (against the real Google API, not the simulator) has already confirmed:

- OAuth handshake
- encrypted token storage
- connection health / test-connection check
- calendar discovery
- dedicated test-calendar ("Ai receptionist test") selection
- real event creation
- create idempotency (repeated reschedule to the same time reuses one event, not a duplicate)
- real rescheduling
- real cancellation
- external events (created directly in Google, read back correctly)
- valid external moves (adopted)
- invalid external moves (rejected per business rules — flagged, not silently accepted or silently overwritten)
- external deletion detection
- reconciliation behavior

## Confirmed real-provider defect (fixed and regression-tested)

Google Calendar may return HTTP success when PATCHing an already-cancelled/deleted event, while the returned event body still shows:

`status: "cancelled"`

HTTP 200 alone is therefore **not** sufficient to treat a Calendar update as domain success (see the general rule in §54).

If a successfully-patched Google event's response shows `status === "cancelled"`, the adapter now treats that event as unusable for the active booking and creates/relinks a replacement active event. It does not mark the appointment `synced` against the cancelled tombstone.

Do not revert to the assumption that a deleted event's PATCH eventually returns 404 — real Google disproved it. `rescheduleAppointmentEvent` (`src/server/integrations/google-calendar/operations.ts`) checks the returned event state, replaces cancelled tombstones, preserves the old mapping history, and avoids a duplicate replacement on retry. The database-backed calendar suite covers successful repair, failed replacement, linkage, and retry idempotency.
