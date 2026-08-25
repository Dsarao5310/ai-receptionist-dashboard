-- Durable administration workflow for sensitive-content erasure requests.
--
-- This table deliberately stores no requester name, email, phone number,
-- transcript, recording locator, provider payload, or free-text notes. Identity
-- verification happens out of band and is recorded only as a constrained
-- method plus actor and timestamp. Execution remains a separate transition.

create table privacy_erasure_requests (
  id                              text primary key,
  workspace_id                    text not null,
  call_id                         text not null,
  request_reference               text not null
                                   check (request_reference ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'),
  status                          text not null default 'pending_identity'
                                   check (status in ('pending_identity','verified','completed','rejected')),
  requested_by_user_id            text not null references users (id) on delete restrict,
  identity_verification_method    text
                                   check (identity_verification_method in (
                                     'callback_to_record','matched_account_record','in_person'
                                   )),
  identity_verified_by_user_id    text references users (id) on delete restrict,
  identity_verified_at            timestamptz,
  completed_by_user_id            text references users (id) on delete restrict,
  completed_at                    timestamptz,
  transcript_erased               boolean,
  recording_erased                boolean,
  rejected_by_user_id             text references users (id) on delete restrict,
  rejected_at                     timestamptz,
  rejection_reason_code           text
                                   check (rejection_reason_code in (
                                     'request_withdrawn','identity_unverified','not_applicable'
                                   )),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  foreign key (workspace_id, call_id)
    references calls (workspace_id, id) on delete restrict,
  constraint privacy_erasure_request_state_complete check (
    (
      status = 'pending_identity'
      and identity_verification_method is null
      and identity_verified_by_user_id is null
      and identity_verified_at is null
      and completed_by_user_id is null and completed_at is null
      and transcript_erased is null and recording_erased is null
      and rejected_by_user_id is null and rejected_at is null and rejection_reason_code is null
    ) or (
      status = 'verified'
      and identity_verification_method is not null
      and identity_verified_by_user_id is not null
      and identity_verified_at is not null
      and completed_by_user_id is null and completed_at is null
      and transcript_erased is null and recording_erased is null
      and rejected_by_user_id is null and rejected_at is null and rejection_reason_code is null
    ) or (
      status = 'completed'
      and identity_verification_method is not null
      and identity_verified_by_user_id is not null
      and identity_verified_at is not null
      and completed_by_user_id is not null and completed_at is not null
      and transcript_erased is not null and recording_erased is not null
      and rejected_by_user_id is null and rejected_at is null and rejection_reason_code is null
    ) or (
      status = 'rejected'
      and completed_by_user_id is null and completed_at is null
      and transcript_erased is null and recording_erased is null
      and rejected_by_user_id is not null and rejected_at is not null and rejection_reason_code is not null
    )
  )
);

create unique index privacy_erasure_requests_reference_idx
  on privacy_erasure_requests (workspace_id, request_reference);

create unique index privacy_erasure_requests_one_active_call_idx
  on privacy_erasure_requests (workspace_id, call_id)
  where status in ('pending_identity','verified');

create index privacy_erasure_requests_queue_idx
  on privacy_erasure_requests (workspace_id, status, created_at desc);

create trigger privacy_erasure_requests_updated_at
  before update on privacy_erasure_requests
  for each row execute function set_updated_at();

do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping erasure-request runtime grants';
    return;
  end if;

  execute format(
    'grant select, insert, update on table %I.privacy_erasure_requests to app_runtime',
    target_schema);
  execute format(
    'revoke delete on table %I.privacy_erasure_requests from app_runtime',
    target_schema);
end $$;
