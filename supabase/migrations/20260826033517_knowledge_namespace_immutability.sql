-- Provider namespaces are immutable tenant-isolation identifiers.
--
-- The application provisions each workspace mapping once with INSERT ... ON
-- CONFLICT and only reads it afterward. Retaining table-level UPDATE would let
-- the runtime role retarget a workspace to another provider namespace even
-- though no supported application operation requires that authority.

do $$
declare
  target_schema text := current_schema();
begin
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    execute format(
      'revoke update on table %I.knowledge_provider_namespaces from app_runtime',
      target_schema
    );
  end if;
end;
$$;
