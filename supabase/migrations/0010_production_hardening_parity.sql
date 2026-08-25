-- Reproduce the production hardening state from source control.
--
-- These protections were present in the live production schema but missing
-- from the numbered migration chain. The migration is intentionally
-- idempotent so the production ledger can record it without attempting to
-- recreate objects that already exist there. It is schema-agnostic and is also
-- applied to app_test by the database-backed test harness.

-- == Function safety =========================================================

create or replace function config_has_no_sensitive_values(config jsonb)
returns boolean
language sql
immutable
as $$
  with recursive walk(value) as (
    select coalesce(config, 'null'::jsonb)
    union all
    select child
    from walk w
    cross join lateral (
      select value as child
      from jsonb_array_elements(
        case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end
      )
      union all
      select value as child
      from jsonb_each(
        case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end
      )
    ) x
  )
  select not exists (
    select 1
    from walk
    where jsonb_typeof(value) = 'object'
      and coalesce((value ->> 'sensitive')::boolean, false)
      and value ? 'value'
  );
$$;

do $$
begin
  execute format(
    'alter function %I.set_updated_at() set search_path = %I, pg_catalog',
    current_schema(), current_schema());
  execute format(
    'alter function %I.config_has_no_sensitive_values(jsonb) set search_path = %I, pg_catalog',
    current_schema(), current_schema());
  execute format(
    'alter default privileges in schema %I revoke execute on functions from public',
    current_schema());
end $$;

revoke all on function set_updated_at() from public;
revoke all on function config_has_no_sensitive_values(jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    grant execute on function set_updated_at() to app_runtime;
    grant execute on function config_has_no_sensitive_values(jsonb) to app_runtime;
  end if;
end $$;

-- == Cover every foreign key used by the production-shaped schema ===========

create index if not exists activity_events_appointment_fk_idx on activity_events (appointment_id);
create index if not exists activity_events_call_fk_idx on activity_events (call_id);
create index if not exists activity_events_conversation_fk_idx on activity_events (conversation_id);
create index if not exists activity_events_customer_fk_idx on activity_events (customer_id);
create index if not exists appointments_customer_fk_idx on appointments (customer_id);
create index if not exists calls_customer_fk_idx on calls (customer_id);
create index if not exists conversations_appointment_fk_idx on conversations (appointment_id);
create index if not exists conversations_customer_fk_idx on conversations (customer_id);
create index if not exists integration_inbound_events_operation_fk_idx on integration_inbound_events (operation_id);
create index if not exists integration_operations_initiated_by_fk_idx on integration_operations (initiated_by);
create index if not exists integration_operations_workflow_mapping_fk_idx on integration_operations (workflow_mapping_id);
create index if not exists invitations_invited_by_fk_idx on invitations (invited_by_user_id);
create index if not exists oauth_states_created_by_fk_idx on oauth_states (created_by);
create index if not exists oauth_states_workspace_fk_idx on oauth_states (workspace_id);
create index if not exists provider_credentials_configured_by_fk_idx on provider_credentials (configured_by);
create index if not exists user_notification_preferences_workspace_fk_idx on user_notification_preferences (workspace_id);
create index if not exists user_workspace_settings_workspace_fk_idx on user_workspace_settings (workspace_id);
create index if not exists workspaces_owner_fk_idx on workspaces (owner_user_id);

-- == Tenant relationship integrity ==========================================

create unique index if not exists customers_workspace_id_id_uq on customers (workspace_id, id);
create unique index if not exists services_workspace_id_id_uq on services (workspace_id, id);
create unique index if not exists appointments_workspace_id_id_uq on appointments (workspace_id, id);
create unique index if not exists conversations_workspace_id_id_uq on conversations (workspace_id, id);
create unique index if not exists calls_workspace_id_id_uq on calls (workspace_id, id);
create unique index if not exists integration_operations_workspace_id_id_uq
  on integration_operations (workspace_id, id);
create unique index if not exists workflow_mappings_workspace_id_id_uq
  on workflow_mappings (workspace_id, id);

create index if not exists activity_events_workspace_appointment_idx
  on activity_events (workspace_id, appointment_id);
create index if not exists activity_events_workspace_call_idx
  on activity_events (workspace_id, call_id);
create index if not exists activity_events_workspace_conversation_idx
  on activity_events (workspace_id, conversation_id);
create index if not exists activity_events_workspace_customer_idx
  on activity_events (workspace_id, customer_id);
create index if not exists appointments_workspace_service_idx
  on appointments (workspace_id, service_id);
create index if not exists calls_workspace_conversation_idx
  on calls (workspace_id, conversation_id);
create index if not exists conversations_workspace_appointment_idx
  on conversations (workspace_id, appointment_id);
create index if not exists integration_inbound_events_workspace_operation_idx
  on integration_inbound_events (workspace_id, operation_id);
create index if not exists integration_operations_workspace_workflow_idx
  on integration_operations (workspace_id, workflow_mapping_id);

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('activity_events', 'activity_events_appointment_tenant_fk',
       'foreign key (workspace_id, appointment_id) references appointments(workspace_id, id) on delete set null (appointment_id)'),
      ('activity_events', 'activity_events_call_tenant_fk',
       'foreign key (workspace_id, call_id) references calls(workspace_id, id) on delete set null (call_id)'),
      ('activity_events', 'activity_events_conversation_tenant_fk',
       'foreign key (workspace_id, conversation_id) references conversations(workspace_id, id) on delete set null (conversation_id)'),
      ('activity_events', 'activity_events_customer_tenant_fk',
       'foreign key (workspace_id, customer_id) references customers(workspace_id, id) on delete set null (customer_id)'),
      ('appointments', 'appointments_customer_tenant_fk',
       'foreign key (workspace_id, customer_id) references customers(workspace_id, id) on delete restrict'),
      ('appointments', 'appointments_service_tenant_fk',
       'foreign key (workspace_id, service_id) references services(workspace_id, id) on delete set null (service_id)'),
      ('calls', 'calls_conversation_tenant_fk',
       'foreign key (workspace_id, conversation_id) references conversations(workspace_id, id) on delete cascade'),
      ('calls', 'calls_customer_tenant_fk',
       'foreign key (workspace_id, customer_id) references customers(workspace_id, id) on delete set null (customer_id)'),
      ('conversations', 'conversations_appointment_tenant_fk',
       'foreign key (workspace_id, appointment_id) references appointments(workspace_id, id) on delete set null (appointment_id)'),
      ('conversations', 'conversations_customer_tenant_fk',
       'foreign key (workspace_id, customer_id) references customers(workspace_id, id) on delete set null (customer_id)'),
      ('integration_inbound_events', 'integration_inbound_events_operation_tenant_fk',
       'foreign key (workspace_id, operation_id) references integration_operations(workspace_id, id) on delete set null (operation_id)'),
      ('integration_operations', 'integration_operations_workflow_tenant_fk',
       'foreign key (workspace_id, workflow_mapping_id) references workflow_mappings(workspace_id, id) on delete set null (workflow_mapping_id)')
    ) as constraints_to_add(table_name, constraint_name, definition)
  loop
    if not exists (
      select 1
      from pg_constraint
      where connamespace = current_schema()::regnamespace
        and conname = item.constraint_name
    ) then
      execute format(
        'alter table %I add constraint %I %s',
        item.table_name, item.constraint_name, item.definition);
    end if;
  end loop;
end $$;
