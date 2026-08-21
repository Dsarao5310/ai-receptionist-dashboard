# Isolated staging foundation

Status date: 2026-08-21 (America/Vancouver)

## Selected model

Use one Vercel project with a dedicated `staging` Git branch and branch-scoped
Preview variables. Vercel provides a stable branch alias for repeat deployments,
which becomes the canonical `AUTH_URL` and callback origin after the first
Preview exists.

Use a separate Supabase project named `AI Receptionist Staging` in the existing
organization. Do not use the production `app` schema, copy production data, or
reuse production database credentials.

Why this model:

- the existing Hobby Vercel project includes Production, Preview, and
  Development but no custom environments;
- custom Vercel environments require Pro, while a branch-scoped Preview already
  supplies the required secret boundary and stable branch URL;
- the current Supabase organization has one production project and no branches;
- the current Supabase quote is $0/month for another project versus
  $0.01344/hour for a branch;
- a separate project avoids Supabase dashboard-branching's documented limitation
  that custom roles are not captured automatically.

## Current live boundaries

- Production branch: `master`.
- Production origin: `https://ai-receptionist-dashboard-jade.vercel.app`.
- Vercel Preview branch tracking: enabled for all non-production branches.
- Preview environment variables: none.
- Production-only variables: `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `N8N_MODE`,
  `GOOGLE_CALENDAR_MODE`, and `TWILIO_MODE`.
- Custom Vercel environments: none; the account UI reports that Pro is required.
- Supabase production project: `rkzwubwogtezqbuhieuo`.
- Supabase staging project: `AI Receptionist Staging`
  (`jhkbsfsbnynysplvnwca`), healthy in `ca-central-1`.
- Staging database: migrations `0001` through `0011` applied, guarded fixture
  seed verified, no real identity overrides, no provider/OAuth secrets, and one
  staging-only audit marker.
- Staging Security Advisor: 0 findings. Performance Advisor reports only 56
  expected unused-index INFO findings on the fresh fixture database.

## Provisioning order

### 1. Create the Supabase staging project

Completed with explicit cost approval: `AI Receptionist Staging` was created in
organization `Dsarao5310`, region `ca-central-1`, at the quoted $0/month cost.
Its project ref is `jhkbsfsbnynysplvnwca`.

### 2. Provision database roles

Create distinct login roles:

- `app_migrator`: owns schema `app`, runs controlled migrations and seed only;
- `app_runtime`: receives intended DML grants only and cannot create schema
  objects, update/delete audit history, create roles/databases, bypass RLS, or
  become superuser.

Never add the migration connection to Vercel.

Completed. The staging `app` schema is owned by `app_migrator`; `app_runtime`
has usage and intended DML only. Runtime role checks confirmed no schema create,
audit update/delete, role/database creation, superuser, or RLS-bypass privilege.

### 3. Reproduce and seed from source control

With the staging migration connection supplied only to the controlled shell:

```text
npm run db:migrate
npm run db:status
npm run db:seed:staging
```

`db:seed:staging` requires the isolated project ref twice, rejects the known
production project ref, verifies that the two URLs authenticate as the expected
roles, and inserts one harmless `environment.staging.seeded` audit marker. It
also verifies two workspaces, zero provider/OAuth secrets, and the runtime
least-privilege boundary.

Optional real identity variables are accepted only when the corresponding
Google account has been supplied and authorized:

```text
STAGING_OWNER_EMAIL
STAGING_MANAGER_EMAIL
STAGING_STAFF_EMAIL
STAGING_OPERATOR_EMAIL
STAGING_SECOND_OWNER_EMAIL
```

Omitted identities retain `.example` fixture addresses and must be reported as
not provisioned—not as live OAuth evidence.

Completed without identity overrides. Source migrations `0001` through `0009`
initially exposed a source/live drift: production had twelve additional
composite tenant foreign keys, hardening indexes, and locked function settings
that the numbered migration chain did not reproduce. Idempotent migration
`0010_production_hardening_parity.sql` now restores that state from source, and
`0011_twilio_fk_indexes.sql` covers the two relationships introduced later by
`0009`. Both are applied in staging; neither has been applied to production in
this phase.

The staging-backed focused suite passed 5 files and 66 tests against the
disposable `app_test` schema, including bidirectional tenant isolation, forged
workspace/role attempts, Auth.js identity resolution, runtime database limits,
production configuration, and safe redirects.

### 4. Establish the stable Vercel origin

Create and push the `staging` branch. The initial Preview may fail closed until
its required environment variables exist; record the stable branch alias Vercel
assigns and use exactly:

```text
AUTH_URL=https://<stable-staging-branch-alias>
```

Do not use the random deployment URL.

### 5. Create the staging Google OAuth client

In Google Cloud create an **OAuth 2.0 Client ID** with application type
**Web application**, separate from production.

Authorized JavaScript origin:

```text
https://<stable-staging-branch-alias>
```

Authorized redirect URI:

```text
https://<stable-staging-branch-alias>/api/auth/callback/google
```

Store the client ID and secret only as `staging`-branch Preview variables named
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Never paste the secret into source
control or documentation.

### 6. Add branch-scoped Preview variables

The `staging` branch receives only:

```text
AUTH_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
DATABASE_URL
N8N_MODE=disabled
GOOGLE_CALENDAR_MODE=disabled
TWILIO_MODE=disabled
```

`DATABASE_URL` must be the staging `app_runtime` transaction-pooler connection.
Do not add `MIGRATION_DATABASE_URL` or any production/provider secret.

### 7. Certify before providers

After a successful Preview deployment, complete the Auth/RBAC browser matrix,
prove the staging marker is absent from production, prove a harmless known
production-only record is absent from staging, rerun the client-secret audit,
and re-check production owner sign-in. Only then may live n8n certification be
considered.

## Stop conditions

Do not begin n8n, Twilio, Vapi, Gmail, Pinecone, or model-provider certification
during this foundation phase. Stop for project cost approval, Google OAuth
client creation, real identity authorization, DNS, or billing changes.
