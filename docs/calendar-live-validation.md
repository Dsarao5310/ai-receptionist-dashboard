# Google Calendar — live validation runbook

The architecture is complete and verified against the simulator. This is the
checklist that proves it against the real provider. It has **not been run yet**:
this deployment has no Google OAuth client, and creating one requires a person
signed into Google Cloud Console.

Nothing in this document changes the product. It is the sequence to follow, the
exact things to look at, and the state to restore afterwards.

---

## What has to exist first

| | why it cannot be done from here |
| --- | --- |
| A Google Cloud project with an **OAuth 2.0 Web application client** | Creating cloud resources requires signing into a Google account |
| A **dedicated test Google account** and a calendar created for this purpose | Never a personal, business or client calendar — §8 |
| The consent screen clicked through | Requires signing into that account in a browser |

Add the client's redirect URI **exactly** as
`http://localhost:3000/api/admin/calendar/callback` for local validation, or the
deployed equivalent. Google matches this string literally; a trailing slash is a
different URI.

The test account needs the Calendar API enabled on that project, and — while the
consent screen is unverified — the test account added as a **test user**.

Then, in `.env.local`:

```
GOOGLE_CALENDAR_MODE=live
GOOGLE_CALENDAR_CLIENT_ID=…
GOOGLE_CALENDAR_CLIENT_SECRET=…
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/admin/calendar/callback
```

and confirm the local half is sane:

```bash
npm run calendar:preflight
```

Automated tests stay on `GOOGLE_CALENDAR_MODE=simulated` regardless — they set
it themselves and never read `.env.local` for it.

---

## 1 · OAuth handshake

Sign in as the platform operator (`sam@receptionist.example`), open
`/admin/calendar`, press **Connect calendar**.

- [ ] Google's consent screen lists exactly three scopes: `calendar.events`,
      `calendar.readonly`, `userinfo.email`. Anything broader is a bug.
- [ ] After consent, the browser returns to `/admin/integrations?calendar=connected`.
- [ ] The calendar record shows **Connected**, with a calendar selected.

Then the negative cases. Each should end at `?calendar=invalid` with **nothing
written**:

- [ ] Replay the same callback URL a second time (state already consumed).
- [ ] Edit one character of `state` (signature fails).
- [ ] Wait past 10 minutes and use a fresh state (expired).
- [ ] Sign in as `alex@coastalbloom.example` (business owner) and request
      `/api/admin/calendar/authorize` — expect **403**.

There is no `workspaceId` parameter anywhere in this flow to tamper with; the
workspace comes from the state row. Confirm by reading the callback URL.

## 2 · Token storage audit

```sql
select workspace_id, provider, credential_key, key_version,
       length(ciphertext) as len, expires_at
from app.provider_secrets;
```

- [ ] Two rows: `google_access_token` (with an expiry) and `google_refresh_token`.
- [ ] **Do not print `ciphertext`.** Length and metadata only.
- [ ] `select config from app.integration_records where provider='google_calendar'`
      — the `oauth` entry has `state: configured` and **no `value` key**.
- [ ] `select metadata from app.audit_events where action like 'calendar.%'` —
      labels and timezones only.
- [ ] Grep the dev-server output for `ya29.` and `1//` (Google's access and
      refresh token prefixes). Expect nothing.

## 3 · Refresh

The access token stored at connect time is valid for about an hour, so force it:

```sql
update app.provider_secrets set expires_at = now() - interval '1 minute'
where provider = 'google_calendar' and credential_key = 'google_access_token';
```

Then press **Test connection**.

- [ ] It succeeds.
- [ ] `expires_at` on the access token row has moved forward — a refresh
      happened server-side.
- [ ] The **refresh token row is unchanged**. Google usually omits the refresh
      token in a refresh response, and overwriting it with null is the bug that
      shows up days later as a connection that silently stopped working.

## 4 · Calendar discovery and selection

- [ ] **Choose calendar** lists the test account's calendars with their real ids
      and timezones; the primary one is marked.
- [ ] Selecting a secondary calendar updates the record and the timezone shown.
- [ ] Call `selectCalendarAction` with an id **not** in that list (via the
      browser console on the admin page) — expect
      *"That calendar is not available on the connected account."*

## 5 · Create, retry, reschedule, cancel

Use the test calendar for everything below, and label the appointment clearly.

- [ ] Reschedule a seeded appointment from the dashboard. Exactly **one** event
      appears in the real calendar.
- [ ] In Google's UI: date, start, end match; the duration equals the
      appointment's snapshot duration, not the catalogue's current value.
- [ ] Press reschedule again with the same target time — still one event, and
      `select status, attempts from app.integration_operations order by created_at desc limit 1`
      shows one row, `succeeded`.
- [ ] Read the event back through the API and confirm
      `extendedProperties.private.receptionistAppointmentId` matches. **Rename
      the event in Google's UI**, then reconcile — matching must still work,
      because identity is the id and never the title.
- [ ] Cancel from the dashboard. The Google event reaches `status: cancelled`
      (still addressable, not deleted); the appointment survives with its
      history; the mapping row remains.
- [ ] Attempt each refusal — a past time, a special-closure date, a time outside
      opening hours — and confirm via the dev-server log that **no Google
      request was made**. Validation runs first, so a refused slot costs nothing.

## 6 · Timezones — the mandatory one

Use Harbour Dental (business `America/Toronto`) with a calendar whose own
timezone is `America/Vancouver`. That mismatch is already the seeded state.

- [ ] Book/reschedule to 10:00 business-local. Google shows **10:00 Toronto**
      (13:00 displayed if you view the calendar in Vancouver's zone).
- [ ] Read it back: the dashboard still says 10:00.
- [ ] Repeat either side of a DST transition in the business zone.
- [ ] No manual offset compensation anywhere. If it needs one, the boundary is
      wrong and the fix belongs in `provider-time.ts`, not the call site.

## 7 · External events

In the test calendar, by hand:

- [ ] An **all-day** event. Confirm it is read as a block using the calendar's
      timezone to interpret its offsetless dates, and that it does **not**
      become a customer or an appointment.
- [ ] A **transparent** ("free") event. Confirm it does not block.
- [ ] A normal busy event. Confirm it is external scheduling state only — no
      customer row, no appointment row, no change to analytics.

## 8 · External changes

- [ ] **Valid move**: drag an application-managed event to a valid business
      time, then reconcile from `/admin/calendar`. The appointment adopts it and
      an audit row records who accepted it.
- [ ] **Invalid move**: drag it to 03:00 or a closure date. Google accepts it;
      the appointment must **not**. Expect `external_change_detected` with the
      reason, and the appointment unchanged.
- [ ] **Delete** the event in Google. The appointment survives, is flagged, and
      history is intact.
- [ ] **Push ours** on a disagreement: Google is corrected, no duplicate event,
      sync state returns to `synced`.

> Inbound changes are detected by **reading** the provider — on reconcile, or via
> the signed ingestion endpoint when a workflow reports one. Google *push
> notifications* (`watch` channels) are **not implemented**. Do not describe this
> as push synchronisation.

## 9 · Real `sync_required`

Covered automatically against the simulator, and worth doing once for real:

```sql
create or replace function reject_one_appointment_update() returns trigger as $$
begin
  if new.id = 'THE_APPOINTMENT_ID' then raise exception 'forced failure'; end if;
  return new;
end; $$ language plpgsql;

create trigger reject_one_appointment_update before update on app.appointments
  for each row execute function reject_one_appointment_update();
```

Reschedule from the dashboard, then:

- [ ] The Google event **really moved**.
- [ ] The operation is `sync_required`; the user was told it happened but could
      not be saved.
- [ ] Nothing repeated the Google mutation.
- [ ] Drop the trigger, then repair via **Push ours** or **Accept calendar**.

## 10 · Failure and disconnect

- [ ] Revoke the app's access from the test account's Google security settings.
      Press **Test connection**: admin sees the normalized auth error, a
      business user sees only *Calendar — Needs attention*.
- [ ] **Disconnect** from `/admin/calendar`. Revocation is attempted, the
      encrypted rows are gone (`select count(*) from app.provider_secrets`),
      appointments and mappings remain.
- [ ] **Reconnect** the same account. The same integration record is reused —
      no duplicate — and history is intact.

## 11 · Close out

- [ ] Delete the disposable test events from the test calendar.
- [ ] Reset any deliberately inconsistent sync state.
- [ ] `npm run db:reset && npm run db:seed` to return the dev workspace to a
      known state. Keep the migration ledger.
- [ ] Set `GOOGLE_CALENDAR_MODE` back to `simulated` for day-to-day development.

---

## Coverage this runbook is designed to close

Everything below is currently **simulator-verified only**. The runbook exists to
move each line into the live column, and nothing should be described as
production-proven until it has been.

- Google accepting our exact event JSON, including `extendedProperties.private`
- Real OAuth: consent, code exchange, refresh, revoke
- Real calendar ids, shared/secondary calendar access roles
- Google's own all-day and transparency semantics
- Whether a real refresh response omits the refresh token (we assume it does)

Never live-tested, and not planned for this phase: rate-limit responses (do not
provoke them), push/watch notifications (not implemented), and rare OAuth
revocation edge cases.
