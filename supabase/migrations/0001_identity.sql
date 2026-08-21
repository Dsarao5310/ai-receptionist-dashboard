-- Identity and tenancy.
--
-- Three tables, deliberately separate: a person (users), a tenant (workspaces)
-- and the join that carries authority (workspace_memberships). A role is never
-- a column on a person — the same person can own one business and be staff at
-- another. The one privilege that genuinely belongs to the person is
-- platform_role, because operating the platform is not a fact about any tenant.
--
-- Identifiers are prefixed text rather than uuid. They are opaque to clients and
-- never enumerable, but a prefixed id is legible in an audit row or a support
-- conversation, and the existing catalogue ids (svc_haircut and friends) are
-- referenced by historical appointment snapshots that must not be rewritten.
--
-- Everything in this file is unqualified so the same migration builds the
-- application schema and the isolated test schema; the runner sets search_path.

-- Stamps updated_at on write so no call site has to remember to.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Users ───────────────────────────────────────────────────────────────────

create table users (
  id            text primary key,
  name          text not null,
  email         text not null,
  avatar_url    text,
  job_title     text not null default '',
  platform_role text not null default 'member' check (platform_role in ('operator', 'member')),
  status        text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Sign-in matches on email case-insensitively, so uniqueness must too.
create unique index users_email_key on users (lower(email));

create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ── Workspaces ──────────────────────────────────────────────────────────────
--
-- Tenancy and billing, not operating configuration. Hours, services and
-- knowledge belong to the business profile; merging them here would make
-- billing depend on someone editing their opening times.
--
-- Usage counters are deliberately absent: conversations and minutes used are
-- derived from the domain tables. A stored counter is a second copy of the
-- truth, and stale precomputed values have already caused bugs in this product.

create table workspaces (
  id                    text primary key,
  name                  text not null,
  slug                  text not null unique,
  status                text not null default 'active'
                          check (status in ('active', 'trialing', 'suspended', 'closed')),
  subscription_status   text not null default 'trialing'
                          check (subscription_status in ('active', 'past_due', 'trialing', 'cancelled')),
  tier                  text not null default 'starter'
                          check (tier in ('starter', 'professional', 'scale')),
  owner_user_id         text not null references users (id) on delete restrict,
  conversations_included integer not null default 0 check (conversations_included >= 0),
  minutes_included      integer not null default 0 check (minutes_included >= 0),
  feature_flags         jsonb not null default '{}'::jsonb,
  internal_notes        text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger workspaces_updated_at before update on workspaces
  for each row execute function set_updated_at();

-- ── Memberships ─────────────────────────────────────────────────────────────
--
-- The only place a business role lives, and the single lookup every
-- authorization decision funnels through.
--
-- One row per (user, workspace) pair. Revocation is a status change rather than
-- a new row, which makes "is this person a member right now" a question with
-- exactly one answer — duplicate active memberships are impossible by
-- construction rather than by convention. The history of who was granted what
-- lives in audit_events.

create table workspace_memberships (
  id           text primary key,
  user_id      text not null references users (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  role         text not null check (role in ('owner', 'manager', 'staff')),
  status       text not null default 'active' check (status in ('active', 'invited', 'revoked')),
  invited_at   timestamptz,
  joined_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint workspace_memberships_user_workspace_key unique (user_id, workspace_id)
);

create index workspace_memberships_workspace_idx on workspace_memberships (workspace_id, status);
create index workspace_memberships_user_idx on workspace_memberships (user_id, status);

create trigger workspace_memberships_updated_at before update on workspace_memberships
  for each row execute function set_updated_at();

-- ── Invitations ─────────────────────────────────────────────────────────────

create table invitations (
  id                 text primary key,
  workspace_id       text not null references workspaces (id) on delete cascade,
  email              text not null,
  role               text not null check (role in ('owner', 'manager', 'staff')),
  invited_by_user_id text references users (id) on delete set null,
  status             text not null default 'pending'
                       check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);

-- One live invitation per address per workspace; revoked and expired ones stay
-- as history.
create unique index invitations_pending_key
  on invitations (workspace_id, lower(email)) where status = 'pending';

create index invitations_workspace_idx on invitations (workspace_id, status);

-- ── Audit ───────────────────────────────────────────────────────────────────
--
-- Append-only, and not merely by convention: the grants migration revokes
-- UPDATE and DELETE on this table from the application role, so a bug in the
-- product cannot rewrite its own trail.
--
-- workspace_id is nullable for platform-level actions belonging to no tenant,
-- and both foreign keys are ON DELETE SET NULL so removing an account or
-- closing a tenant never erases the record that something happened.

create table audit_events (
  id             text primary key,
  actor_user_id  text references users (id) on delete set null,
  workspace_id   text references workspaces (id) on delete set null,
  action         text not null,
  target_type    text,
  target_id      text,
  occurred_at    timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb
);

create index audit_events_workspace_idx on audit_events (workspace_id, occurred_at desc);
create index audit_events_actor_idx on audit_events (actor_user_id, occurred_at desc);
