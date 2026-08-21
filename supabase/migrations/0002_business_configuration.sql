-- Business configuration: what the business *is* and how the receptionist
-- behaves. Two owners, kept apart on purpose - the profile owns facts (hours,
-- services, knowledge, contact details) and the AI configuration owns behaviour
-- only. Nothing about hours, pricing or contact details is repeated in
-- ai_configurations; it reads them.

-- == Business profile ========================================================
--
-- One row per workspace. The timezone here is authoritative for every wall
-- clock in the product: business hours, day boundaries, appointment
-- presentation, analytics buckets, special dates and after-hours calculations.
-- The browser's timezone is never business truth.

create table business_profiles (
  workspace_id text primary key references workspaces (id) on delete cascade,
  name         text not null,
  phone        text not null default '',
  email        text not null default '',
  address      text not null default '',
  website      text not null default '',
  -- An IANA zone name. Validated in the application against the runtime's zone
  -- database, which Postgres cannot check without pinning a copy of it.
  timezone     text not null check (length(timezone) > 0),
  category     text not null default '',
  description  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger business_profiles_updated_at before update on business_profiles
  for each row execute function set_updated_at();

-- == Weekly hours ============================================================
--
-- Normalized rather than JSON, for one reason: a day is a *list* of open
-- periods, and the product must keep being able to express 09:00-12:00 plus
-- 13:00-18:00. Rows let the database enforce that each period is well formed
-- (closes after opens) and that periods are ordered, which a JSON blob cannot
-- do without a schema extension. The cost is one extra join on a table that is
-- read once per page and holds seven rows per tenant.
--
-- "Closed" is is_open = false, distinct from "open but not yet configured"
-- (is_open = true with no intervals). Collapsing the two would lose the
-- difference between a business that shuts on Sunday and one that has not
-- filled Sunday in.

create table business_hours (
  workspace_id text not null references workspaces (id) on delete cascade,
  weekday      text not null check (weekday in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  is_open      boolean not null default true,
  primary key (workspace_id, weekday)
);

create table business_hour_intervals (
  workspace_id text not null,
  weekday      text not null,
  position     integer not null check (position >= 0),
  opens_at     time not null,
  closes_at    time not null,
  primary key (workspace_id, weekday, position),
  foreign key (workspace_id, weekday)
    references business_hours (workspace_id, weekday) on delete cascade,
  constraint business_hour_intervals_ordered check (closes_at > opens_at)
);

-- == Special hours ===========================================================
--
-- A dated override. Special hours beat weekly hours everywhere: the scheduling
-- validator, the availability selectors and the receptionist simulator all
-- consult this table first. One override per date per workspace, so "which rule
-- applies today" has exactly one answer.

create table special_hours (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  on_date      date not null,
  label        text not null default '',
  is_closed    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint special_hours_workspace_date_key unique (workspace_id, on_date)
);

create index special_hours_workspace_idx on special_hours (workspace_id, on_date);

create trigger special_hours_updated_at before update on special_hours
  for each row execute function set_updated_at();

create table special_hour_intervals (
  special_hours_id text not null references special_hours (id) on delete cascade,
  position         integer not null check (position >= 0),
  opens_at         time not null,
  closes_at        time not null,
  primary key (special_hours_id, position),
  constraint special_hour_intervals_ordered check (closes_at > opens_at)
);

-- == Services ================================================================
--
-- The *current* catalogue. Identity is the id and never the name: renaming
-- "Haircut" changes this row and nothing else, because appointments carry their
-- own snapshot of what was booked.
--
-- Deleting a service is allowed and does not touch history - appointments.
-- service_id is ON DELETE SET NULL, so a past booking keeps its snapshot and
-- simply loses its link to a catalogue entry that no longer exists. Hiding a
-- service from new bookings without deleting it is active = false.

create table services (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  description  text not null default '',
  price_model  text not null check (price_model in ('fixed','from','free','contact','hidden')),
  price        numeric(10,2) not null default 0 check (price >= 0),
  duration_min integer not null check (duration_min > 0),
  active       boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index services_workspace_idx on services (workspace_id, position);

create trigger services_updated_at before update on services
  for each row execute function set_updated_at();

-- == Knowledge ===============================================================
--
-- Business facts the receptionist may answer from. No embedding ids, vector
-- references or index metadata: those belong to a future provider-indexing
-- layer and have no place in a client-facing domain object.

create table knowledge_entries (
  id           text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  category     text not null check (category in
                 ('faq','parking','payment','cancellation','late_arrival',
                  'booking','accessibility','general')),
  title        text not null,
  content      text not null default '',
  active       boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index knowledge_entries_workspace_idx on knowledge_entries (workspace_id, position);

create trigger knowledge_entries_updated_at before update on knowledge_entries
  for each row execute function set_updated_at();

-- == AI configuration ========================================================
--
-- Behaviour only. Flat columns rather than a JSON document because every field
-- is a known, constrained choice - and constrained choices are worth letting the
-- database check.

create table ai_configurations (
  workspace_id                 text primary key references workspaces (id) on delete cascade,
  enabled                      boolean not null default true,
  channel_voice                boolean not null default true,
  channel_sms                  boolean not null default true,
  channel_email                boolean not null default true,
  greeting                     text not null default '',
  personality                  text not null default 'friendly'
                                 check (personality in ('friendly','professional','energetic','concise')),
  voice_name                   text not null default 'Aria',
  voice_speed_pct              integer not null default 100 check (voice_speed_pct between 50 and 200),
  voice_tone                   text not null default 'Warm',
  booking_default_duration_min integer not null default 45 check (booking_default_duration_min > 0),
  booking_min_notice_min       integer not null default 0 check (booking_min_notice_min >= 0),
  booking_max_advance_days     integer not null default 60 check (booking_max_advance_days > 0),
  booking_max_concurrent       integer not null default 1 check (booking_max_concurrent > 0),
  booking_send_confirmation    boolean not null default true,
  booking_allow_reschedule     boolean not null default true,
  booking_allow_cancellation   boolean not null default true,
  escalation_when_unsure       text not null default 'take_message'
                                 check (escalation_when_unsure in
                                   ('take_message','ask_to_call','escalate','mark_for_review')),
  escalation_urgent            text not null default 'escalate'
                                 check (escalation_urgent in
                                   ('take_message','ask_to_call','escalate','mark_for_review')),
  escalation_unsupported       text not null default 'ask_to_call'
                                 check (escalation_unsupported in
                                   ('take_message','ask_to_call','escalate','mark_for_review')),
  after_hours                  text not null default 'answer_no_booking'
                                 check (after_hours in ('answer_normally','answer_no_booking',
                                   'take_message','share_hours','offer_next_slot')),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create trigger ai_configurations_updated_at before update on ai_configurations
  for each row execute function set_updated_at();
