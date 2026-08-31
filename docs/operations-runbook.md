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

## Liveness and uptime monitoring

1. Use `GET` or `HEAD /api/health` only as deployment liveness. HTTP 200 proves
   the dynamic Next.js route executed; it does not certify Postgres, providers,
   workflows, tenant operations, or business semantics.
2. The endpoint must remain content-free and no-store. Do not add environment,
   build, database, provider, tenant, secret, or customer fields to its response
   or structured log.
3. After deployment, verify the exact HTTPS endpoint and confirm its structured
   completion event appears without query strings, authorization headers, or
   customer content.
4. External alerting is not complete until a named primary/backup owner,
   notification route, acknowledgement target, escalation path, failure and
   recovery thresholds, and maintenance-window procedure are recorded.
5. Treat a liveness failure as an availability signal. Correlate it with Vercel
   runtime errors and authenticated dependency/provider health before choosing
   containment or rollback.

## Provider disable / fail-closed procedure

1. Set the provider's environment-specific mode to `disabled`; never use
   `simulated` in a deployed production-shaped environment.
2. Redeploy the affected environment and verify the server projects any stale
   connected row as unavailable.
3. Confirm business pages use generic capability wording and expose no vendor,
   URL, workflow, credential, or raw error detail.
4. For `sync_required`, stop automatic retries and reconcile the external and
   local records manually before re-enabling the provider.

## Privacy purge schedule

1. Apply and verify all three privacy migrations in isolated staging before
   enabling execution. With only the confirmed staging runtime credential in
   scope, run:

   ```text
   npm run privacy:preflight -- --expected-mode disabled --expected-project-ref jhkbsfsbnynysplvnwca
   ```

   The command must report all migrations and grants healthy while making no
   data mutation. Confirm `app_runtime` can update the lease/run ledger but
   cannot delete run history, consent events, or erasure requests.
2. Deploy first with `PRIVACY_PURGE_MODE=disabled`; the daily cron request must
   return 204 and must not create a run row.
3. Generate a dedicated random `CRON_SECRET` with at least 32 characters. Keep
   it separate from Auth.js and provider secrets, configure it only in the
   target environment, then set `PRIVACY_PURGE_MODE=scheduled` and redeploy.
4. Vercel invokes `/api/internal/cron/privacy-purge` daily at 03:17 UTC. A
   successful run returns aggregate counts only. An overlapping run returns a
   safe skipped result while the database lease is active.
5. Platform operators may review the server-rendered `/admin/privacy` page for
   sanitized disabled, never-run, healthy, missed, failed, running, or stale
   state. This in-app view is not an alert and performs no retry or schedule
   mutation. Until an approved external monitor exists, review the underlying
   run ledger through an operator-only, read-only query. Alert on failed status,
   missing daily completion, or a lease that remains active past its ten-minute
   expiry. Never put tenant ids or sensitive content into monitoring annotations.
6. To contain a purge incident, set mode back to `disabled` and redeploy. Do not
   delete run history, extend retention ad hoc, or restore erased content into
   the live schema. Investigate using sanitized run ids and an isolated backup.

## Sensitive-content erasure requests

1. Record the request with the target call id and a constrained internal case
   reference. Never put requester contact details, notes, transcript text,
   recording locators, or provider payloads into the request or audit trail.
2. Verify requester identity outside the dashboard using an approved method and
   trusted information already on file. The dashboard checkbox records the
   operator's attestation; it does not perform or prove the check.
3. Record the completed method. A request still in `pending_identity`, or one
   that was rejected, must never reach content deletion.
4. Before execution, re-check the call target and type the exact request-bound
   phrase. This is destructive confirmation, not reauthentication. Do not copy
   a phrase from another request or automate this step in browser QA.
5. After completion, confirm the request and audit chain show one transition
   and only aggregate transcript/recording outcomes. Preserve the operational
   call record, consent evidence, request row, and audit history.
6. On uncertainty, reject with a constrained reason or leave identity pending.
   Never delete request history or bypass the workflow with a direct erase.

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

### Local migration replay rehearsal (not a backup restore)

When a loopback Postgres instance is available, the source migrations can be
replayed in a one-use random schema without touching `app`, `app_test`, staging,
or Production:

```text
RECOVERY_REHEARSAL_DATABASE_URL=<loopback Postgres URL>
npm run db:recovery:rehearse -- --confirm "REHEARSE LOCAL MIGRATIONS <database-name>"
```

The command does not load `.env.local`, refuses Production mode and every
non-loopback hostname, creates only a generated `recovery_rehearsal_*` schema,
verifies migration checksums, required tables, and composite tenant foreign
keys, and drops that exact generated schema in `finally`. It prints no row data
or credential values. A migration replay proves source reproducibility only; it
does not prove that Supabase backups contain the required data, custom-role
password recovery, hosted settings, application Preview compatibility, or
restore-time objectives.

### Read-only restored-target verification

After an operator restores a real backup into a separate disposable Supabase
project and provisions its `app_runtime`/`app_migrator` roles, verify it with:

```text
RECOVERY_DATABASE_URL=<disposable app_runtime URL>
RECOVERY_MIGRATION_DATABASE_URL=<disposable app_migrator URL>
npm run db:recovery:verify -- --expected-project-ref <disposable-ref> --confirm "VERIFY DISPOSABLE RESTORE <disposable-ref>"
```

The verifier refuses the known staging and Production refs, requires both URLs
to match the explicitly confirmed disposable ref and expected roles, opens only
read-only transactions, and prints content-free migration, schema, role/grant,
constraint, and aggregate row-count evidence. It never creates, drops, migrates,
seeds, or calls providers. A successful run verifies the restored database
shape; application Preview compatibility and operator-confirmed cleanup remain
separate required steps.
