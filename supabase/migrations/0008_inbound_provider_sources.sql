-- == Inbound events may come from more than one provider ====================
--
-- `integration_inbound_events.source` was introduced when n8n was the only
-- system that could send us anything, and the check constraint said so
-- literally: `check (source in ('n8n'))`. That was correct then and is a hard
-- blocker now — a Twilio delivery receipt or a Vapi call-ended event cannot be
-- recorded at all, so the idempotency receipt that makes inbound processing
-- exactly-once could not be written for them.
--
-- Every other provider-bearing column in the schema already uses one shared
-- vocabulary (`integration_records.provider`, `integration_events.provider`).
-- This aligns `source` with that same list rather than inventing a second,
-- narrower one: a single statement of "which providers exist" is easier to keep
-- true than two that can drift.
--
-- What deliberately does not change:
--
--   • The unique constraint `(workspace_id, source, external_event_id)`. It was
--     already the right shape for multiple providers — it is what lets the
--     database, rather than a check-then-insert race in the application, decide
--     which of two concurrent deliveries of the same event wins. Widening the
--     source vocabulary makes that guarantee available per provider, because a
--     Twilio MessageSid and an n8n event id cannot collide across sources.
--
--   • Tenant resolution. Nothing here lets an inbound payload name its own
--     workspace; `workspace_id` is still written by the server from a trusted
--     mapping, and this migration does not weaken that.

alter table integration_inbound_events
  drop constraint if exists integration_inbound_events_source_check;

alter table integration_inbound_events
  add constraint integration_inbound_events_source_check check (source in (
    'vapi','twilio','google_calendar','gmail','n8n','pinecone','model_provider'
  ));
