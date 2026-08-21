-- Twilio: SMS, and the first provider whose identity is a phone number.
--
-- == The two things this migration exists for ================================
--
--   1. **A trusted number → workspace mapping.** An inbound SMS carries no
--      workspace id and could not be trusted if it did. The only safe way to
--      attribute it is a mapping *we* issued, the same role `workflow_ref`
--      plays for n8n. `business_profiles.phone` cannot do this job: it is
--      editable display data with no uniqueness guarantee, so two workspaces
--      could claim one number and a business user could reassign their own
--      tenancy by typing.
--
--   2. **A durable record of a message and its delivery lifecycle.** Twilio
--      accepting a message is not the same statement as the message arriving,
--      and the difference shows up minutes later on a status callback. That
--      outcome has to land somewhere that can change after the fact, which the
--      transcript model (`conversation_messages`, keyed by position with no
--      identity of its own) deliberately cannot express.

-- == Which number belongs to which business ==================================
--
-- The unique constraint on `phone_number` is the whole security property: one
-- number resolves to exactly one workspace, and the database — not application
-- code — is what guarantees it. An inbound event whose number matches nothing
-- is refused rather than guessed at.
--
-- `provider_sid` is nullable on purpose. Twilio's `PN…` identifier is the
-- durable key for a number that may be released and reassigned, and it is the
-- better thing to hold — but a number can be operated without it, and refusing
-- to record a mapping because an optional identifier is missing would be worse
-- than recording one that can be completed later.
--
-- `provider` carries a second value now because Vapi identifies its inbound
-- traffic by phone number too, and a second table with identical semantics
-- would be two places for one invariant to be enforced.

create table provider_phone_numbers (
  id            text primary key,
  workspace_id  text not null references workspaces (id) on delete cascade,
  provider      text not null check (provider in ('twilio','vapi')),

  -- E.164, normalized before it is stored. The check is a backstop against a
  -- caller that skipped normalization, not a substitute for it.
  phone_number  text not null,
  provider_sid  text,

  label         text not null default '',
  sms_enabled   boolean not null default true,
  voice_enabled boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint provider_phone_numbers_e164
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),

  -- Global, not per-workspace: the point is that a number cannot be claimed by
  -- two tenants. Scoping this to a workspace would allow exactly the collision
  -- it exists to prevent.
  constraint provider_phone_numbers_number_key unique (phone_number)
);

create index provider_phone_numbers_workspace_idx
  on provider_phone_numbers (workspace_id, provider);

create trigger provider_phone_numbers_updated_at before update on provider_phone_numbers
  for each row execute function set_updated_at();

-- == Messages, and what happened to them =====================================
--
-- == Why this is not `conversation_messages` =================================
--
-- That table is a transcript: ordered by position, attributed to a speaker,
-- rendered for a human. It has no per-row identity, no provider reference and
-- no mutable state, because a transcript line does not need any of those. An
-- outbound SMS needs all three — it is a *send attempt* whose real outcome
-- arrives later and separately, and which must be findable again by the id the
-- provider gave it.
--
-- Both exist. A conversation still reads as a conversation; this records what
-- the carrier did.
--
-- == The status vocabulary ===================================================
--
-- Normalized from Twilio's larger set rather than mirrored, so a future carrier
-- with different words does not force a schema change:
--
--   queued/sent  — we handed it over. NOT proof of delivery.
--   delivered    — the carrier confirmed receipt.
--   undelivered  — the carrier gave up. A real, final failure.
--   failed       — Twilio rejected or could not process it.
--   received     — inbound, from a customer.

create table sms_messages (
  id                   text primary key,
  workspace_id         text not null references workspaces (id) on delete cascade,
  provider             text not null check (provider in ('twilio')),
  direction            text not null check (direction in ('inbound','outbound')),

  -- Twilio's `SM…` identifier. Null only in the moment between deciding to send
  -- and the carrier answering; the unique constraint tolerates that because
  -- Postgres does not treat two nulls as equal.
  provider_message_sid text,

  from_number          text not null,
  to_number            text not null,
  body                 text not null default '',

  status               text not null check (status in
                         ('queued','sent','delivered','undelivered','failed','received')),

  -- The carrier's own reason, kept for an operator. Never rendered to a
  -- business user, who is told the capability needs attention instead.
  error_code           text,
  error_message        text,

  conversation_id      text references conversations (id) on delete set null,
  customer_id          text references customers (id) on delete set null,

  sent_at              timestamptz,
  delivered_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- The idempotency key for delivery callbacks and redelivered inbound
  -- messages alike: one provider message is one row, per tenant.
  constraint sms_messages_provider_key
    unique (workspace_id, provider, provider_message_sid)
);

create index sms_messages_workspace_idx on sms_messages (workspace_id, created_at desc);

-- "Which messages need an operator's attention?" as a query rather than a flag.
create index sms_messages_attention_idx
  on sms_messages (workspace_id, status)
  where status in ('failed','undelivered');

create trigger sms_messages_updated_at before update on sms_messages
  for each row execute function set_updated_at();

-- == Event vocabulary ========================================================
--
-- Delivery outcomes are integration events in their own right: "accepted" and
-- "actually delivered" are different facts and an operator needs to see both.

alter table integration_events
  drop constraint integration_events_type_check;

alter table integration_events
  add constraint integration_events_type_check check (type in (
    'connected','disconnected','test_passed','test_failed','recovered',
    'config_changed','sync_failed','workflow_failed',
    'operation_dispatched','operation_succeeded','operation_failed',
    'event_received','event_rejected','sync_required',
    -- calendar
    'external_change_detected','reconciled',
    -- messaging
    'message_delivered','message_undelivered'
  ));

-- == Privileges ==============================================================
--
-- Restated for the tables created here: 0005 granted on what existed when it
-- ran, and the isolated test schema has no default privileges to inherit.

do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update, delete on table %I.provider_phone_numbers to app_runtime', target_schema);
  execute format(
    'grant select, insert, update, delete on table %I.sms_messages to app_runtime', target_schema);
end $$;
