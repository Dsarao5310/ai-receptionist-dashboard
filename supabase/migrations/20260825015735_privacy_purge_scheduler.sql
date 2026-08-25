-- Privacy purge scheduling and sanitized execution history.
--
-- Vercel Cron can redeliver or overlap invocations. A renewable database lease
-- gives the task one owner without relying on process memory, while a bounded
-- run ledger provides monitoring evidence without customer, workspace,
-- transcript, recording, URL, or provider detail.

create table privacy_purge_lease (
  id          text primary key check (id = 'global'),
  run_id      text,
  lease_until timestamptz not null default 'epoch'::timestamptz,
  updated_at  timestamptz not null default now()
);

insert into privacy_purge_lease (id) values ('global')
on conflict (id) do nothing;

create trigger privacy_purge_lease_updated_at
  before update on privacy_purge_lease
  for each row execute function set_updated_at();

create table privacy_purge_runs (
  id                  text primary key,
  status              text not null check (status in ('running','completed','failed')),
  started_at          timestamptz not null,
  completed_at        timestamptz,
  workspaces_processed integer not null default 0 check (workspaces_processed >= 0),
  calls_processed     integer not null default 0 check (calls_processed >= 0),
  transcripts_erased  integer not null default 0 check (transcripts_erased >= 0),
  recordings_erased   integer not null default 0 check (recordings_erased >= 0),
  error_code          text check (error_code is null or length(error_code) between 1 and 64),
  duration_ms         integer check (duration_ms is null or duration_ms >= 0),
  created_at          timestamptz not null default now(),
  constraint privacy_purge_run_completion check (
    (status = 'running' and completed_at is null and duration_ms is null and error_code is null)
    or
    (status = 'completed' and completed_at is not null and duration_ms is not null and error_code is null)
    or
    (status = 'failed' and completed_at is not null and duration_ms is not null and error_code is not null)
  )
);

create index privacy_purge_runs_started_idx
  on privacy_purge_runs (started_at desc);

create index privacy_purge_runs_failed_idx
  on privacy_purge_runs (started_at desc)
  where status = 'failed';

do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping privacy scheduler runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update on table %I.privacy_purge_lease to app_runtime',
    target_schema);
  execute format(
    'grant select, insert, update on table %I.privacy_purge_runs to app_runtime',
    target_schema);
  execute format(
    'revoke delete on table %I.privacy_purge_lease from app_runtime',
    target_schema);
  execute format(
    'revoke delete on table %I.privacy_purge_runs from app_runtime',
    target_schema);
end $$;
