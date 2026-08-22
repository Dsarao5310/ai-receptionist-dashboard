# Operations runbook

These procedures apply to the AI Receptionist repository. Production changes
always require an identified operator, a verified backup, and an explicit
release decision. Database migrations are forward-only.

## Deployment verification

1. Record the source commit, target environment, current deployment ID, and
   current database migration status.
2. For staging, confirm the `staging` branch, stable branch alias, staging OAuth
   client, and Supabase ref `jhkbsfsbnynysplvnwca`. For production, confirm
   `master` and ensure no staging value is present.
3. Run typecheck, lint, tests, `npm run deploy:build`, and
   `npm run audit:client-secrets` once on the release candidate.
4. Apply reviewed migrations separately before application promotion. The
   application runtime must never receive `MIGRATION_DATABASE_URL`.
5. Validate the exact built Preview artifact over HTTPS. Check sign-in,
   protected navigation, role gates, tenant isolation, critical mutations, and
   provider fail-closed state.
6. Scan Vercel build/runtime errors and record the deployment ID. Promotion must
   point production at the already-verified artifact; do not rebuild different
   source during promotion.
7. Recheck error logs, sign-in, and one read-only business path immediately
   after promotion.

## Rollback

1. Stop further promotion and disable the affected provider when an external
   side effect may repeat.
2. Record the incident time, bad deployment ID, prior READY deployment ID, and
   database migration version.
3. If the prior application is compatible with the migrated schema, use Vercel
   rollback/promote to repoint the production alias to that exact artifact.
4. Never reverse a production migration by running `db:reset` or deleting data.
   Use a reviewed forward repair migration when schema repair is required.
5. Verify authentication, tenant-scoped reads, one safe mutation, runtime logs,
   and provider state after rollback.

## Database migration procedure

1. Inspect every existing migration and the live migration ledger.
2. Test the migration against the disposable `app_test` schema and then the
   isolated staging project using `app_migrator`.
3. Run tenant-tampering, repository, and provider-operation tests using
   `app_runtime`; confirm it still has no DDL, role, superuser, replication, or
   BYPASSRLS privileges.
4. Capture and verify the provider-managed backup state before production.
5. Apply once through the controlled migration job, verify the ledger/checksum,
   and run read-only integrity queries. Never expose the migrator URL to the app.

## Incident response basics

1. Classify impact: authentication, tenant isolation, data integrity, external
   side effects, availability, or secret exposure.
2. Contain first: disable the affected provider, revoke a compromised secret,
   block the webhook, or roll back the application as appropriate.
3. Preserve deployment IDs, request IDs, operation/event/audit rows, timestamps,
   and redacted logs. Do not paste secrets or raw customer payloads into tickets.
4. Identify affected workspaces through server-authorized records. Never infer
   scope from a browser-supplied workspace ID.
5. Repair, verify in staging, release through the normal gates, and document the
   cause, impact, remediation, and follow-up owner.

## Provider disable / fail-closed procedure

1. Set the provider's environment-specific mode to `disabled`; never use
   `simulated` in a deployed production-shaped environment.
2. Redeploy the affected environment and verify the server projects any stale
   connected row as unavailable.
3. Confirm business pages use generic capability wording and expose no vendor,
   URL, workflow, credential, or raw error detail.
4. For `sync_required`, stop automatic retries and reconcile the external and
   local records manually before re-enabling the provider.

## Backup and restore verification plan

Do not test a restore against staging or production application data. Create an
isolated disposable Supabase project in the same region, restore the selected
backup there, and verify:

- migration ledger and schema objects;
- row counts and tenant-binding constraints;
- runtime/migrator role separation and private-schema grants;
- representative workspace-scoped reads;
- provider secret/OAuth table expectations;
- application compatibility using a temporary Preview deployment that points
  only at the restored project.

Destroy the disposable target only after the evidence is recorded and an
operator has confirmed no active deployment points to it. Until this drill is
performed, recovery remains **PARTIAL**, not live verified.
