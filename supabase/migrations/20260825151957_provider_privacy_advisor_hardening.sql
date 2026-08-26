-- Forward-only hardening for the provider/privacy staging advisor findings.
--
-- Keep the schema dynamic: the repository migrator applies this to `app`,
-- while the database test harness applies the same file to `app_test`.
do $$
declare
  target_schema text := current_schema();
begin
  execute format(
    'alter function %I.create_default_workspace_privacy_policy() set search_path = %I, pg_catalog',
    target_schema,
    target_schema
  );
  execute format(
    'alter function %I.initialize_call_privacy_state() set search_path = %I, pg_catalog',
    target_schema,
    target_schema
  );
end;
$$;

-- Cover the leading columns of each composite email foreign key. Existing
-- activity/provider indexes have different leading columns and do not support
-- referential checks from the parent side.
create index email_threads_mailbox_fk_idx
  on email_threads (workspace_id, mailbox_id);
create index email_threads_customer_fk_idx
  on email_threads (workspace_id, customer_id);
create index email_threads_conversation_fk_idx
  on email_threads (workspace_id, conversation_id);

create index email_messages_mailbox_fk_idx
  on email_messages (workspace_id, mailbox_id);
create index email_messages_thread_fk_idx
  on email_messages (workspace_id, thread_id);
create index email_messages_customer_fk_idx
  on email_messages (workspace_id, customer_id);
create index email_messages_conversation_fk_idx
  on email_messages (workspace_id, conversation_id);

-- These actor references are independently updated by the erasure workflow,
-- so each needs its own supporting index for user deletion/restriction checks.
create index privacy_erasure_requests_requested_by_fk_idx
  on privacy_erasure_requests (requested_by_user_id);
create index privacy_erasure_requests_identity_verified_by_fk_idx
  on privacy_erasure_requests (identity_verified_by_user_id);
create index privacy_erasure_requests_completed_by_fk_idx
  on privacy_erasure_requests (completed_by_user_id);
create index privacy_erasure_requests_rejected_by_fk_idx
  on privacy_erasure_requests (rejected_by_user_id);
