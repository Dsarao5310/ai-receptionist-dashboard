# Google Calendar

Status: **LIVE VERIFIED** against the dedicated non-personal test calendar.

- Google provider OAuth is workspace authorization only and remains separate from Auth.js
  dashboard authentication.
- Access and refresh credentials are encrypted and server-only.
- Calendar selection is validated against calendars returned by the connected account.
- Application appointments use private extended-property identity so mapping survives an
  event rename.
- Business timezone remains authoritative. Calendar timezone does not replace it.
- External busy blocks are capacity constraints, not customer or appointment records.
- External moves and deletions use explicit reconciliation states rather than silently
  overwriting application truth.
- A Google update may return HTTP 200 while the event remains `status: "cancelled"`.
  That tombstone is semantic failure for an active booking.
- Rescheduling replaces and relinks a cancelled tombstone, preserves replaced-event
  history, and remains idempotent on retry.
- Each executor guards its local mapping/sync write after external mutation. A failed
  authoritative write becomes `sync_required`; this behavior has been proven live.
- Do not repeat destructive live certification unless relevant calendar integration code
  changes or specific evidence must be refreshed.
