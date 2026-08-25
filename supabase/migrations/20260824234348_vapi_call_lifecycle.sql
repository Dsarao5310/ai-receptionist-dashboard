-- Vapi inbound call lifecycle foundation.
--
-- Vapi authenticates the sender, but authentication does not identify a
-- tenant. Assistant and phone resources are therefore mapped by rows we own,
-- with global uniqueness preventing one provider resource from authorizing two
-- workspaces. The webhook payload's workspace metadata is never consulted.

create table vapi_assistants (
  id            text primary key,
  workspace_id  text not null references workspaces (id) on delete cascade,
  assistant_id  text not null,
  label         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint vapi_assistants_assistant_id_nonempty
    check (length(btrim(assistant_id)) > 0),
  constraint vapi_assistants_assistant_id_key unique (assistant_id)
);

create index vapi_assistants_workspace_idx
  on vapi_assistants (workspace_id, active);

create trigger vapi_assistants_updated_at before update on vapi_assistants
  for each row execute function set_updated_at();

-- provider_phone_numbers already supports provider = 'vapi'. Make Vapi's
-- opaque phone-number id globally unambiguous as well as the E.164 number.
create unique index provider_phone_numbers_provider_sid_key
  on provider_phone_numbers (provider, provider_sid)
  where provider_sid is not null;

-- The normalized domain status remains intentionally small. These columns keep
-- the provider lifecycle ordering fact and safe terminal diagnostic without
-- storing a raw webhook or provider object.
alter table calls
  add column provider_status text,
  add column provider_updated_at timestamptz,
  add column ended_reason text;

alter table calls
  add constraint calls_ends_after_start
    check (ended_at is null or ended_at >= started_at),
  add constraint calls_provider_status_bounded
    check (provider_status is null or length(provider_status) between 1 and 64),
  add constraint calls_ended_reason_bounded
    check (ended_reason is null or length(ended_reason) <= 200);

create index calls_vapi_lifecycle_idx
  on calls (workspace_id, provider_updated_at desc)
  where provider = 'vapi';

-- 0005 granted privileges only on tables that existed at that point. The
-- runtime may read and provision mappings through authorized server code, but
-- receives no DDL or cross-schema privilege.
do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update, delete on table %I.vapi_assistants to app_runtime', target_schema);
end $$;
