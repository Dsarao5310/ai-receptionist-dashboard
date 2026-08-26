-- Durable, tenant-bound synchronization state for Business Knowledge.
--
-- This migration does not connect Pinecone, create an index, or store an API
-- key. It records the server-issued namespace and provider document identity
-- needed for an explicit, reconcilable synchronization boundary.

create table knowledge_provider_namespaces (
  workspace_id text primary key references workspaces (id) on delete cascade,
  provider     text not null default 'pinecone' check (provider = 'pinecone'),
  namespace    text not null unique check (
                 namespace = btrim(namespace)
                 and length(namespace) between 16 and 128
               ),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger knowledge_provider_namespaces_updated_at
  before update on knowledge_provider_namespaces
  for each row execute function set_updated_at();

alter table knowledge_entries
  add column provider_document_id text,
  add column provider_sync_state text not null default 'pending'
    check (provider_sync_state in ('pending', 'synced', 'error', 'sync_required')),
  add column provider_sync_version bigint not null default 0
    check (provider_sync_version between 0 and 9007199254740991),
  add column provider_error_code text,
  add column provider_error_message text,
  add column provider_synced_at timestamptz,
  add column deleted_at timestamptz;

update knowledge_entries
set provider_document_id = id
where provider_document_id is null;

alter table knowledge_entries
  alter column provider_document_id set not null,
  add constraint knowledge_entries_provider_document_key
    unique (workspace_id, provider_document_id),
  add constraint knowledge_entries_provider_error_pair_check check (
    (provider_error_code is null) = (provider_error_message is null)
  );

create index knowledge_entries_reconciliation_idx
  on knowledge_entries (workspace_id, provider_sync_state, updated_at)
  where provider_sync_state <> 'synced';

create index knowledge_entries_active_workspace_idx
  on knowledge_entries (workspace_id, position, created_at)
  where deleted_at is null;

do $$
declare
  target_schema text := current_schema();
begin
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    execute format(
      'grant select, insert, update on table %I.knowledge_provider_namespaces to app_runtime',
      target_schema
    );
    execute format(
      'revoke delete on table %I.knowledge_provider_namespaces from app_runtime',
      target_schema
    );
  end if;
end;
$$;
