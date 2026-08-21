# Security architecture

## Authentication

**Auth.js (NextAuth v5)**, chosen because session cryptography is the wrong
thing to invent and Auth.js is the best-supported option built for this app's
App Router. One auth library, no competing second one.

Session strategy is a **signed JWT in an httpOnly cookie** (`sameSite=lax`,
`secure` in production). No database session table exists yet; this is
server-verifiable today and stays correct later. JavaScript cannot read the
cookie, and the browser never receives a token.

Providers are registered only when configured, so the same file becomes
production-ready by supplying environment variables:

| Method | Enabled by | Intended for |
| --- | --- | --- |
| Google | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | production |
| Email link | disabled until an Auth.js adapter persists verification tokens | future |
| Development accounts | never registered when `NODE_ENV=production` | local only |

No GitHub login: this product is for business owners, not developers.

**The token carries `userId` and `platformRole` only.** It deliberately does not
carry a workspace role — roles belong to a membership, are re-read per request,
and on a token would survive a permission change until expiry.

## User vs. membership

Three entities, kept apart:

- **User** — a person. No business role on it.
- **Workspace** — a tenant: identity, plan, owner. *Not* business configuration;
  hours, services and knowledge stay in the configuration document that Business
  Profile owns.
- **WorkspaceMembership** — the join, and the only place a business role lives.

A role is not a property of a person: the same person may own one business and
be staff at another.

## Platform admin vs. business roles

Two independent axes, not one ladder:

- **platform role** (`operator` | `member`) → platform permissions.
- **workspace role** (`owner` | `manager` | `staff`) → business permissions,
  scoped to one workspace.

`PLATFORM_ONLY` and the workspace tables are **disjoint**, asserted by a test. A
business owner has complete authority over their business and none over the
platform running it — no provider credentials, no workflow engine, no other
tenants, no platform logs. Reserving `appointments.correct_history` for the
platform is the same principle: ordinary rescheduling may never target the past.

Initial role contents are **product defaults**, not policy. They live in one
table so changing them is a one-file edit.

## Server authorization flow

```
verify session → resolve membership → check permission → act, scoped
```

`server/auth/policy.ts` holds the decisions as pure functions (testable without a
request). `server/auth/guards.ts` adds the session and cookie:

- `requireUser()` — verified session, account re-loaded so a suspended or
  deleted user cannot ride a valid cookie.
- `requireWorkspace(requested?)` — an id from a body, query string or cookie is a
  *request*; membership decides.
- `requirePermission(permission, requested?)` — returns the authorized context.
- `requirePlatformOperator()` — platform authority, independent of any tenant.

Every protected read and write scopes by `context.workspaceId` — the authorized
value, never the requested one.

**Frontend filtering is not security.** Navigation, `AdminGate` and Proxy
decide what to render or where to redirect. Delete all three and the app is
still secure; it is just ruder. Proxy checks only that a session cookie is
*present* — it verifies nothing.

## Tenant isolation

Queries are issued by repositories **bound** to an already-authorized workspace
(`server/db/workspace-scope.ts`). `workspaceScope` takes an `AuthContext`, which
only `authorizeWorkspace` can produce, so there is no `getAppointment(id)`
anywhere in the codebase — the dangerous call is unspellable rather than merely
discouraged, and no query exists that searches globally and checks ownership
afterwards.
"No such workspace" and "not a member" are the **same** opaque failure —
`AuthorizationError.publicMessage` is always `"Access denied."` — because
distinguishing them confirms a tenant's existence to someone with no right to
know. Workspace lists are derived from membership, so tenants cannot be
enumerated.

## Trusted clock

Two clocks, one authority:

- **browser clock** — immediate feedback while typing. Allowed to be wrong.
- **server clock** (`server/clock.ts`) — decides.

`serverNow()` takes no arguments and no protected action accepts a time in its
input, so there is nothing to forget to validate. A test asserts the action's
declared input carries no time field of any spelling.

## Provider secret boundary

Credentials belong on the server, in a secrets store or vault. **Never** in
browser local storage, client-readable API responses, `NEXT_PUBLIC_*` variables,
or the identity tables. The frontend is allowed to know *that* a credential is
configured, never its value.

Authentication tokens and provider credentials are separate concerns and must
not share storage or lifetime.

## Admin/client API separation

The client vocabulary is Voice, SMS, Email, Calendar, AI Receptionist, Business
Knowledge. Provider names belong to admin surfaces only, and provider metadata
must stay behind `integrations.view` — a platform-only permission — so hiding it
in the UI is never the mechanism.

## Development role preview

Removed. The previous demo role switcher is gone: role and workspace come from
the verified session, and the client has no setter. The only development
affordance is the sign-in account list, which is not registered in production.

## Persistence

Postgres (Supabase), schema `app`. Supabase is the database and the migration
platform, **not** the authentication system — Auth.js owns sessions and
application policy owns workspace authorization. See the root README for the
credential model, the migration workflow and the row-level-security decision.

The short version of each:

- **Two roles.** `app_runtime` has DML on schema `app` and nothing else — no DDL,
  no other schema, no superuser, no `BYPASSRLS`, and no `UPDATE`/`DELETE` on
  `audit_events`. `app_migrator` owns the schema and is used only by migrations,
  seeding and test setup. There is no Supabase service-role key in this project.
- **Append-only audit.** Enforced by privilege, not convention. A bug in the
  product cannot rewrite the record of what happened, because the credential the
  application holds has no verb for it.
- **No RLS for tenant isolation.** `auth.uid()` is null on every connection this
  application opens, so a policy written the usual way would protect nothing while
  looking like it did. Isolation is enforced above the database and proven against
  it by `server/db/tenant-isolation.test.ts`.

## Workflow orchestration (n8n)

n8n is **admin infrastructure**, not a data source. It performs actions;
Supabase remains the source of truth for everything the dashboard reads. No page
queries n8n.

### The two directions

```
outbound   dashboard → server action → Auth.js session → permission
                     → domain validation (trusted clock, business hours)
                     → capability → workflow mapping → signed request → n8n
                     → normalized result → Supabase → dashboard

inbound    n8n → signed ingestion route → signature + replay check
               → schema validation → tenant resolved from workflow mapping
               → idempotency claim → one transaction → Supabase → dashboard
```

The browser never talks to n8n and never learns where it is.

### Capabilities, not workflows

A caller names an **operation** — `appointment.reschedule` — and never a
workflow, webhook, URL or execution. `workflow_mappings.operation` resolves it
against the *authorized* workspace, so there is no parameter through which a
client, a server action, or a future contributor could name a target. There is
deliberately no `executeWorkflow(id, payload)` anywhere in the codebase.

The set of things this dashboard can cause n8n to do is exactly
`server/integrations/workflows.ts`, and it is short enough to read.

### Authentication, both ways

HMAC-SHA256 over `v1:{timestamp}:{body}`, compared with `timingSafeEqual`.
Signing the timestamp is what makes the five-minute freshness window mean
something — a captured request cannot have its timestamp moved forward. Two
separate secrets, so the direction a credential authenticates is not
interchangeable:

| Credential | Direction | Reference |
| --- | --- | --- |
| `N8N_REQUEST_SIGNING_SECRET` | dashboard → n8n | `env:N8N_REQUEST_SIGNING_SECRET` |
| `N8N_WEBHOOK_SIGNING_SECRET` | n8n → dashboard | `env:N8N_WEBHOOK_SIGNING_SECRET` |

Both are resolved only by `server/integrations/credential-store.ts`, which
returns a `Secret` — a wrapper whose `toString`, `toJSON` and Node inspection
all return `[redacted]`. Every accidental disclosure route runs through one of
those; getting the real value requires `.expose()`, which is greppable and reads
like the deliberate act it is. The frontend sees `Configured` or
`Not configured`, and rotation means changing what a reference points at, which
changes no API shape and no component.

### Tenant identity is never taken from the payload

A signed request proves the sender holds the shared secret. It says nothing
about *which business* the event is for. So the inbound envelope has no
`workspaceId` field at all — the validator drops one if sent — and the workspace
is resolved from `workflowRef` through `workflow_mappings`, a mapping we issued,
which a unique index constrains to name exactly one workspace.

### Idempotency

Both directions, enforced by unique constraints rather than by application logic
that could be raced:

- **Outbound** — `integration_operations (workspace_id, idempotency_key)`. The
  key is derived on the server from the operation, the target and its
  `updatedAt`; a retry computes the same key and finds the same row. A key
  arriving with a *different* request digest is refused rather than answered
  with the first result.
- **Inbound** — `integration_inbound_events (workspace_id, source,
  external_event_id)`. The insert *is* the claim; two concurrent deliveries both
  attempt it and Postgres arbitrates.

### The state machine, and the honest state

`pending → processing → succeeded | failed | retryable_failure | sync_required`

The row is written *before* the request goes out, so an operation that hangs and
is abandoned by the timeout still leaves evidence. `sync_required` is the state
worth naming: the workflow succeeded and our own write then failed, so an
external system may have acted on something the database does not reflect.
Nothing retries it — retrying would repeat the external action — and nothing
guesses which side is right. It is recorded, audited, and surfaced to an
operator on `/admin/workflows`.

### When nothing is mapped

A workspace with no mapping for an operation has no external system that needs
to agree with it, so the operation proceeds against the database exactly as it
did before this phase existed. A business does not lose the ability to
reschedule because an integration nobody configured is absent.

### Modes

`N8N_MODE` is explicit rather than inferred from whether a URL happens to be
set. `disabled` means no orchestration and says so; `simulated` is a
deterministic in-process engine for development and tests; `live` requires a base
URL and both secrets. A production build **refuses to start** in `simulated`
mode — shipping it would mean the product reported that automation ran when
nothing did.



## Google Calendar

The first real external provider. Supabase remains the durable truth; the
calendar is a synchronised representation of it, and the two are allowed to
disagree — visibly.

### Credentials

Two tables, and the split is the point:

| | holds | joined against |
| --- | --- | --- |
| `provider_credentials` | that a credential exists, who set it, when it rotated | yes, by admin queries |
| `provider_secrets` | AES-256-GCM ciphertext, nothing else | **never** |

`workspaceScope` does not expose `provider_secrets`, so the ordinary route to
tenant data cannot reach a token at all. Reading one requires naming that table
explicitly *and* holding `CREDENTIAL_ENCRYPTION_KEY`, which lives in server
configuration and never in the database — a stolen dump is inert. GCM is chosen
over CBC because it authenticates: a tampered ciphertext throws rather than
yielding plausible garbage that would be sent to Google as a token. `key_version`
is stored per row so a key rotation can re-encrypt progressively instead of
asking every business to reconnect.

Everything comes back as a `Secret`, whose `toString`, `toJSON` and Node
inspection all render `[redacted]`.

### OAuth

Provider authorization, *not* user authentication. Auth.js still answers "who is
using this dashboard"; this answers "which Google account has this workspace
authorised us to write to". Merging them would tie a business's bookings to
whichever staff member happened to sign in, and break when they left.

The `state` parameter does three separate jobs:

- **signed** (HMAC) so it cannot be forged,
- **backed by a row consumed on first use**, so a captured callback cannot be
  replayed — `where consumed_at is null` makes the database the arbiter,
- **carrying the workspace only by reference.** The workspace id is in the row,
  never the URL. There is no field in the callback a browser could edit.

And the callback re-checks `integrations.manage` *against the workspace the
state names*. Consent proves someone controls a Google account; it proves
nothing about their authority here. That check is what keeps a leaked state
useless.

Tokens are refreshed server-side with 60 seconds of margin. A refresh response
that omits a refresh token does not overwrite the stored one — Google routinely
omits it, and writing null would turn a durable connection into one that dies in
an hour. Disconnect revokes remotely, then forgets locally; a revocation failure
does not block the local removal, because a business that clicked "disconnect"
must end up disconnected.

### What can be done to a calendar

Five operations — create, reschedule, cancel, list blocking events, read one
event — plus a read-only connection test. The generic `request()` that could
express anything else is private to `client.ts` and exported to nobody, so there
is no `calendarRequest(method, path, body)` for a caller to reach for.

Payloads are built entirely from server-side records. Nothing a browser sent
reaches Google.

### Timezones

The rule the whole product already follows, applied here:

```
stored wall clock + BUSINESS timezone → instant → Google
Google instant + BUSINESS timezone → wall clock → stored
```

The *calendar's* own timezone is used for exactly one thing: interpreting
all-day values Google sends, which carry no offset. It never determines when a
booking happens. A mismatch is surfaced to an administrator because it is the
first thing worth ruling out when a time looks wrong — but it is not an error,
and it changes no arithmetic.

### External changes

Events we create carry the appointment and workspace ids in Google's private
extended properties. Matching by event title or customer name would be guesswork
that fails the first time two people share a name.

| what happened | what we do |
| --- | --- |
| moved to a time the rules allow | adopt it |
| moved to a time the rules forbid | flag `external_change_detected`, change nothing |
| deleted | keep the appointment, flag it |

The middle row is why this is not "last write wins": Google will happily accept
3am on a closing day, and an external system has no idea what a business's hours
are. The last row matters just as much — deleting a calendar entry is not the
same statement as "this customer is not coming", and erasing a booking on that
basis would destroy history on the strength of a gesture in another application.

### Which executor runs

One orchestration spine, two executors, chosen by configuration:

- a **mapped n8n workflow** wins whenever one exists — that is the deployment's
  stated answer,
- otherwise the **server-side calendar adapter** runs, under the same operation
  row, the same idempotency key, the same states and the same audit trail.

Two ways to reach a provider; one place to look when something goes wrong.



## Backend authority (still to come)

Still ahead: real availability and capacity (atomic slot reservation), provider
credential storage in a managed vault rather than environment variables, and the
remaining providers behind the adapter interface. Everything else on the list -
authentication, role, workspace access, integration management, trusted clock,
scheduling validation, audit logging, durable persistence and workflow
orchestration - is now server-side and durable.

Frontend validation stays as it is: immediate feedback, never the last word.
