-- Privileges, and an honest note about row-level security.
--
-- This migration is written so that re-running it against a fresh schema
-- reproduces the same privilege state. It grants to app_runtime only if that
-- role exists, so the migrations also apply to an isolated test schema created
-- by a developer who has not provisioned the runtime role.

-- == What the application role may do =========================================
--
-- app_runtime holds SELECT/INSERT/UPDATE/DELETE on this schema and nothing
-- else. It is not a superuser, has no BYPASSRLS, cannot create or drop objects,
-- and has no access to the auth or storage schemas. Default privileges set at
-- provisioning time already cover tables created by migrations; these
-- statements make the state explicit and cover anything created before them.

do $$
declare
  target_schema text := current_schema();
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    raise notice 'app_runtime does not exist; skipping runtime grants';
    return;
  end if;

  execute format('grant usage on schema %I to app_runtime', target_schema);
  execute format(
    'grant select, insert, update, delete on all tables in schema %I to app_runtime', target_schema);
  execute format('grant usage, select on all sequences in schema %I to app_runtime', target_schema);
  execute format('revoke create on schema %I from app_runtime', target_schema);

  -- == The audit trail is append-only ========================================
  --
  -- Not a convention, a privilege. The application may write audit rows and
  -- read them back; it cannot alter or remove one. A bug in the product - or
  -- someone using the product to cover their tracks - cannot rewrite the record
  -- of what happened, because the credential the application holds has no verb
  -- for it.
  execute format('revoke update, delete on table %I.audit_events from app_runtime', target_schema);

  -- The migration ledger belongs to the migrator. The runtime may read it (a
  -- health check may want to know the schema version) but never write it.
  execute format('revoke insert, update, delete on table %I.schema_migrations from app_runtime', target_schema);
end $$;

-- Documented on whichever schema this ran against, so the test schema carries
-- the same note as the application one.
do $$
begin
  execute format(
    'comment on schema %I is %L',
    current_schema(),
    'Application data. Not exposed via PostgREST. Tenant isolation is enforced by '
    'workspace-scoped repositories above a least-privilege role - see '
    'supabase/migrations/0005_grants_and_rls.sql and src/server/README.md.');
end $$;

-- == Row-level security ======================================================
--
-- RLS is deliberately NOT used for tenant isolation here, and the reason is
-- worth stating plainly rather than leaving as an absence.
--
-- Supabase's RLS story assumes Supabase Auth: policies are written against
-- auth.uid(), which is read from a JWT that Supabase's own API layer verifies.
-- This application authenticates with Auth.js. There is no Supabase JWT in the
-- request, so auth.uid() is null on every connection the application opens. A
-- policy written as "using (workspace_id in (select ... where user_id =
-- auth.uid()))" would therefore evaluate against null and deny everything, or -
-- far worse if someone "fixed" it by loosening the predicate - would sit in the
-- database looking like protection while enforcing nothing.
--
-- Decorative security is worse than none, because it stops people looking for
-- the real thing. So:
--
--   * Tenant isolation is enforced in the application: every query is issued by
--     a repository bound to a workspace id that came from a verified session and
--     a membership lookup, and the tests in server/db/*.test.ts prove it against
--     this database rather than against a mock.
--   * The database contributes what it genuinely can: a least-privilege role,
--     an append-only audit table, a schema unreachable from PostgREST, and
--     CHECK constraints that refuse malformed or secret-bearing rows.
--
-- The one thing that would make RLS real for this stack is passing a verified
-- tenant claim into the session - for example SET LOCAL app.workspace_id inside
-- every transaction, with policies reading current_setting('app.workspace_id').
-- That is a coherent future step and it does not require Supabase Auth. It is
-- not taken now because it must be all-or-nothing to mean anything, and doing
-- it half way is how the decorative version gets born.
--
-- These tables live in schema `app`, which is not exposed through PostgREST.
-- The anon and service-role API keys reach `public`; they cannot see this data
-- at all, which is why enabling RLS on it would protect against nothing that is
-- currently reachable.

