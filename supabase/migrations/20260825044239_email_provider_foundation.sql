-- Durable, tenant-bound email identity for the local provider foundation.
--
-- This migration does not connect Gmail, install a webhook, or store OAuth
-- credentials. Provider identifiers remain in the private application schema
-- and business-facing DTOs continue to expose only normalized capability state.

create table email_mailboxes (
  id                  text primary key,
  workspace_id        text not null references workspaces (id) on delete cascade,
  provider            text not null default 'gmail' check (provider = 'gmail'),
  provider_mailbox_id text not null check (
                        length(btrim(provider_mailbox_id)) between 1 and 200
                      ),
  mailbox_address     text not null check (
                        mailbox_address = lower(btrim(mailbox_address))
                        and length(mailbox_address) between 3 and 320
                        and position('@' in mailbox_address) > 1
                      ),
  label               text not null default '' check (length(label) <= 200),
  inbound_enabled     boolean not null default true,
  outbound_enabled    boolean not null default true,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint email_mailboxes_workspace_id_id_key unique (workspace_id, id),
  constraint email_mailboxes_provider_resource_key unique (provider, provider_mailbox_id),
  constraint email_mailboxes_provider_address_key unique (provider, mailbox_address)
);

create index email_mailboxes_workspace_idx
  on email_mailboxes (workspace_id, active, mailbox_address);

create trigger email_mailboxes_updated_at
  before update on email_mailboxes
  for each row execute function set_updated_at();

create table email_threads (
  id                 text primary key,
  workspace_id       text not null references workspaces (id) on delete cascade,
  mailbox_id         text not null,
  provider_thread_id text not null check (
                       length(btrim(provider_thread_id)) between 1 and 200
                     ),
  customer_id        text,
  conversation_id    text,
  subject            text not null default '' check (length(subject) <= 998),
  last_message_at    timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint email_threads_workspace_id_id_key unique (workspace_id, id),
  constraint email_threads_mailbox_fkey
    foreign key (workspace_id, mailbox_id)
    references email_mailboxes (workspace_id, id) on delete cascade,
  constraint email_threads_customer_fkey
    foreign key (workspace_id, customer_id)
    references customers (workspace_id, id) on delete set null (customer_id),
  constraint email_threads_conversation_fkey
    foreign key (workspace_id, conversation_id)
    references conversations (workspace_id, id) on delete set null (conversation_id),
  constraint email_threads_provider_key unique (mailbox_id, provider_thread_id)
);

create index email_threads_workspace_activity_idx
  on email_threads (workspace_id, last_message_at desc);

create trigger email_threads_updated_at
  before update on email_threads
  for each row execute function set_updated_at();

create table email_messages (
  id                  text primary key,
  workspace_id        text not null references workspaces (id) on delete cascade,
  mailbox_id          text not null,
  thread_id           text not null,
  provider            text not null default 'gmail' check (provider = 'gmail'),
  provider_message_id text not null check (
                        length(btrim(provider_message_id)) between 1 and 200
                      ),
  direction           text not null check (direction in ('inbound','outbound')),
  status              text not null check (status in ('received','accepted','failed')),
  from_address        text not null check (
                        from_address = lower(btrim(from_address))
                        and length(from_address) between 3 and 320
                        and position('@' in from_address) > 1
                      ),
  to_address          text not null check (
                        to_address = lower(btrim(to_address))
                        and length(to_address) between 3 and 320
                        and position('@' in to_address) > 1
                      ),
  subject             text not null default '' check (length(subject) <= 998),
  body                text not null check (length(body) between 1 and 100000),
  customer_id         text,
  conversation_id     text,
  provider_event_at   timestamptz not null,
  created_at          timestamptz not null default now(),
  constraint email_messages_mailbox_fkey
    foreign key (workspace_id, mailbox_id)
    references email_mailboxes (workspace_id, id) on delete restrict,
  constraint email_messages_thread_fkey
    foreign key (workspace_id, thread_id)
    references email_threads (workspace_id, id) on delete restrict,
  constraint email_messages_customer_fkey
    foreign key (workspace_id, customer_id)
    references customers (workspace_id, id) on delete set null (customer_id),
  constraint email_messages_conversation_fkey
    foreign key (workspace_id, conversation_id)
    references conversations (workspace_id, id) on delete set null (conversation_id),
  constraint email_messages_provider_key unique (mailbox_id, provider_message_id)
);

create index email_messages_workspace_activity_idx
  on email_messages (workspace_id, provider_event_at desc);
create index email_messages_thread_activity_idx
  on email_messages (thread_id, provider_event_at);

-- These tables are created after the general grants migration, so grant their
-- narrow runtime shape explicitly. Messages are retained as durable provider
-- identity/idempotency evidence and cannot be deleted by the application role.
do $$
declare
  target_schema text := current_schema();
begin
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    execute format(
      'grant select, insert, update on table %I.email_mailboxes to app_runtime',
      target_schema
    );
    execute format(
      'grant select, insert, update on table %I.email_threads to app_runtime',
      target_schema
    );
    execute format(
      'grant select, insert, update on table %I.email_messages to app_runtime',
      target_schema
    );
    execute format(
      'revoke delete on table %I.email_messages from app_runtime',
      target_schema
    );
    execute format(
      'revoke delete on table %I.email_mailboxes from app_runtime',
      target_schema
    );
    execute format(
      'revoke delete on table %I.email_threads from app_runtime',
      target_schema
    );
  end if;
end;
$$;
