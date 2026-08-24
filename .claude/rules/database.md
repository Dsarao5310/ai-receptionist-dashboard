# Database Rules

- Supabase Postgres is the durable source of truth for application-domain data.
  Auth.js remains authentication; Supabase Auth is not used.
- Application data lives in private `app` and test-shaped `app_test` schemas behind
  authenticated, authorized server access.
- Use `app_runtime` for application queries and `app_migrator` for controlled schema
  changes. Preserve least privilege; the application must not run as a superuser or
  receive migration credentials.
- Every tenant-owned query and mutation is server-authorized and workspace-scoped.
  Preserve composite tenant constraints and tenant-consistent relationships.
- Child records may inherit tenancy through a scoped parent; do not add a redundant
  workspace field without a concrete security or query requirement.
- Keep migrations source-controlled, reproducible, reviewed, and forward-safe. Inspect
  existing migrations and the live ledger before adding one. Never casually reset or
  recreate remote production-shaped data.
- Client stores are UI state, not database truth. Customers, calls, conversations,
  appointments, business configuration, integrations, and workflows remain server-backed.
- Business timezone is authoritative for scheduling and analytics boundaries. Browser or
  server-local timezone must not silently replace it.
- Server time is authoritative for protected scheduling writes. Never accept browser time
  as trusted `now`; normal rescheduling requires a future instant.
- Keep temporal validity, business-hours fit, and real provider capacity distinct. A time
  that fits business hours is not "available" until capacity is checked.
- Business hours use interval lists and special-date overrides; preserve split shifts and
  require the full appointment duration to fit within a valid interval.
- Services use stable IDs. Appointments preserve immutable service snapshots, including
  name, pricing model/value, and duration, so historical bookings do not drift when the
  catalogue changes or a reference is removed.
- RLS is not a decorative security claim: Auth.js identity is not automatically
  `auth.uid()`. Application authorization and private-schema access remain authoritative.
- Database uniqueness arbitrates idempotency and concurrency. Never rely on an unsafe
  check-then-act sequence for external operations or inbound receipts.
- Derive customer summaries and analytics from authoritative domain records rather than
  maintaining a second mutable truth.
- Preserve existing private-function, sensitive-configuration, foreign-key, tenant-binding,
  and supporting-index hardening. Do not remove required indexes solely because development
  statistics label them unused.
- Reference the source migrations for exact schema history; do not duplicate migration
  history in instruction files.
