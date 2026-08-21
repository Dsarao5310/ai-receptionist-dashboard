-- The business domain: customers, what they said, and what got booked.
--
-- Every table here is tenant-owned and carries workspace_id explicitly. That is
-- not decoration: repository queries scope on it, and the column is NOT NULL on
-- every one of them, so a row cannot exist outside a tenant.

-- == Customers ===============================================================
--
-- Contact facts only. Deliberately absent: appointment counts, "upcoming
-- appointment id", and last-interaction summaries. Those are questions with
-- authoritative answers in the appointment and conversation tables, and storing
-- a second copy is how they go stale - which has already produced bugs in this
-- product. They are derived at read time instead.
--
-- Deletion is archival. A customer with history is never removed, because doing
-- so would take their appointments and conversations with them; archived_at
-- hides them from the working list while the history stays intact.

create table customers (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  phone        text not null default '',
  email        text not null default '',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index customers_workspace_idx on customers (workspace_id, created_at desc);
create index customers_workspace_name_idx on customers (workspace_id, lower(name));

create trigger customers_updated_at before update on customers
  for each row execute function set_updated_at();

-- == Conversations ===========================================================
--
-- One per exchange with a customer, on any channel. A conversation stands on
-- its own: most do not produce an appointment, and forcing that relationship
-- would misrepresent the majority of them.
--
-- started_at and ended_at are absolute instants. No formatted string such as
-- "Today, 2:30 PM" is ever stored; that is a presentation concern, rendered in
-- the business timezone at display time.
--
-- provider_ref is reserved for the later integration phase (a Vapi call id, a
-- Twilio message sid). It is nullable, unused today, and carries no credential.

create table conversations (
  id                 text primary key,
  workspace_id       text not null references workspaces (id) on delete cascade,
  customer_id        text references customers (id) on delete set null,
  channel            text not null check (channel in ('voice','sms','email')),
  intent             text not null check (intent in
                       ('booking','reschedule','cancel','hours','pricing','services','other')),
  outcome            text not null check (outcome in
                       ('booked','rescheduled','cancelled','answered','escalated','missed','no_action')),
  started_at         timestamptz not null,
  ended_at           timestamptz,
  summary            text not null default '',
  transcript_preview text not null default '',
  appointment_id     text,
  provider           text,
  provider_ref       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint conversations_ends_after_start check (ended_at is null or ended_at >= started_at)
);

create index conversations_workspace_idx on conversations (workspace_id, started_at desc);
create index conversations_workspace_channel_idx on conversations (workspace_id, channel, started_at desc);
create index conversations_workspace_customer_idx on conversations (workspace_id, customer_id);

create trigger conversations_updated_at before update on conversations
  for each row execute function set_updated_at();

-- Transcript lines, in order. Normalized rather than a JSON array because they
-- are a genuine child collection that later phases will want to search.
--
-- offset_label is the "0:14" marker shown beside a line - a position within the
-- recording, not a timestamp, which is why it is text and why no instant is
-- reconstructed from it.

create table conversation_messages (
  conversation_id text not null references conversations (id) on delete cascade,
  position        integer not null check (position >= 0),
  speaker         text not null check (speaker in ('ai','customer')),
  body            text not null,
  offset_label    text not null default '',
  primary key (conversation_id, position)
);

-- The checklist of what the receptionist actually did during the exchange.

create table conversation_actions (
  conversation_id text not null references conversations (id) on delete cascade,
  position        integer not null check (position >= 0),
  label           text not null,
  done            boolean not null default false,
  primary key (conversation_id, position)
);

-- == Calls ===================================================================
--
-- A voice conversation has a call record carrying the telephony facts. It does
-- not duplicate the transcript, summary, intent or outcome - those belong to
-- the conversation, and a second copy would be a second truth to keep in step.
--
-- The provider and recording columns are the shape the Vapi integration will
-- need. They are nullable and stay empty: no fabricated recording URLs are
-- seeded, because a URL that looks real but is not is worse than none.

create table calls (
  id                    text primary key,
  workspace_id          text not null references workspaces (id) on delete cascade,
  conversation_id       text not null references conversations (id) on delete cascade,
  customer_id           text references customers (id) on delete set null,
  provider              text,
  provider_call_id      text,
  started_at            timestamptz not null,
  ended_at              timestamptz,
  duration_sec          integer not null default 0 check (duration_sec >= 0),
  status                text not null default 'completed'
                          check (status in ('completed','missed','failed','in_progress')),
  recording_url         text,
  recording_duration_sec integer check (recording_duration_sec is null or recording_duration_sec >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint calls_conversation_key unique (conversation_id)
);

create index calls_workspace_idx on calls (workspace_id, started_at desc);
create index calls_workspace_customer_idx on calls (workspace_id, customer_id);
-- A provider will only ever report a given call once per tenant.
create unique index calls_provider_key on calls (workspace_id, provider, provider_call_id)
  where provider_call_id is not null;

create trigger calls_updated_at before update on calls
  for each row execute function set_updated_at();

-- == Appointments ============================================================
--
-- Two representations of the service, and both are needed:
--
--   service_id            a stable reference into the catalogue, nullable
--                         because the catalogue entry may later be deleted.
--   service_name/_price/  an immutable snapshot of what the customer actually
--   _price_model/         booked. Never regenerated from the services table.
--   _duration_min         Renaming, repricing, changing the duration or
--                         deleting a service leaves every past booking exactly
--                         as it was agreed.
--
-- Two representations of the time, likewise:
--
--   scheduled_date/_time  the authoritative wall clock in the business
--                         timezone. This is what was agreed with the customer.
--   scheduled_start/_end  the same moment as an absolute instant, derived on
--                         write from the workspace's timezone. Ordering, range
--                         queries, analytics buckets and future calendar sync
--                         all need an instant; deriving it on every read would
--                         mean a timezone lookup per row.
--
-- The derived instants are written in exactly one place (AppointmentRepository)
-- and recomputed for the whole workspace when its timezone changes, so the two
-- cannot drift apart.

create table appointments (
  id                  text primary key,
  workspace_id        text not null references workspaces (id) on delete cascade,
  customer_id         text not null references customers (id) on delete restrict,
  service_id          text references services (id) on delete set null,
  service_name        text not null,
  service_price_model text not null check (service_price_model in ('fixed','from','free','contact','hidden')),
  service_price       numeric(10,2) not null default 0 check (service_price >= 0),
  service_duration_min integer not null check (service_duration_min > 0),
  scheduled_date      date not null,
  scheduled_time      time not null,
  scheduled_start     timestamptz not null,
  scheduled_end       timestamptz not null,
  status              text not null check (status in
                        ('confirmed','pending','rescheduled','cancelled','completed')),
  source              text not null check (source in ('voice','sms','email','manual')),
  notes               text not null default '',
  -- Reserved for the calendar integration. Nullable, unused, never a credential.
  provider            text,
  provider_event_id   text,
  provider_calendar_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint appointments_ends_after_start check (scheduled_end > scheduled_start)
);

create index appointments_workspace_start_idx on appointments (workspace_id, scheduled_start);
create index appointments_workspace_status_idx on appointments (workspace_id, status, scheduled_start);
create index appointments_workspace_customer_idx on appointments (workspace_id, customer_id, scheduled_start desc);
create index appointments_service_idx on appointments (service_id) where service_id is not null;

create trigger appointments_updated_at before update on appointments
  for each row execute function set_updated_at();

-- Deferred until appointments exists. A conversation may reference the booking
-- it produced; deleting the appointment leaves the conversation intact.
alter table conversations
  add constraint conversations_appointment_fkey
  foreign key (appointment_id) references appointments (id) on delete set null;

-- == Activity events =========================================================
--
-- An event stream, not a second copy of business state. "Appointment cancelled"
-- belongs here; whether the appointment *is* cancelled is a column on the
-- appointment. Nothing derives current state by replaying this table.

create table activity_events (
  id              text primary key,
  workspace_id    text not null references workspaces (id) on delete cascade,
  type            text not null check (type in
                    ('appointment_booked','appointment_rescheduled','appointment_cancelled',
                     'call_completed','question_answered','conversation_escalated','conversation_missed')),
  occurred_at     timestamptz not null,
  customer_id     text references customers (id) on delete set null,
  channel         text not null check (channel in ('voice','sms','email')),
  summary         text not null default '',
  detail          text not null default '',
  conversation_id text references conversations (id) on delete set null,
  call_id         text references calls (id) on delete set null,
  appointment_id  text references appointments (id) on delete set null
);

create index activity_events_workspace_idx on activity_events (workspace_id, occurred_at desc);

-- == Notifications ===========================================================
--
-- Workspace-scoped, with a real instant. The previous client-side version
-- stored strings like "2 min ago", which stop being true the moment they are
-- written; formatting happens at display time from created_at.

create table notifications (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  title        text not null,
  description  text not null default '',
  severity     text not null check (severity in ('info','success','warning','critical')),
  read         boolean not null default false,
  critical     boolean not null default false,
  related_type text check (related_type in ('appointment','call','conversation','integration')),
  related_id   text,
  created_at   timestamptz not null default now()
);

create index notifications_workspace_idx on notifications (workspace_id, created_at desc);
create index notifications_workspace_unread_idx on notifications (workspace_id, read, created_at desc);
