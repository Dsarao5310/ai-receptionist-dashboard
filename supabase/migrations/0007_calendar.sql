-- Google Calendar: the first real external scheduling system.
--
-- == What this migration is careful about =====================================
--
-- Three things get their own storage here, and the reason each is separate
-- matters more than the columns:
--
--   1. **Secrets get a table nothing joins against.** `provider_credentials`
--      deliberately has no value column - that was the whole point of it. OAuth
--      refresh tokens have to live *somewhere*, so they live in
--      `provider_secrets`: encrypted, outside every repository, reachable only
--      through the credential store. A query that accidentally selected a token
--      would have to name this table explicitly, and nothing in the repository
--      layer does.
--
--   2. **External calendar events are not appointments.** A staff meeting or a
--      holiday can make a slot unavailable without being a customer booking.
--      Importing them into `appointments` would put fake customers in a
--      business's records and corrupt every analytic derived from them.
--
--   3. **Sync state is a property of the appointment, not a second copy of it.**
--      Whether Google agrees with us is recorded on the row it is about.

-- == Encrypted provider secrets ==============================================
--
-- Ciphertext only: AES-256-GCM, key from server configuration, never in the
-- database. A dump of this table without the key is inert.
--
-- `key_version` exists so a key rotation can re-encrypt row by row rather than
-- requiring every secret to be re-obtained from the provider - which for OAuth
-- would mean asking every business to click "connect" again.

create table provider_secrets (
  workspace_id   text not null references workspaces (id) on delete cascade,
  provider       text not null check (provider in
                   ('vapi','twilio','google_calendar','gmail','n8n','pinecone','model_provider')),
  credential_key text not null,

  -- base64(iv) . base64(authTag) . base64(ciphertext). Never plaintext.
  ciphertext     text not null,
  key_version    integer not null default 1,

  -- For short-lived values such as an access token. Null means "no expiry
  -- known", which is the case for a refresh token.
  expires_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, provider, credential_key)
);

create trigger provider_secrets_updated_at before update on provider_secrets
  for each row execute function set_updated_at();

-- == OAuth handshake state ===================================================
--
-- The `state` parameter is signed, which stops it being forged. This table is
-- what stops it being *replayed*: the row is consumed on first use, so a
-- captured callback URL cannot be submitted twice.
--
-- The workspace lives here rather than in the query string for the same reason
-- inbound webhook events do not carry a tenant id - a value the browser can
-- edit is a request, never a fact.

create table oauth_states (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  provider     text not null check (provider in ('google_calendar')),
  created_by   text references users (id) on delete set null,
  consumed_at  timestamptz,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index oauth_states_expiry_idx on oauth_states (expires_at);

-- == Appointment ↔ external event mapping ====================================
--
-- `provider`, `provider_event_id` and `provider_calendar_id` were reserved in
-- 0003 and stayed null. They are filled in now, and joined by state.
--
-- The appointment id remains the identity. An external event id is a *mapping*:
-- it can change, be deleted, or belong to a calendar we later disconnect, and
-- none of that may alter what the business's own records say happened.

alter table appointments
  add column provider_sync_state text
    check (provider_sync_state in
      ('synced','pending','sync_required','error','external_change_detected')),
  add column provider_synced_at timestamptz,
  -- One safe sentence for an operator. Never a provider payload.
  add column provider_sync_detail text;

-- An external event maps to at most one appointment. Without this, a duplicated
-- inbound delivery or a mis-mapped workflow could point two bookings at one
-- calendar entry, and a later "move" would be ambiguous.
create unique index appointments_provider_event_key
  on appointments (workspace_id, provider_event_id)
  where provider_event_id is not null;

-- The reconciliation queue: appointments where we and Google may disagree.
create index appointments_sync_attention_idx
  on appointments (workspace_id, provider_sync_state)
  where provider_sync_state in ('sync_required','error','external_change_detected');

-- == External calendar blocks ================================================
--
-- Time that is unavailable without being a booking: a staff meeting, leave, a
-- personal block, an appointment someone typed straight into Google.
--
-- Deliberately *not* customer records. They have no customer, no service, no
-- price and no snapshot, because they are none of those things. They exist to
-- answer "is this slot free?" alongside the application's own appointments and
-- its configured concurrency - not to become rows in a business's customer list.

create table external_calendar_blocks (
  id                text primary key,
  workspace_id      text not null references workspaces (id) on delete cascade,
  provider          text not null check (provider in ('google_calendar')),
  calendar_id       text not null,
  external_event_id text not null,

  -- May be absent by policy: the title of a private event is the calendar
  -- owner's business, and this row only needs to know that the time is taken.
  summary           text,

  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  all_day           boolean not null default false,

  -- Google's own word for "does this event actually make me busy". A
  -- transparent event is shown on the calendar but does not block.
  transparency      text not null default 'opaque'
                      check (transparency in ('opaque','transparent')),

  -- Refreshed on every sync; a block not seen in a full sync has been removed.
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint external_calendar_blocks_key unique (workspace_id, provider, external_event_id),
  constraint external_calendar_blocks_ends_after_start check (ends_at > starts_at)
);

create index external_calendar_blocks_window_idx
  on external_calendar_blocks (workspace_id, starts_at, ends_at);

create trigger external_calendar_blocks_updated_at before update on external_calendar_blocks
  for each row execute function set_updated_at();

-- == Event vocabulary ========================================================

alter table integration_events
  drop constraint integration_events_type_check;

alter table integration_events
  add constraint integration_events_type_check check (type in (
    'connected','disconnected','test_passed','test_failed','recovered',
    'config_changed','sync_failed','workflow_failed',
    'operation_dispatched','operation_succeeded','operation_failed',
    'event_received','event_rejected','sync_required',
    -- calendar
    'external_change_detected','reconciled'
  ));

-- == Privileges ==============================================================
--
-- Restated for the tables this migration creates, because 0005 granted on what
-- existed when it ran and the isolated test schema has no default privileges.
--
-- `provider_secrets` is granted like any other table: the application must be
-- able to read a refresh token in order to refresh it. What protects it is not
-- a missing grant - it is that the value is ciphertext, the key is not in the
-- database, and no repository in the codebase names this table.

do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update, delete on table %I.provider_secrets to app_runtime', target_schema);
  execute format(
    'grant select, insert, update, delete on table %I.oauth_states to app_runtime', target_schema);
  execute format(
    'grant select, insert, update, delete on table %I.external_calendar_blocks to app_runtime', target_schema);
end $$;
