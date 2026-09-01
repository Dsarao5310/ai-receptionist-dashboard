# Isolated staging foundation

Status date: 2026-08-22 (America/Vancouver)

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
- Vercel Preview branch tracking: enabled for all non-production branches at
  the platform level, but as of 2026-09-01 `vercel.json`'s `ignoreCommand`
  skips the actual build unless the branch is `master` or `staging` — every
  other branch (task branches included) no longer produces a build, since
  none of them ever had Preview secrets and the builds only ever failed.
- Staging origin:
  `https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app`.
- Staging has since advanced well past the deployments below — it's currently
  at commit `64fa59a` (`dpl_8SuiPxLYLawkfkZQu5KNgZQPMkKr`, READY), picked up
  the rotated Pinecone key and the Knowledge reconciliation tooling. The
  history below (`ccf6272`/`0b444ac`) is the original five-role/Knowledge
  live-certification record and remains accurate for what it certified, just
  not staging's current deployment.
- Latest verified Preview deployment at the time of that original
  certification: `dpl_5MHQZMfCnkUQdhBidnh6dVVDALFj`, commit `ccf6272`, `READY`
  and five-role re-certified. Staging was later redeployed at `0b444ac`
  (`dpl_5ypffPNJxgW3YNxzeni5Ufjsr63D`, READY) after PR #2 merged, bringing in
  the Business Knowledge/Pinecone application code; see
  `docs/knowledge-provider-readiness.md` for the live certification.
- Required Preview values are scoped to branch `staging` only, including the
  rotated runtime `DATABASE_URL`. Other Preview branches remain fail-closed.
- Production-only variables: `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `N8N_MODE`,
  `GOOGLE_CALENDAR_MODE`, and `TWILIO_MODE`.
- Custom Vercel environments: none; the account UI reports that Pro is required.
- Supabase production project: `rkzwubwogtezqbuhieuo`.
- Supabase staging project: `AI Receptionist Staging`
  (`jhkbsfsbnynysplvnwca`), healthy in `ca-central-1`.
- Staging database: files 1-18 are applied and verified; local file 19
  (`knowledge_namespace_immutability`) passes disposable `app_test` verification
  and is pending explicit application to staging `app`. Guarded fixture seed
  verified, five explicitly authorized real role-test identities, no
  provider/OAuth secrets, and staging-only environment/identity audit markers.
- Staging Security Advisor: 0 findings. Performance Advisor has no unindexed-FK
  or non-INFO findings; remaining notices are unused-index INFO on fresh data.

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
`0009`. This paragraph records the original foundation discovery; both remote
projects advanced through the verified 17-file checkpoint; staging later
advanced alone to file 18 for the Knowledge schema foundation.

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

Completed. Branch `staging` pointed to commit `ccf6272` at the time of this
provisioning step; the stable alias is
`https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app`. Staging
has since advanced to commit `0b444ac` after PR #2 merged — the alias is
unchanged.

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

Completed. A separate staging Web application client uses the stable branch
origin and its exact `/api/auth/callback/google` redirect. The production OAuth
client was not reused or changed.

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

Completed. All eight variables are Sensitive, Preview-only, and branch-scoped
to `staging`. The three provider modes are explicitly `disabled`. The runtime
database password and `AUTH_SECRET` were rotated before the successful deploy
after an unsaved form preview exposed their initial generated values; the
discarded values were never deployed.

### 7. Certify before providers

After a successful Preview deployment, complete the Auth/RBAC browser matrix,
prove the staging marker is absent from production, prove a harmless known
production-only record is absent from staging, rerun the client-secret audit,
and re-check production owner sign-in. Only then may live n8n certification be
considered.

Current certification:

- the production configuration gate passed without printing secrets;
- Next.js 16.3.1 compiled, TypeScript passed, and deployment
  `dpl_2YM2FkEQ3MPEjv5PeEqzhpfDME3E` is `READY`;
- the signed-out `/sign-in` page returns `200` over HTTPS with HSTS and
  private/no-store caching;
- first Google callback created an ordinary active member with no workspace
  access and failed closed with `AccessDenied`;
- after explicit authorization, that existing identity received one audited
  active `owner` membership for Coastal Bloom Salon;
- Google OAuth then completed, the account menu showed
  `Coastal Bloom Salon · Owner`, business settings were allowed, and
  platform-only settings returned `Access denied`;
- sign-out returned to `/sign-in`, and a protected analytics deep link retained
  only the safe same-origin continuation;
- Coastal Bloom owner, manager, and staff, Harbour Dental owner, and the
  platform operator all completed real Google OAuth over the stable HTTPS
  staging origin;
- role gates passed for business settings, analytics, connections,
  appointments, customers, and platform-only administration;
- the operator could switch between Coastal Bloom Salon and Harbour Dental,
  while ordinary users saw only their authorized workspace;
- cross-workspace isolation, Google account selection, sign-out, and safe
  continuation passed, with no staging Vercel runtime errors during the matrix.

## Stop conditions

Do not begin n8n, Twilio, Vapi, Gmail, Pinecone, or model-provider certification
during this foundation phase. Stop for project cost approval, Google OAuth
client creation, real identity authorization, DNS, or billing changes.
