-- Provider integrations, and the boundary that keeps secrets out of them.

-- == The secret boundary, enforced by the database ===========================
--
-- integration_records.config is a small display document: one entry per line of
-- a provider's configuration, each saying whether it is configured and - for
-- non-sensitive lines only - what it is set to. A sensitive entry must carry no
-- value, ever. The frontend is allowed to know *that* an API credential exists,
-- never what it is.
--
-- That rule is worth more than a comment, so it is a CHECK constraint. A future
-- careless write that tries to stash a token in the config blob fails at the
-- database rather than shipping it to a browser.

create or replace function config_has_no_sensitive_values(config jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_array_elements(coalesce(config, '[]'::jsonb)) as entry
    where coalesce((entry ->> 'sensitive')::boolean, false)
      and entry ? 'value'
  );
$$;

-- == Integration records =====================================================
--
-- Provider-level truth. Everything the business owner sees - "Voice is
-- connected", "Calendar needs attention" - is derived from these rows, so there
-- is no second boolean to fall out of step.
--
-- capabilities and config are JSONB because their shape genuinely varies by
-- provider and they are read as whole documents, never queried field by field.
-- That is the case JSONB is for; the rest of this schema is relational because
-- the rest of it is not like that.

create table integration_records (
  id                     text primary key,
  workspace_id           text not null references workspaces (id) on delete cascade,
  type                   text not null check (type in
                           ('voice','sms','email','calendar','workflow','knowledge','model')),
  provider               text not null check (provider in
                           ('vapi','twilio','google_calendar','gmail','n8n','pinecone','model_provider')),
  display_name           text not null,
  purpose                text not null default '',
  connection             text not null check (connection in
                           ('connected','connecting','disconnected','needs_attention','error','not_configured')),
  health                 text not null default 'unknown'
                           check (health in ('healthy','degraded','down','unknown')),
  last_checked_at        timestamptz,
  last_successful_sync_at timestamptz,
  capabilities           jsonb not null default '[]'::jsonb,
  config                 jsonb not null default '[]'::jsonb,
  admin_environment      text not null default 'production'
                           check (admin_environment in ('production','staging','sandbox')),
  admin_region           text,
  admin_notes            text,
  last_error             jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint integration_records_workspace_provider_key unique (workspace_id, provider),
  constraint integration_records_config_holds_no_secrets
    check (config_has_no_sensitive_values(config))
);

create index integration_records_workspace_idx on integration_records (workspace_id, type);

create trigger integration_records_updated_at before update on integration_records
  for each row execute function set_updated_at();

-- == Provider credentials: metadata only =====================================
--
-- There is no value column, and that is the point. This table records that a
-- credential exists, when it was last rotated and who configured it. The secret
-- itself belongs in a vault or an encrypted store the server reads through a
-- separate path - never in a table an application query could join against and
-- accidentally serialise into a response.
--
-- Nothing writes to this table yet. It exists so the integration phase has a
-- shape to fill rather than inventing one under deadline.

create table provider_credentials (
  id             text primary key,
  workspace_id   text not null references workspaces (id) on delete cascade,
  provider       text not null check (provider in
                   ('vapi','twilio','google_calendar','gmail','n8n','pinecone','model_provider')),
  credential_key text not null,
  state          text not null default 'not_configured'
                   check (state in ('configured','not_configured')),
  -- Where the value actually lives, e.g. a vault path. Never the value itself.
  reference      text,
  configured_by  text references users (id) on delete set null,
  configured_at  timestamptz,
  rotated_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint provider_credentials_key unique (workspace_id, provider, credential_key)
);

create trigger provider_credentials_updated_at before update on provider_credentials
  for each row execute function set_updated_at();

-- == Integration events ======================================================

create table integration_events (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  provider     text not null check (provider in
                 ('vapi','twilio','google_calendar','gmail','n8n','pinecone','model_provider')),
  type         text not null check (type in
                 ('connected','disconnected','test_passed','test_failed','recovered',
                  'config_changed','sync_failed','workflow_failed')),
  message      text not null,
  severity     text not null check (severity in ('info','warning','critical')),
  occurred_at  timestamptz not null default now()
);

create index integration_events_workspace_idx on integration_events (workspace_id, occurred_at desc);

-- == Workflow mappings =======================================================
--
-- workflow_ref is an opaque identifier, deliberately not a webhook URL. An
-- editable endpoint reachable from the browser would be an open door into the
-- automation engine.

create table workflow_mappings (
  id                text primary key,
  workspace_id      text not null references workspaces (id) on delete cascade,
  name              text not null,
  capability        text not null check (capability in
                      ('voice','sms','email','calendar','ai_receptionist','knowledge')),
  workflow_ref      text not null,
  version           text not null default '1',
  environment       text not null default 'production'
                      check (environment in ('production','staging','sandbox')),
  status            text not null default 'active' check (status in ('active','inactive','error')),
  last_execution_at timestamptz,
  last_success_at   timestamptz,
  failed_executions integer not null default 0 check (failed_executions >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index workflow_mappings_workspace_idx on workflow_mappings (workspace_id, capability);

create trigger workflow_mappings_updated_at before update on workflow_mappings
  for each row execute function set_updated_at();

-- == Per-user, per-workspace settings ========================================
--
-- Scoped to the membership rather than the person: someone who is an owner at
-- one business and staff at another wants different alerts in each.
--
-- Appearance is deliberately absent. Theme, accent, density and sidebar state
-- are device preferences and stay in the browser; round-tripping them through
-- the database would make the first paint wait on a query for no benefit.

create table user_workspace_settings (
  user_id         text not null references users (id) on delete cascade,
  workspace_id    text not null references workspaces (id) on delete cascade,
  landing_page    text not null default '/',
  default_range   text not null default '7d'
                    check (default_range in ('today','7d','30d','90d','custom')),
  timestamp_style text not null default 'relative' check (timestamp_style in ('relative','exact')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create trigger user_workspace_settings_updated_at before update on user_workspace_settings
  for each row execute function set_updated_at();

create table user_notification_preferences (
  user_id      text not null references users (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  event_key    text not null check (event_key in
                 ('appointment_booked','appointment_cancelled','appointment_rescheduled',
                  'integration_problem','ai_could_not_answer','high_missed_calls')),
  in_app       boolean not null default true,
  email        boolean not null default false,
  sms          boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, workspace_id, event_key)
);

create trigger user_notification_preferences_updated_at before update on user_notification_preferences
  for each row execute function set_updated_at();
