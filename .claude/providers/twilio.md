# Twilio

Status: **BUILT + SIMULATOR VERIFIED**. It is not live-certified.

- `provider_phone_numbers` is the trusted, globally unique number-to-workspace mapping.
- `sms_messages` records inbound/outbound identity and the carrier delivery lifecycle.
- Verify the exact Twilio request contract and `X-Twilio-Signature` against the configured
  full callback URL before parsing or mutating data.
- Resolve inbound message tenancy from `To`, which is the platform-owned number.
- Resolve delivery-status callback tenancy from `From`, which is the platform-owned number.
- Use `MessageSid` plus status (`sid:status`) as callback identity so progression remains
  idempotent while duplicate callbacks collapse.
- Outbound messages use the orchestration operation lifecycle and sync guard. Confirmed
  carrier acceptance followed by local write failure becomes `sync_required`.
- Carrier acceptance is not delivery. `delivered`, `undelivered`, or `failed` is learned
  asynchronously from the status callback.
- Client DTOs use SMS/business wording and redact Twilio, phone mappings, SIDs, callback
  details, credentials, and raw provider errors.
- Live certification is blocked on a real SMS-capable number and account prerequisites.
  Follow `docs/twilio-live-certification.md` when those exist; do not claim live status now.
