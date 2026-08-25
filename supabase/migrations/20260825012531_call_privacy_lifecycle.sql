-- Call privacy lifecycle.
--
-- Recording ingestion remains disabled at the provider boundary. This schema
-- supplies the controls that must exist before a recording locator can ever be
-- retained: a workspace policy, explicit consent state, bounded expiry, and an
-- append-only consent trail. Transcript and recording content can be erased
-- without deleting the operational call, appointment link, or audit history.

create table workspace_privacy_policies (
  workspace_id              text primary key references workspaces (id) on delete cascade,
  recording_mode            text not null default 'disabled'
                              check (recording_mode in ('disabled', 'explicit_consent')),
  transcript_retention_days integer not null default 90
                              check (transcript_retention_days between 1 and 365),
  recording_retention_days  integer not null default 30
                              check (recording_retention_days between 1 and 90),
  consent_notice            text not null default ''
                              check (length(consent_notice) <= 1000),
  policy_version            integer not null default 1 check (policy_version > 0),
  updated_by_user_id        text references users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint privacy_enabled_requires_notice check (
    recording_mode = 'disabled' or length(btrim(consent_notice)) >= 20
  )
);

create index workspace_privacy_policies_updated_by_idx
  on workspace_privacy_policies (updated_by_user_id)
  where updated_by_user_id is not null;

create trigger workspace_privacy_policies_updated_at
  before update on workspace_privacy_policies
  for each row execute function set_updated_at();

-- Existing and future workspaces both receive the fail-closed default.
insert into workspace_privacy_policies (workspace_id)
select id from workspaces
on conflict (workspace_id) do nothing;

create or replace function create_default_workspace_privacy_policy() returns trigger
language plpgsql as $$
begin
  insert into workspace_privacy_policies (workspace_id) values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

create trigger workspaces_default_privacy_policy
  after insert on workspaces
  for each row execute function create_default_workspace_privacy_policy();

-- Composite references make a mismatched workspace/call pair impossible even
-- if a future repository forgets an application-level tenant predicate.
-- `calls_workspace_id_id_uq` (0010_production_hardening_parity.sql) already
-- covers (workspace_id, id) and satisfies the composite foreign keys below —
-- a second unique constraint on the same columns was redundant and flagged
-- by Supabase's duplicate_index advisor.

create table call_privacy_state (
  workspace_id          text not null,
  call_id               text not null,
  consent_status        text not null default 'not_requested'
                         check (consent_status in ('not_requested','granted','denied','withdrawn')),
  consented_at          timestamptz,
  withdrawn_at          timestamptz,
  last_consent_event_at timestamptz,
  consent_policy_version integer check (consent_policy_version is null or consent_policy_version > 0),
  transcript_expires_at timestamptz,
  recording_expires_at  timestamptz,
  recording_stored_at   timestamptz,
  transcript_deleted_at timestamptz,
  recording_deleted_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (workspace_id, call_id),
  foreign key (workspace_id, call_id)
    references calls (workspace_id, id) on delete cascade,
  constraint consent_grant_is_complete check (
    consent_status <> 'granted' or (consented_at is not null and consent_policy_version is not null)
  )
);

create index call_privacy_transcript_expiry_idx
  on call_privacy_state (transcript_expires_at, workspace_id)
  where transcript_deleted_at is null and transcript_expires_at is not null;

create index call_privacy_recording_expiry_idx
  on call_privacy_state (recording_expires_at, workspace_id)
  where recording_deleted_at is null and recording_expires_at is not null;

create trigger call_privacy_state_updated_at
  before update on call_privacy_state
  for each row execute function set_updated_at();

create table call_consent_events (
  id             text primary key,
  workspace_id   text not null,
  call_id        text not null,
  decision       text not null check (decision in ('granted','denied','withdrawn')),
  source         text not null check (source in ('voice','admin','system')),
  policy_version integer not null check (policy_version > 0),
  actor_user_id  text references users (id) on delete set null,
  occurred_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  foreign key (workspace_id, call_id)
    references calls (workspace_id, id) on delete restrict
);

create index call_consent_events_call_idx
  on call_consent_events (workspace_id, call_id, occurred_at desc);

create index call_consent_events_actor_idx
  on call_consent_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

-- Every call gets an expiry projection, including Vapi-created calls. This does
-- not ingest a recording URL; the provider adapter continues to omit it.
create or replace function initialize_call_privacy_state() returns trigger
language plpgsql as $$
declare
  retention_days integer;
  retention_start timestamptz;
begin
  select transcript_retention_days into retention_days
  from workspace_privacy_policies where workspace_id = new.workspace_id;
  retention_start := coalesce(new.ended_at, new.started_at);

  insert into call_privacy_state (
    workspace_id, call_id, transcript_expires_at
  ) values (
    new.workspace_id,
    new.id,
    retention_start + make_interval(days => coalesce(retention_days, 90))
  )
  on conflict (workspace_id, call_id) do update
  set transcript_expires_at = case
    when call_privacy_state.transcript_deleted_at is null
      then excluded.transcript_expires_at
    else call_privacy_state.transcript_expires_at
  end;
  return new;
end;
$$;

create trigger calls_initialize_privacy_state
  after insert or update of ended_at on calls
  for each row execute function initialize_call_privacy_state();

insert into call_privacy_state (workspace_id, call_id, transcript_expires_at)
select
  c.workspace_id,
  c.id,
  coalesce(c.ended_at, c.started_at) + make_interval(days => p.transcript_retention_days)
from calls c
join workspace_privacy_policies p on p.workspace_id = c.workspace_id
on conflict (workspace_id, call_id) do nothing;

-- New tables are created after the general grants migration, so grant them
-- explicitly. Consent events are append-only under the runtime credential.
do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping privacy runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update, delete on table %I.workspace_privacy_policies to app_runtime',
    target_schema);
  execute format(
    'grant select, insert, update, delete on table %I.call_privacy_state to app_runtime',
    target_schema);
  execute format(
    'grant select, insert on table %I.call_consent_events to app_runtime',
    target_schema);
  execute format(
    'revoke update, delete on table %I.call_consent_events from app_runtime',
    target_schema);
end $$;
