# Receptionist AI — Dashboard

A multi-tenant dashboard for a business's AI receptionist: the calls and messages
it handled, the appointments it booked, the business it represents, and the
infrastructure behind it.

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run db:migrate             # build the schema
npm run db:seed                # two demo tenants (never runs in production)
npm run dev
```

Sign in at `/sign-in`. Outside production a development account list is offered
so the roles can be exercised:

| Account | Role |
| --- | --- |
| `alex@coastalbloom.example` | Owner — Coastal Bloom Salon |
| `marcus@coastalbloom.example` | Manager — Coastal Bloom Salon |
| `nina@coastalbloom.example` | Staff — Coastal Bloom Salon |
| `priya@harbourdental.example` | Owner — Harbour Dental |
| `sam@receptionist.example` | Platform operator — both workspaces |

## Configuration

| Variable | Required | What it is |
| --- | --- | --- |
| `AUTH_SECRET` | yes | Signs the session cookie. Generate with `openssl rand -base64 32`. Production refuses to start without it. |
| `DATABASE_URL` | yes | Application runtime. Must be a least-privilege role — see below. |
| `MIGRATION_DATABASE_URL` | yes | Schema changes, seeding and test setup. Never read by the running app. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | no | Enables Google sign-in. Absent, the provider is not registered. |
| `EMAIL_SERVER` / `EMAIL_FROM` | do not set | Reserved. Email magic links are rejected until Auth.js has durable verification-token persistence. |
| `N8N_MODE` | yes in production | `disabled`, `simulated` or `live`. Production refuses to start on `simulated`. |
| `N8N_BASE_URL` | when live | Where the workflow engine is. Server-only; the browser never learns it. |
| `N8N_REQUEST_SIGNING_SECRET` | when live | Signs requests the dashboard sends n8n. |
| `N8N_WEBHOOK_SIGNING_SECRET` | for ingestion | Verifies requests n8n sends the dashboard. Without it, every inbound event is refused. |
| `N8N_TIMEOUT_MS` | no | Outbound call deadline. Defaults to 10000. |
| `VAPI_MODE` | yes in production | `disabled`, `simulated` or `live`. Production refuses `simulated`. |
| `VAPI_API_KEY` | when live | Private server API credential; never exposed to the browser. |
| `VAPI_WEBHOOK_BEARER_TOKEN` | when live | Independent 32+ character token authenticating Vapi server events. |
| `VAPI_PUBLIC_WEBHOOK_URL` | when live | Exact HTTPS callback ending in `/api/internal/vapi/events`. |
| `MODEL_PROVIDER_MODE` | yes in production | `disabled`, `simulated` or `live`. Production refuses `simulated`. |
| `AI_GATEWAY_API_KEY` | when live outside managed OIDC | Server-only AI Gateway credential. Vercel deployments may use `VERCEL_OIDC_TOKEN` instead. |
| `MODEL_PRIMARY_ID` / `MODEL_FALLBACK_ID` | when live | Distinct approved model ids; currently GPT-5.4 Mini with Claude Haiku 4.5 fallback. |
| `MODEL_TIMEOUT_MS` | no | Total generation deadline; defaults to 8000 and is bounded to 1–30 seconds. |
| `MODEL_MAX_INPUT_TOKENS` / `MODEL_MAX_OUTPUT_TOKENS` | no | Server-enforced request ceilings; defaults to 6000 / 350. |
| `MODEL_MAX_COST_MICRO_USD` | no | Conservative per-request preflight ceiling including the one allowed retry; defaults to 10000 ($0.01). |

Runtime validation lives in `src/server/env.ts`; the same pure rules are exposed
through `npm run deploy:check` and `npm run deploy:build`. Nothing is prefixed
`NEXT_PUBLIC_`, so none of it can reach a browser bundle. See
[`docs/deployment-foundation.md`](docs/deployment-foundation.md) for the HTTPS,
callback, environment-separation, and release contract.

## Database

Postgres, hosted on Supabase, in a schema called `app`.

Supabase is the database and the migration platform. It is **not** the
authentication system: Auth.js owns sessions, and application policy owns
workspace authorization. Introducing Supabase Auth would mean two competing
identity systems, so it is deliberately unused.

### Commands

```bash
npm run db:migrate   # apply pending migrations
npm run db:status    # what is applied, what is pending
npm run db:reset     # drop the schema and rebuild it from scratch
npm run db:seed      # deterministic demo data for two tenants
```

Migrations live in `supabase/migrations` and are applied in filename order,
once, inside a transaction, with a checksum recorded. Editing a migration that
has already been applied is an error rather than a silent divergence — add a new
one instead. An empty database plus that directory reproduces the schema exactly.

### Two credentials, deliberately unequal

There is **no Supabase service-role key anywhere in this project.** It bypasses
every row-level policy, and making the most powerful available credential the
default data path is how least privilege quietly stops being true.

Instead there are two Postgres roles:

| Role | Used by | May |
| --- | --- | --- |
| `app_runtime` | the application (`DATABASE_URL`) | `SELECT`/`INSERT`/`UPDATE`/`DELETE` in schema `app` |
| `app_migrator` | migrations, seeding, tests (`MIGRATION_DATABASE_URL`) | own and alter schema `app` |

Neither is a superuser, neither has `BYPASSRLS`, and neither can reach the `auth`
or `storage` schemas. `app_runtime` additionally **cannot create or drop
objects**, and **cannot `UPDATE` or `DELETE` `audit_events`** — the audit trail
is append-only as a matter of privilege, not convention. That is why seeding
uses the migrator credential: clearing the audit table is something the
application is genuinely not allowed to do.

Provider credentials are not in the database at all. `provider_credentials`
records *that* a credential exists and where it lives; it has no value column.

### Row-level security

RLS is **not** used for tenant isolation, and the reason is worth stating rather
than leaving as an absence.

Supabase's RLS story assumes Supabase Auth: policies are written against
`auth.uid()`, read from a JWT that Supabase's API layer verifies. This
application authenticates with Auth.js, so `auth.uid()` is null on every
connection it opens. A policy written the usual way would evaluate against null
and deny everything — or, if someone "fixed" that by loosening the predicate,
would sit in the database looking like protection while enforcing nothing.
Decorative security is worse than none, because it stops people looking for the
real thing.

What actually protects tenants:

- every query is issued by a repository bound to a workspace id that came from a
  verified session and a membership lookup (`src/server/db/workspace-scope.ts`);
- the tests in `src/server/db/tenant-isolation.test.ts` prove that against this
  database, not against a mock;
- the database contributes what it genuinely can — a least-privilege role, an
  append-only audit table, `CHECK` constraints that refuse malformed or
  secret-bearing rows, and a schema that PostgREST does not expose, so the anon
  and service-role API keys cannot see it at all.

The step that would make RLS real here is passing a verified tenant claim into
the session — `SET LOCAL app.workspace_id` inside every transaction, with
policies reading `current_setting`. That is a coherent future addition and needs
no Supabase Auth. It is not taken now because it has to be all-or-nothing to
mean anything.

## Testing

```bash
npm test
```

Database tests build a **separate schema** (`app_test`) from the same migration
files and seed it with the same fixtures, so they never touch application data.
Reads and writes in tests use `DATABASE_URL` — the same least-privileged role
production uses — because a test passing under a more powerful credential would
prove nothing about production. The runner's clock is pinned to UTC, which is
deliberately *not* either demo tenant's timezone.

## Where things live

```
src/
  app/          routes; the root layout resolves session + workspace data
  components/   shell and UI primitives
  features/     one folder per product area
  services/     pure domain logic — scheduling, analytics, integrations
  lib/          client-side helpers, stores, timezone and formatting
  server/       everything that must never reach a browser
    auth/       Auth.js config, authorization policy and guards
    db/         connection, repositories, migrations' TypeScript side, seed
    actions/    server actions — the only way the client mutates anything
supabase/
  migrations/   version-controlled schema
```

Two longer notes sit next to the code they describe:
[`src/server/README.md`](src/server/README.md) for authentication, authorization
and persistence; [`src/services/README.md`](src/services/README.md) for the
domain rules — service snapshots, business time, and the provider boundary.

## Workflow orchestration

n8n is connected as an **orchestration layer**, not a data source. The dashboard
asks it to carry out named operations; Supabase remains the source of truth for
everything any page reads. No page queries n8n, and the browser never reaches it.

- **Outbound.** A server action names an *operation* (`appointment.reschedule`),
  never a workflow. The server resolves it against the authorized workspace via
  `workflow_mappings`, signs the request, and commits the database change only
  once the workflow confirms success.
- **Inbound.** `POST /api/internal/n8n/events` verifies an HMAC signature over
  the body and a signed timestamp, validates the payload, resolves the tenant
  from the workflow reference (never from the payload), claims an idempotency
  key, and applies the change in one transaction.

Set `N8N_MODE=simulated` for development: a deterministic in-process engine that
exercises the whole path — signing, idempotency, state transitions, failure
handling — without a live instance. See
[`src/server/README.md`](src/server/README.md) for the full design.

## Google Calendar

The first real external provider. Supabase stays the durable source of truth;
the calendar is a synchronised representation of it.

- **Connecting** is an OAuth handshake started from the admin Calendar page and
  available only to platform operators. The workspace being connected comes
  from a signed, single-use state row — never from the callback URL.
- **Tokens** are encrypted with AES-256-GCM in `provider_secrets`, a table no
  repository joins against, using a key that lives only in server
  configuration. The frontend sees `Configured` or `Not configured`.
- **Writes** go through the same orchestration spine as everything else: a
  mapped n8n workflow if one exists, otherwise the server-side adapter, both
  under one idempotency key and one audit trail.
- **External edits** made directly in Google are validated against the
  business's own rules before being adopted, and surfaced for reconciliation
  when they cannot be.

`GOOGLE_CALENDAR_MODE=simulated` runs an in-process calendar with Google's
semantics for development and tests. A production build refuses to start on it.
See [`src/server/README.md`](src/server/README.md) for the credential model, the
OAuth protections and the reconciliation policy.

## Provider status

Twilio SMS has a real server adapter, signed inbound and delivery-status
webhooks, tenant-owned number mapping, idempotent sending, and simulator test
coverage. It is **not live-certified** because the configured trial account owns
no SMS-capable number; see [`docs/twilio-live-certification.md`](docs/twilio-live-certification.md).

Vapi has an application-side inbound lifecycle implementation: authenticated
`status-update` and `end-of-call-report` events, trusted assistant/phone tenant
mapping, durable idempotency, monotonic terminal state, and safe transcript
persistence. It is **simulator verified, not live-certified**; there is no Vapi
account, registered webhook, live call, tool-call execution, model-provider
certification, or recording persistence.

The model provider has a server-only AI Gateway implementation with an explicit
disabled/simulated/live mode, approved primary/fallback policy, deterministic
reply and call-analysis evaluations, structured output validation, prompt-
injection boundaries, and time/token/cost ceilings. It is **application-ready
and simulator verified, not live-certified**; no gateway credential or live
request was used. See [`docs/model-provider-readiness.md`](docs/model-provider-readiness.md).

The customer email channel now has a private-schema mailbox/thread/message
foundation, trusted mailbox tenant mapping, shared inbound receipts, outbound
operation idempotency, and deterministic simulation. It is **application-ready
and simulator/database verified, not Gmail-ready**: there is no Gmail OAuth,
watch/Pub/Sub lifecycle, public provider callback, live send/read, credential,
or live certification. Its schema is part of the verified 17-file staging and
production checkpoint and its fail-closed code is deployed. Live mode fails closed;
see [`docs/email-provider-readiness.md`](docs/email-provider-readiness.md).

Business Knowledge now has a server-only provider boundary with server-issued
tenant namespaces, durable reconciliation/tombstone state, monotonic write
ordering, a deterministic simulator, and a live Pinecone adapter. It is **live
and certified end-to-end through the real UI on staging (2026-08-26)**:
migration file 18 is applied and verified in both environments, the
application code merged via PR #2 (`f365cea`) and is deployed to both staging
and production, and the full round trip — UI save, database
`provider_document_id`/sync state, Pinecone semantic search, and delete — was
verified live against the redeployed staging deployment. Local migration
file 19 removes unused runtime update authority from the immutable namespace
mapping and is verified against disposable `app_test`, but remains pending
application in both staging and production `app`. Production has the code but
no `KNOWLEDGE_PROVIDER_MODE`/Pinecone credential configured, so it remains
fail-closed in practice there; no production live certification is claimed.
See
[`docs/knowledge-provider-readiness.md`](docs/knowledge-provider-readiness.md).
