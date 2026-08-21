# Twilio — live certification runbook

The SMS integration is built and fully tested against the simulator. This is the
checklist that proves it against the real carrier. It has **not been run**: at
the time of writing the Twilio trial account owns **no phone number**, so no
message has ever been sent or received by this application.

Nothing in this document changes the product. It is the sequence to follow and
the state to restore afterwards.

---

## What has to exist first

| | why it cannot be done from here |
| --- | --- |
| An **SMS-capable Twilio number** on the account | The probe found `IncomingPhoneNumbers` empty; claiming one needs console access |
| The destination mobile as a **Verified Caller ID** | Trial accounts may only message verified numbers (error `21608`); verification requires answering a code |
| A **public HTTPS tunnel** to this app | Twilio cannot reach `localhost` |

Trial-account constraints that shape the run, all confirmed by read-only probe:

- The account is **Trial**, active.
- **Outbound reaches verified numbers only.**
- Twilio **prepends `"Sent from your Twilio trial account - "`** to every
  outbound body. What we store is what we asked Twilio to send; the delivered
  text differs. Do not treat that as a defect.
- **One number.** Cross-tenant isolation cannot be certified live with a single
  number — it stays simulator-verified until a second number exists.
- `OutgoingCallerIds` is **not readable on a trial account** (HTTP 401), so
  verification status must be confirmed in the console by a human.

Then, in `.env.local`:

```
TWILIO_MODE=live
TWILIO_ACCOUNT_SID=…            # already set
TWILIO_AUTH_TOKEN=…             # already set
TWILIO_PHONE_NUMBER=+1…         # the claimed number, E.164
TWILIO_PHONE_NUMBER_SID=PN…     # preferred; durable across reassignment
TWILIO_PUBLIC_WEBHOOK_URL=https://<tunnel>/api/internal/twilio/sms
TWILIO_STATUS_CALLBACK_URL=https://<tunnel>/api/internal/twilio/status
```

Both URLs matter: Twilio signs the **full URL**, so a value that does not match
what Twilio was configured to call fails verification on every request.

Then claim the number for a workspace — inbound cannot resolve a tenant without
it:

```
insert into provider_phone_numbers (id, workspace_id, provider, phone_number, provider_sid, label)
values ('pnum_live', 'ws_coastal_bloom', 'twilio', '+1…', 'PN…', 'Live test line');
```

Automated tests stay on `TWILIO_MODE=simulated` regardless — they set it
themselves and never read `.env.local` for it.

---

## 1 · Configuration and signature

- [ ] `TWILIO_MODE=live`, dev server restarted, tunnel running.
- [ ] In the Twilio console set the number's **A message comes in** webhook to
      `TWILIO_PUBLIC_WEBHOOK_URL` (POST), and its **status callback** to
      `TWILIO_STATUS_CALLBACK_URL`. Both can also be set over the API with the
      `PN` SID, which needs no console access.
- [ ] `/admin/integrations` → Twilio → **Test connection** reports healthy.
      It should refuse if the webhook URL is unset — that refusal is the point.

## 2 · Inbound, the part no simulator can prove

- [ ] Text the Twilio number from the verified mobile.
- [ ] A row appears in `sms_messages` with `direction='inbound'`,
      `status='received'`, the real `SM…` sid, and the correct `workspace_id`.
- [ ] A receipt exists in `integration_inbound_events` with `source='twilio'`.
- [ ] **Tamper test.** Replay the same request body with one character of the
      signature changed — expect `403` and **no** new row. This is the single
      most valuable live check: it proves the real signature algorithm, not our
      idea of it.
- [ ] Send the same message twice (Twilio retries on a 5xx) — exactly one row.

## 3 · Outbound

- [ ] Send to the **verified** mobile. One message arrives; one row in
      `sms_messages` with `direction='outbound'` and status `queued`/`sent`.
- [ ] The stored body is what we asked to send. The received text carries the
      trial banner. Both are correct.
- [ ] Send to an **unverified** number. Expect a normalized failure carrying
      `twilio_unverified_recipient`, admin detail mentioning `21608`, and a
      business-safe message that does **not** mention Twilio or a number.
- [ ] Repeat the identical send. Expect `duplicate` and **one** message.

## 4 · Delivery status — the async semantic-success case

- [ ] After the successful send, a status callback arrives and the row becomes
      `delivered`, with `delivered_at` set.
- [ ] Send to a number that accepts then fails (a powered-off or invalid
      handset). Expect the row to reach `undelivered`/`failed` with the carrier's
      `ErrorCode`, an `message_undelivered` integration event, and the row to
      appear in `listUndelivered()`.
- [ ] Confirm the **operation stays `succeeded`**. The carrier did accept it;
      rewriting history to "failed" would misreport what happened at the time.
- [ ] Confirm nothing resent the message automatically.

## 5 · Partial failure, for real

Reproduce the guarded window against the live carrier:

```sql
create or replace function reject_sms_insert() returns trigger as $$
begin raise exception 'forced failure'; end; $$ language plpgsql;
create trigger reject_sms_insert before insert on sms_messages
  for each row execute function reject_sms_insert();
```

- [ ] Send a message. The handset **really receives it**.
- [ ] The operation is `sync_required`, and the user is told it happened but
      could not be saved.
- [ ] A retry is refused — no second text arrives.
- [ ] Drop the trigger and reconcile.

## 6 · Boundaries

- [ ] Sign in as a business owner: `/connections` shows "SMS — Connected" with
      no vendor name, no number, no sid.
- [ ] `/admin/integrations` is refused for that role.
- [ ] Grep the dev-server output for the auth token and for `AC`/`SM` prefixes.
      Expect nothing.

## 7 · Close out

- [ ] Delete the disposable test messages.
- [ ] Set `TWILIO_MODE` back to `simulated` for day-to-day development.
- [ ] Record which items were genuinely proven live and which remain
      simulator-verified — cross-tenant isolation will be in the second group
      until a second number exists.

---

## What this runbook is designed to close

Currently **simulator-verified only**:

- Twilio accepting our exact form encoding
- A real `X-Twilio-Signature` verifying against the URL-plus-sorted-params rule
- Real `SM…` identifiers round-tripping through the receipt
- The genuine delivery lifecycle and its timing
- Trial-account refusals (`21608`) as a real provider error

Never live-testable on this account until it changes: **cross-tenant isolation
with two numbers**, and anything requiring `OutgoingCallerIds` reads.
