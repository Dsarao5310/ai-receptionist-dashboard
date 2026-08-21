# Service layer

Pure selector functions over already-loaded state. Nothing here fetches, caches,
or mutates: a selector takes a dataset and/or the configuration document and
returns a derived value. That keeps every number on screen traceable to one
authoritative source, and it means swapping the demo adapter for a real backend
is a change of *where the state comes from*, not a change to the UI.

State ownership, which nothing in this layer may duplicate:

| Owner | Owns |
| --- | --- |
| Business Profile (`configuration` store) | business details, timezone, hours, special hours, service catalogue, knowledge |
| AI Receptionist (`configuration.ai`) | receptionist behaviour, greeting, escalation, booking rules |
| `DemoDataProvider` | conversations, calls, appointments, activity, customers |
| Appointments | the immutable service snapshot on each booking |

If a value can be computed from the above, compute it. Do not store a second
mutable copy that can drift.

---

## Service identity: snapshot vs. reference

An appointment carries two service fields, and they answer different questions.

```ts
appointment.serviceId  // string | null — which catalogue service this came from
appointment.service    // ServiceSnapshot — what was actually booked
```

**`service` is the snapshot: what was booked.** Name, price model, price and
duration, copied by value at the moment of booking and never rewritten. It is
the record of what the customer was quoted and agreed to. Repricing a haircut
from $25 to $30 must not restate what last month's customers paid, and deleting
a service must not erase the appointments that used it.

**`serviceId` is the reference: which catalogue entry it originally came from.**
Stable across renames, so cross-links survive editing. Null when that service has
since been deleted — an unresolved reference, never a corrupted appointment.

Rules:

- **Never** mutate `appointment.service` to match the catalogue. There is no
  "sync to current pricing" operation, and there should not be one.
- **Never** move snapshot fields (`durationMin` included) back to the appointment
  root, and never duplicate them anywhere else. One snapshot, on the appointment.
- **Never** match an appointment to a service by name. Names are presentation,
  ids are identity, snapshots are history.
- Search *does* match the booked name (`services/appointments.ts`), so a renamed
  service's history stays findable by what it was called at the time.

`getServiceDrift` / `getServiceComparison` in `business.ts` report how a booking
differs from the catalogue today (`renamed`, `repriced`, `reduration`,
`deleted`). They exist for **visibility only** — the appointment drawer shows a
quiet "Service updated since booking" note. They never write.

**Drift is drawer-only, by decision.** The appointment list, the calendar cards
and the mobile cards show the booked service name and nothing else. Drift is
detail that matters when you are looking at one booking; repeated down a list it
is noise that makes ordinary rows look broken. Do not add drift badges to list
or calendar surfaces.

**Deactivating a service is not drift.** An inactive service is the same service
at the same price — it has simply been taken off the menu. It keeps resolving
through `getCatalogueService`, keeps showing its snapshot, and stays
rescheduleable. What deactivation *does* change is what may be booked next:

| Question | Selector |
| --- | --- |
| What can a **new** booking be made against? | `getBookableServices(config)` |
| What does this **historical** appointment refer to? | `getCatalogueService(config, appointment)` |
| What was the customer actually told? | `appointment.service` |

Booking-facing surfaces — the receptionist's spoken service list, price quotes,
any future new-appointment form — must use `getBookableServices`. History must
never be filtered by `active`.

---

## Time: the business timezone is the only authority

`config.business.timezone` decides what "today", "open", and "this week" mean.
The browser's zone is an accident of where someone happens to be sitting and
must never reach business logic.

Two kinds of value exist and must not be confused:

- an **instant** — one moment in time (`createdAt`, a conversation `timestamp`),
  stored as an ISO string with an offset. Absolute; reads differently per zone.
- a **wall-clock value** — `appointment.date` (`"2026-08-17"`) and
  `appointment.time` (`"14:30"`), plus every `open`/`close` in the hours
  configuration. These have no zone of their own and mean nothing until resolved
  against the business timezone.

Use `@/lib/timezone` to move between them (`wallClockToInstant`, `zonedDayKey`,
`startOfZonedDay`, `addZonedDays`, …) and `@/lib/business-format` to display
them. Do not use `getHours()`, `getDay()`, `setHours()`, `toLocaleDateString()`
or `new Date("…T00:00:00")` for anything business-facing — each of those silently
means "in the viewer's zone".

The one sanctioned exception is the appointment calendar grid, which builds
plain civil dates in local time and reads them back in local time so the two
cancel out. Its helpers are documented as such in `data/generator.ts`, and
*which day is today* is still resolved from the business timezone.

---

## Scheduling: business-time validity is not availability

`scheduling.ts` answers exactly one question — *is this time inside the hours the
business says it is open?* — accounting for split shifts, special hours and
closures, and whether the whole appointment fits before closing.

It deliberately does **not** know about existing bookings, staff, capacity,
concurrency, or what a connected calendar thinks. Those make up *availability*,
which needs an authoritative backend and atomic reservation, and which arrives
with the integrations phase. Do not grow this module into a booking engine, and
do not build a second one beside it.

The distinction shows up in the wording: the UI says **"valid business time"**,
never "available". Calling a slot available when only its hours have been checked
would be a promise the app cannot keep.

Reschedule rules, stated once:

- Rescheduling changes **when**, and nothing else. The duration comes from
  `appointment.service.durationMin` — the booking's own snapshot — never from
  the catalogue as it stands today. A salon lengthening Haircut from 30 to 45
  minutes must not silently lengthen appointments already agreed at 30.
- Changing *what* was booked would need an explicit change-of-service action
  writing a new snapshot. That workflow does not exist yet; do not smuggle it
  into reschedule.
- The UI disables what it can and re-validates on submit. Disabled controls are
  convenience; `checkRescheduleSlot` is what decides. When the backend lands it
  becomes authoritative over both, and the same pure functions can run on either
  side so the two cannot drift apart.

## The provider adapter boundary

No providers are connected yet. When they are — telephony, calendar, email, SMS,
workflow automation — each gets an adapter, and every adapter obeys the same
rule at its edge. **This is a hard rule, not a preference:** the first real
adapter must go through `adapters/provider-time.ts`, and no adapter may carry its
own timezone conversion beside it. A second conversion path is how the zone
guarantees in this codebase get quietly lost.

> **Normalize at the boundary. Core logic only ever sees canonical values.**

Concretely, for any timestamp arriving from or leaving for a provider:

1. **Parse it correctly.** Honour the offset the provider sent. A payload
   carrying `2026-08-17T09:00:00-07:00` is a different instant from
   `2026-08-17T09:00:00Z`, and one with no offset at all is not a timestamp yet —
   it is a wall-clock value plus a zone the provider stated elsewhere.
2. **Preserve the actual instant.** Never re-anchor a moment to a different zone
   to make it look nicer. Converting for display is fine; converting the stored
   value is data loss.
3. **Normalize into the canonical representation.** Instants become ISO strings
   with an offset. Anything the domain models as wall-clock — an appointment's
   `date` and `time` — is projected into the business timezone at this boundary
   and stored as a day key plus `HH:mm`.
4. **Answer business-hour and calendar-day questions in the business timezone.**
   "Was this after hours?", "did this happen today?", "which day bucket?" are
   decided by `config.business.timezone`, not by the provider's zone and not by
   the server's.
5. **Let neither browser-local nor provider-local assumptions leak inward.** A
   provider's own timezone field is an input to step 3 and stops there. Selectors
   below the adapter must never need to know which provider a record came from.

`adapters/provider-time.ts` holds the small shared interface that expresses this,
so the rule is executable rather than only written down here.

Outbound follows the same shape in reverse: resolve wall-clock values to an
instant in the business timezone first, then format for whatever the provider
expects. Never hand a provider a bare `"2026-08-17T09:00"` and hope.

If a provider's payload does not fit `ProviderTimestamp`, widen that type. Do not
parse it locally in the adapter — that is the same mistake with a shorter blast
radius.

---

## Integrations: providers, capabilities, and who sees which

Two vocabularies, one source of truth.

`IntegrationRecord` (in `lib/store/integrations.ts`, typed in `types/integrations.ts`)
is the stored provider-level state — Vapi, Twilio, Google Calendar, Gmail, n8n,
Pinecone, the model provider. Everything a business owner sees is **derived**
from those records by `services/integrations.ts`:

| Audience | Route | Vocabulary |
| --- | --- | --- |
| Administrator | `/admin/integrations`, `/admin/workflows`, `/admin/settings` | Vapi, Twilio, n8n, Pinecone, environments, workflow refs |
| Business owner | `/connections`, `/settings` | Voice, SMS, Email, Calendar, AI Receptionist, Business Knowledge |

There is no second copy. `getCapabilityStatus` computes "Voice: Connected" from
the providers voice depends on; `getReceptionistStatus` reads the same records
for its channel and calendar states. A provider failing degrades exactly the
capabilities that depend on it — Twilio erroring reads as "SMS needs attention"
to the owner and as "Twilio — Error" to an operator, from one fact.

`CAPABILITY_DEPENDENCIES` is a flat map rather than a graph on purpose: the real
relationships are shallow, and a dependency engine would be more machinery than
the problem deserves.

### Adapters

Every provider is reached through `IntegrationAdapter` (`adapters/types.ts`) and
resolved by id in `adapters/index.ts`. Nothing above that registry imports a
provider module. Current implementations are mocks over local state: they make
no network calls, hold no credentials, and are deterministic — a connection test
returns the same result for the same state, because a demo that fails at random
cannot be QA'd.

Adapters are pure. They return a `RecordPatch`; the store applies it. That keeps
every mutation in one place.

### Two rules adapters are held to

1. **Credentials never cross the boundary.** An adapter may report that a
   credential is configured; it may never return its value. `IntegrationConfigField`
   has no value field for sensitive entries, and tests assert that none appears.
   In production these adapters run on the server and the browser calls an
   authenticated API. The browser must never hold a provider secret and must
   never call a provider — or an automation webhook — directly.

2. **Timestamps normalize through `adapters/provider-time.ts`.** The mock
   adapters deliberately build a provider-shaped timestamp and put it back
   through `instantFromProvider`, so the boundary is on the executed path rather
   than only in prose. Each mock uses a different wire format — UTC, explicit
   offset, and bare wall-clock plus a stated zone — and the calendar adapter's
   zoned format is the case that would silently break if normalization were ever
   bypassed. A test asserts it throws when the zone is stripped.

### Errors

Raw provider payloads never reach a component. `NormalizedError` carries a safe
`message` for any audience and an optional `adminDetail` shown only in admin
surfaces — still sanitised, never a token, key, credentialed URL, or raw upstream
body.

---

## Roles, workspaces, and what the frontend is allowed to decide

`lib/permissions.ts` holds the role → permission table, and `lib/store/session.ts`
holds the current role and active workspace. Components ask
`can(role, "integrations.manage")` rather than comparing role strings, so when
real authentication arrives only the source of `role` changes.

Every integration record, workflow and event is already scoped by `workspaceId`,
and the admin console can switch workspaces today. Multi-tenancy is therefore a
matter of populating that scope from a verified session, not a migration.

**Hidden navigation is not security.** `AdminGate` and the nav filter decide what
to *render*. A user who types an admin URL still loads the route. Real
enforcement lives where the data does:

```
browser  →  authenticated API  →  provider adapters  →  provider
                   ↑
        the only place a decision counts
```

### The backend will be authoritative for

authentication · role · workspace access · integration management · the trusted
clock · scheduling validation · availability and capacity · provider credentials
· audit logging.

Frontend validation stays as it is — immediate feedback, never the last word.
The scheduling rules are already pure functions taking an injected clock so the
same code can run on both sides without drifting.
