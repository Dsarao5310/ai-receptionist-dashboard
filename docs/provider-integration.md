# Adding a provider

What a new provider integration has to supply, and what it gets for free.

This is written from two providers that actually shipped — n8n (orchestration,
inbound + outbound) and Google Calendar (OAuth, outbound, external changes,
live-certified against the real API). Everything below either already exists in
the repository or was proven necessary by one of them. Nothing here is
speculative scaffolding for providers that do not exist yet.

---

## What you inherit

You do not implement any of this. It is not optional, and it is not per-provider.

| Concern | Where it lives |
| --- | --- |
| Session, RBAC, workspace authorization | `server/auth/*`, `requirePermission` |
| Tenant-scoped data access | `workspaceScope(context)` — every repository |
| Encrypted credential storage | `SecretStore` / `credentialStore` (AES-256-GCM, `Secret` wrapper) |
| Operation lifecycle + idempotency | `runWorkflowOperation` in `n8n/operations.ts` |
| Partial-failure handling (`sync_required`) | `commitWithSyncGuard` in `calendar-sync.ts` |
| Inbound gate sequence + receipts | `integrations/inbound/pipeline.ts` |
| Timestamp normalization | `services/adapters/provider-time.ts` |
| Normalized error shape | `NormalizedError` in `types/integrations.ts` |
| Connect / disconnect / test / capabilities | `IntegrationAdapter` in `services/adapters/types.ts` |
| Client-facing capability status | `CAPABILITY_DEPENDENCIES` in `services/integrations-providers.ts` |
| Admin integration UI | `/admin/integrations` renders records generically |

Two of these deserve emphasis because they are easy to reimplement by accident:

**Idempotency is arbitrated by the database, never by check-then-act.** Outbound
uses `unique (workspace_id, idempotency_key)`; inbound uses
`unique (workspace_id, source, external_event_id)`. Two concurrent deliveries
both attempt an insert and Postgres decides. Do not add an application-level
"have I seen this?" query.

**Client capability status already knows about you.** `CAPABILITY_DEPENDENCIES`
maps `sms → [twilio, n8n]`, `voice → [vapi, n8n, model_provider]`, and so on. A
business user sees "SMS — Needs attention", never a vendor name. You get this by
having an integration record, with no UI work.

---

## What you implement

### 1. An `IntegrationAdapter`

`connect`, `disconnect`, `testConnection`, `getCapabilities`. Register it in
`server/integrations/registry.ts`. `testConnection` must be **read-only** — a
health check that writes leaves litter in a real customer's account on every
click.

### 2. Outbound calls, behind named operations

One module of domain operations (`sendMessage`, not `request(method, path)`).
The generic request function stays private to the provider's `client.ts`; there
is deliberately no escape hatch that hands a caller the provider's whole API.

Every outbound request needs an explicit timeout via `AbortController`. Both
existing providers read theirs from `serverEnv` (`n8nTimeoutMs`,
`googleTimeoutMs`). There is no such thing as "no timeout" — a hung socket
becomes a hung server action becomes a person watching a spinner.

### 3. An inbound module, if the provider sends us anything

Implement `InboundProvider<TEnvelope>` from `integrations/inbound/pipeline.ts`:

- `verify(request)` — your signature scheme, over `rawBody` and/or `url`
- `parse(request)` — your payload shape
- `resolveTenant(envelope)` — a mapping **we** issued
- `identity(envelope)` — the provider's own event id, for the receipt
- `apply(scope, envelope, now)` — the business effect
- `audit` — which audit actions accepted/rejected events record

The pipeline runs the gates in order and owns the receipt, the transaction, the
settle, the integration event and the audit row.

### 4. A simulator

Behind the same module boundary as the real transport, selected by a
`*_MODE` env var (`disabled` | `simulated` | `live`), with production refusing
to start on `simulated`. Deterministic only — no randomness. Choose failure
modes by *configuration* (Google's simulator picks its failure from the
calendar id) so a test names an outcome instead of mocking one.

---

## The rules that cost us something to learn

### Provider semantic success is not transport success

**An HTTP 2xx does not mean the operation succeeded in the provider's domain.**

Google Calendar returns `200 OK` when you PATCH an event that has already been
deleted, and the response body still says `status: "cancelled"`. Trusting the
status code marked appointments `synced` against a tombstone nobody could see.
The adapter now inspects the returned resource state and treats a cancelled
event as unusable — see `rescheduleAppointmentEvent`.

The same trap, differently shaped, is waiting in the providers we have not built
yet:

- **Twilio** — a queued SMS returns success. Delivery failure arrives *later*, on
  a status callback. "Accepted" is not "delivered".
- **Vapi** — a created call returns success. Whether the call connected, and how
  it ended, is a later event.

Note what those two have in common and how they differ from Google: their real
outcome arrives **asynchronously, on a webhook**, not in the response body. So
this rule is a *design obligation*, not a shared function — where the check
belongs differs per provider. Do not force it into one synchronous hook.

### Never auto-retry `sync_required`

`sync_required` means the external side effect **already happened** and our own
write did not. Retrying repeats a real-world action — a second calendar event, a
second SMS. The operation state machine refuses a retry under the same
idempotency key, and that refusal is the safety property. Do not add a retry
path around it.

Safe to retry: health checks, reads, and mutations that carry a stable
idempotency key. Everything else needs a reason.

### Any local write after a confirmed external mutation must be sync-guarded

Not just the caller's write — the executor's own bookkeeping write too. Google
Calendar's executors persist an event mapping after the API call succeeds; when
that write failed it surfaced as a generic retryable failure, and a retry would
have created a **second real event** with nothing in the database pointing at
it. All three executors now wrap that write in `commitWithSyncGuard`.

If your provider writes anything locally after a successful external call, it
goes through the guard.

### Raw bodies, unparsed

Verify signatures over the exact bytes received. `JSON.parse` then
`JSON.stringify` does not preserve key order or whitespace, and every
body-signing scheme fails. The route reads `await request.text()` once and
passes it through. Twilio additionally signs the **full URL plus sorted form
parameters**, which is why `InboundRequest` carries `url` as well as `rawBody`.

### Inbound payloads never name their own tenant

A valid signature proves the sender holds a secret. It says nothing about which
business the event is for. Resolve the workspace from a mapping we issued — a
workflow reference, a phone number, an assistant id — and reject the event if
that resolution fails. n8n's envelope has no `workspaceId` field at all, which
is the most reliable way to not read one.

---

## Provider readiness template

Answer these before writing code. Short answers are fine; vague ones are not.

```
Provider:
Capabilities it serves:            (voice / sms / email / calendar / knowledge)
Outbound operations:
Inbound events:
Outbound authentication:
Webhook verification:              (algorithm, and what exactly is signed)
Tenant resolution:                 (which mapping we issue)
Idempotency identity:              (outbound key parts; inbound provider event id)
Semantic success:                  (what response state actually means success —
                                    and whether it arrives sync or async)
Safe to retry:
Time semantics:                    (timestamp formats, offsets, timezone source)
Secrets required:
Client-safe status:                (what a business user sees)
Admin status:                      (what an operator sees)
Simulator coverage:
Live certification additions:
```

---

## Live certification checklist

Automated tests run against the simulator and prove the wiring. This list is
only the things a simulator **cannot** prove, so it stays short. Run it once,
against a dedicated test account, never a customer's.

1. Real credentials authenticate (OAuth consent, API key, or account token)
2. Real webhook signature verifies against a genuine delivery
3. Actual request/response shapes match what the adapter expects
4. Real provider identifiers round-trip and persist
5. Provider semantic quirks — the "success that isn't" for this provider
6. Token refresh / revocation, where the provider has them
7. One real success path, end to end through the normal UI
8. One real failure path, producing a normalized error
9. One real retry or duplicate-delivery path, producing exactly one effect
10. Secret audit — no credential in logs, DB plaintext, or client bundle

Full automated tests still run. This reduces repeated live testing, not
assurance.

**Use a dedicated test account for anything destructive.** Google Calendar
certification used a purpose-made "Ai receptionist test" calendar, never a
personal or customer one.
