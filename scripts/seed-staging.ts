/**
 * Destructive, staging-only seed runner.
 *
 * This intentionally does not read `.env.local`, because that file belongs to
 * the developer/production-shaped environment on this workstation. Supply the
 * two staging database URLs through the process environment or an explicitly
 * loaded `.env.staging.local` file instead.
 *
 * Required:
 *   STAGING_SUPABASE_PROJECT_REF=<new isolated project ref>
 *   STAGING_CONFIRM_PROJECT_REF=<the same ref>
 *   STAGING_MIGRATION_DATABASE_URL=<app_migrator session-pooler URL>
 *   STAGING_RUNTIME_DATABASE_URL=<app_runtime transaction-pooler URL>
 *
 * Optional real Google identities (fixture `.example` addresses remain when a
 * value is omitted, and therefore remain NOT PROVISIONED for hosted OAuth):
 *   STAGING_OWNER_EMAIL
 *   STAGING_MANAGER_EMAIL
 *   STAGING_STAFF_EMAIL
 *   STAGING_OPERATOR_EMAIL
 *   STAGING_SECOND_OWNER_EMAIL
 */
import postgres from "postgres";
import { seedDatabase } from "../src/server/db/seed";
import type { Sql } from "../src/server/db/client";

const PRODUCTION_PROJECT_REF = "rkzwubwogtezqbuhieuo";
const STAGING_MARKER_ID = "aud_staging_environment_marker";

const identityOverrides = [
  { env: "STAGING_OWNER_EMAIL", userId: "usr_alex" },
  { env: "STAGING_MANAGER_EMAIL", userId: "usr_marcus" },
  { env: "STAGING_STAFF_EMAIL", userId: "usr_nina" },
  { env: "STAGING_OPERATOR_EMAIL", userId: "usr_sam" },
  { env: "STAGING_SECOND_OWNER_EMAIL", userId: "usr_priya" },
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function databaseUser(url: string): string {
  try {
    return decodeURIComponent(new URL(url).username);
  } catch {
    throw new Error("A staging database URL is malformed.");
  }
}

function assertRole(url: string, expected: "app_migrator" | "app_runtime"): void {
  const user = databaseUser(url);
  if (user !== expected && !user.startsWith(`${expected}.`)) {
    throw new Error(`The staging ${expected} URL must authenticate as ${expected}.`);
  }
}

function assertSafeTarget(projectRef: string, confirmation: string, migrationUrl: string, runtimeUrl: string): void {
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to seed the known production Supabase project.");
  }
  if (confirmation !== projectRef) {
    throw new Error("STAGING_CONFIRM_PROJECT_REF must exactly match STAGING_SUPABASE_PROJECT_REF.");
  }
  if (!migrationUrl.includes(projectRef) || !runtimeUrl.includes(projectRef)) {
    throw new Error("Both staging database URLs must contain the confirmed staging project ref.");
  }
  if (migrationUrl === runtimeUrl) {
    throw new Error("Runtime and migration database URLs must be different credentials.");
  }
  assertRole(migrationUrl, "app_migrator");
  assertRole(runtimeUrl, "app_runtime");
}

function requestedIdentities(): Array<{ env: string; userId: string; email: string }> {
  const requested = identityOverrides.flatMap(({ env, userId }) => {
    const email = process.env[env]?.trim().toLowerCase();
    if (!email) return [];
    if (!email.includes("@") || email.endsWith(".example")) {
      throw new Error(`${env} must be a real authorized email address, not a fixture address.`);
    }
    return [{ env, userId, email }];
  });

  const unique = new Set(requested.map(({ email }) => email));
  if (unique.size !== requested.length) {
    throw new Error("Each supplied staging role must use a distinct Google email identity.");
  }
  return requested;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run a destructive staging seed with NODE_ENV=production.");
  }

  const projectRef = required("STAGING_SUPABASE_PROJECT_REF");
  const confirmation = required("STAGING_CONFIRM_PROJECT_REF");
  const migrationUrl = required("STAGING_MIGRATION_DATABASE_URL");
  const runtimeUrl = required("STAGING_RUNTIME_DATABASE_URL");
  assertSafeTarget(projectRef, confirmation, migrationUrl, runtimeUrl);
  const identities = requestedIdentities();

  const migrator = postgres(migrationUrl, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 20,
    connection: { search_path: "app" },
    onnotice: () => {},
  });
  const runtime = postgres(runtimeUrl, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 20,
    connection: { search_path: "app" },
    onnotice: () => {},
  });

  try {
    await seedDatabase(migrator as unknown as Sql);

    for (const { userId, email } of identities) {
      await migrator`update users set email = ${email}, updated_at = now() where id = ${userId}`;
    }

    await migrator`
      insert into audit_events (
        id, actor_user_id, workspace_id, action, target_type, target_id, occurred_at, metadata
      ) values (
        ${STAGING_MARKER_ID}, null, null, 'environment.staging.seeded', 'environment',
        ${projectRef}, now(), ${migrator.json({ environment: "staging", projectRef })}
      )`;

    const [role] = await runtime<{
      current_user: string;
      superuser: boolean;
      create_role: boolean;
      create_db: boolean;
      bypass_rls: boolean;
      schema_usage: boolean;
      schema_create: boolean;
      audit_update: boolean;
      audit_delete: boolean;
    }[]>`
      select current_user,
             r.rolsuper as superuser,
             r.rolcreaterole as create_role,
             r.rolcreatedb as create_db,
             r.rolbypassrls as bypass_rls,
             has_schema_privilege(current_user, 'app', 'USAGE') as schema_usage,
             has_schema_privilege(current_user, 'app', 'CREATE') as schema_create,
             has_table_privilege(current_user, 'app.audit_events', 'UPDATE') as audit_update,
             has_table_privilege(current_user, 'app.audit_events', 'DELETE') as audit_delete
      from pg_roles r where r.rolname = current_user`;

    if (
      !role ||
      role.current_user !== "app_runtime" ||
      role.superuser ||
      role.create_role ||
      role.create_db ||
      role.bypass_rls ||
      !role.schema_usage ||
      role.schema_create ||
      role.audit_update ||
      role.audit_delete
    ) {
      throw new Error("The staging app_runtime role failed the least-privilege verification.");
    }

    const [{ workspaces }] = await runtime<{ workspaces: number }[]>`
      select count(*)::int as workspaces from workspaces`;
    const [{ marker }] = await runtime<{ marker: number }[]>`
      select count(*)::int as marker from audit_events where id = ${STAGING_MARKER_ID}`;
    const [{ providerSecrets, oauthStates }] = await runtime<{
      providerSecrets: number;
      oauthStates: number;
    }[]>`
      select (select count(*)::int from provider_secrets) as "providerSecrets",
             (select count(*)::int from oauth_states) as "oauthStates"`;

    if (workspaces !== 2 || marker !== 1 || providerSecrets !== 0 || oauthStates !== 0) {
      throw new Error("The staging seed verification did not match the expected isolated baseline.");
    }

    console.log(
      `Staging seed verified: 2 workspaces, ${identities.length} real identity override(s), ` +
        "least-privilege runtime, one staging marker, and no provider/OAuth secrets."
    );
  } finally {
    await Promise.all([migrator.end({ timeout: 5 }), runtime.end({ timeout: 5 })]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Staging seed failed.");
  process.exitCode = 1;
});
