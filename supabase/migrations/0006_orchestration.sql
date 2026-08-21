-- The orchestration boundary: what we asked the workflow engine to do, and what
-- it told us happened.
--
-- == Why this is three additions and not one ================================
--
-- Crossing a process boundary introduces two problems a single-database schema
-- never has, and each needs its own row:
--
--   1. **We asked, and we do not yet know.** An HTTP call can succeed, fail, or
--      leave us unsure - the request went out, the response never came back.
--      `integration_operations` is that record: one row per logical business
--      operation, with a status that can honestly say "we don't know yet".
--
--   2. **They told us twice.** Workflow engines retry. Webhook deliveries
--      retry. Without a durable record of what has already been accepted, a
--      retry is indistinguishable from a second booking.
--      `integration_inbound_events` is that record, and the unique constraint
--      on it is the actual defence - not application logic that could be
--      raced by two concurrent deliveries.
--
-- And the third: an operation has to know *which* workflow to invoke, which is
-- what the new `operation` column on `workflow_mappings` provides.

-- == Business capability → workflow ==========================================
--
-- `capability` already answers "which part of the product does this workflow
-- serve?" and drives the admin display. It does not answer "which workflow do
-- I invoke when someone reschedules an appointment?" - several workflows can
-- serve the calendar capability, and only one of them is the reschedule path.
--
-- `operation` is that second question. It names an *application* capability -
-- something the product knows how to do - and never an n8n workflow id. The
-- resolution is always:
--
--     operation  →  authorized workspace  →  workflow_mappings row  →  n8n
--
-- so no n8n identifier is ever chosen by, or even visible to, the caller. A
-- workspace maps its own operations, and two workspaces mapping the same
-- operation to entirely different workflows is the normal case.

alter table workflow_mappings
  add column operation text
    check (operation in (
      'appointment.book',
      'appointment.reschedule',
      'appointment.cancel',
      'customer.message',
      'business.sync'
    ));

-- One active workflow per operation per workspace: the resolution has to be
-- unambiguous, or "which one runs?" becomes a question the application answers
-- by accident. Partial, because a workflow that serves no operation is still a
-- legitimate row - it just is not invocable.
create unique index workflow_mappings_operation_key
  on workflow_mappings (workspace_id, operation)
  where operation is not null;

-- == The workflow reference is a tenant identity =============================
--
-- Inbound events have to be attributed to a workspace, and the payload cannot
-- be what decides - a signed request that says "workspaceId: B" is still a
-- request that says whatever its sender typed. The trusted mapping used instead
-- is this column: an n8n workflow identifier is unique within an instance, and
-- this index makes the database enforce that assumption rather than the
-- application hoping for it.
--
-- Globally unique, not per-workspace unique. Two workspaces sharing a reference
-- would make "which tenant sent this?" ambiguous, and an ambiguous answer to
-- that question is a cross-tenant write waiting to happen.
create unique index workflow_mappings_ref_key on workflow_mappings (workflow_ref);

-- == Outbound operations =====================================================
--
-- One row per logical operation, created *before* the workflow is invoked. That
-- ordering is the point: a row that exists in `processing` and never advances
-- is exactly the evidence needed to investigate a request that vanished. If the
-- row were written after the response, an operation that timed out would leave
-- no trace at all.
--
-- == The state machine ======================================================
--
--   pending     → created, not yet dispatched
--   processing  → dispatched, awaiting a result
--   succeeded   → the workflow confirmed success
--   failed      → the workflow refused, permanently
--   retryable_failure → transient: timeout, unreachable, 5xx. Safe to retry
--                       under the same idempotency key.
--   sync_required → the dangerous one. The workflow succeeded and our own
--                   write then failed, so an external system may have acted on
--                   something our database does not reflect. Nothing repairs
--                   this automatically; it is surfaced to an operator, because
--                   guessing which side is right is how data gets destroyed.

create table integration_operations (
  id                  text primary key,
  workspace_id        text not null references workspaces (id) on delete cascade,
  operation           text not null check (operation in (
                        'appointment.book',
                        'appointment.reschedule',
                        'appointment.cancel',
                        'customer.message',
                        'business.sync'
                      )),

  -- == Idempotency ==========================================================
  --
  -- Derived on the server from the operation and its meaningful inputs, never
  -- supplied by a browser. A retry of the same logical request computes the
  -- same key and finds this row instead of starting a second one.
  --
  -- `request_digest` guards the subtler failure: the same key arriving with
  -- *different* inputs. That is not a retry, it is a collision or a bug, and
  -- returning the first result would silently answer a question nobody asked.
  idempotency_key     text not null,
  request_digest      text not null,

  status              text not null default 'pending' check (status in
                        ('pending','processing','succeeded','failed',
                         'retryable_failure','sync_required')),
  attempts            integer not null default 0 check (attempts >= 0),

  -- What the operation was about, in our vocabulary.
  target_type         text,
  target_id           text,

  -- Which workflow served it, snapshotted. The mapping may later be repointed;
  -- this row should keep saying what actually ran, the same way an appointment
  -- keeps its service snapshot.
  workflow_mapping_id text references workflow_mappings (id) on delete set null,
  workflow_ref        text,

  -- The engine's own execution identifier, for admin correlation only. It is
  -- never shown to a business user: they are told "Appointment rescheduled",
  -- not "Execution 78491 succeeded".
  execution_ref       text,

  -- Normalized failure. Same shape as integration_records.last_error, and
  -- sanitised by the same boundary: no tokens, headers, or raw upstream bodies.
  error_code          text,
  error_category      text check (error_category in
                        ('auth','permission','network','configuration',
                         'rate_limit','provider','unknown')),
  error_message       text,
  error_detail        text,
  retryable           boolean not null default false,

  -- Payload contract version. Workflows evolve; an unversioned contract cannot
  -- be changed once anything live depends on it.
  schema_version      integer not null default 1,

  initiated_by        text references users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,

  constraint integration_operations_idempotency_key
    unique (workspace_id, idempotency_key)
);

create index integration_operations_workspace_idx
  on integration_operations (workspace_id, created_at desc);

-- The reconciliation queue, as an index rather than a second table: "which
-- operations still need a human?" is a query, not a copy.
create index integration_operations_unsettled_idx
  on integration_operations (workspace_id, status)
  where status in ('pending','processing','retryable_failure','sync_required');

create index integration_operations_target_idx
  on integration_operations (workspace_id, target_type, target_id);

create trigger integration_operations_updated_at before update on integration_operations
  for each row execute function set_updated_at();

-- == Inbound events ==========================================================
--
-- A receipt for every delivery the ingestion endpoint accepted or refused,
-- including the refusals: "we rejected 400 unsigned requests last night" is
-- exactly the kind of thing that should be visible.
--
-- == What is deliberately not here ==========================================
--
-- The raw payload. It would be the largest column in the schema, would grow
-- without bound, and would be the one place customer message content sat
-- outside the tables that are supposed to own it - complete with whatever a
-- future provider decided to include in it. `detail` carries a short sanitised
-- summary instead; the durable business effect lives in the business tables,
-- where it belongs.
--
-- The unique constraint on (workspace_id, source, external_event_id) is the
-- idempotency guarantee. Two concurrent deliveries of the same event both try
-- to insert; one wins, the other gets a constraint violation and is answered as
-- a duplicate. Postgres arbitrates, not a check-then-act race in the
-- application.

create table integration_inbound_events (
  id                text primary key,
  workspace_id      text not null references workspaces (id) on delete cascade,
  source            text not null check (source in ('n8n')),

  -- The sender's own identifier for this event. Trusted only as a *label* for
  -- deduplication - never to decide which tenant the event belongs to.
  external_event_id text not null,
  event_type        text not null,
  schema_version    integer not null default 1,

  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  outcome           text not null default 'received' check (outcome in
                      ('received','accepted','duplicate','rejected','failed')),
  retryable         boolean not null default false,

  -- One safe sentence. Never a payload dump, never a credential.
  detail            text,

  -- Correlation back to an operation we initiated, when the event is a workflow
  -- reporting on something we asked for.
  operation_id      text references integration_operations (id) on delete set null,

  constraint integration_inbound_events_external_key
    unique (workspace_id, source, external_event_id)
);

create index integration_inbound_events_workspace_idx
  on integration_inbound_events (workspace_id, received_at desc);

-- == Integration event vocabulary ============================================
--
-- The existing check constraint predates orchestration and has no word for
-- "an operation we dispatched came back" or "an inbound delivery was refused".
-- Recreating the constraint rather than adding a second one keeps a single
-- statement of what an event type may be.

alter table integration_events
  drop constraint integration_events_type_check;

alter table integration_events
  add constraint integration_events_type_check check (type in (
    'connected','disconnected','test_passed','test_failed','recovered',
    'config_changed','sync_failed','workflow_failed',
    -- orchestration
    'operation_dispatched','operation_succeeded','operation_failed',
    'event_received','event_rejected','sync_required'
  ));

-- == Privileges ==============================================================
--
-- 0005 granted on all tables that existed when it ran. These did not exist
-- then. Default privileges cover the application schema, but the isolated test
-- schema is built from these same files by a role whose defaults were never
-- configured for it - so the grants are restated here rather than assumed.

do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update, delete on table %I.integration_operations to app_runtime',
    target_schema);
  execute format(
    'grant select, insert, update, delete on table %I.integration_inbound_events to app_runtime',
    target_schema);
end $$;
