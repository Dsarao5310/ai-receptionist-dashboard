import type { EnvironmentSource } from "./production-config";
import { databaseProjectRef } from "./n8n-preflight";
import type { Sql } from "./db/client";

export const PRIVACY_MIGRATIONS = [
  "20260825012531_call_privacy_lifecycle.sql",
  "20260825015735_privacy_purge_scheduler.sql",
  "20260825025737_privacy_erasure_requests.sql",
] as const;

const PRODUCTION_SUPABASE_REF = "rkzwubwogtezqbuhieuo";

export type PrivacyPreflightMode = "disabled" | "scheduled";

export interface PrivacyPreflightOptions {
  expectedProjectRef: string;
  expectedMode: PrivacyPreflightMode;
}

export interface PrivacyTablePrivilegeRow {
  tableName: string;
  exists: boolean;
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface PrivacyPreflightDatabaseState {
  currentUser: string;
  appliedMigrations: string[];
  tables: PrivacyTablePrivilegeRow[];
}

const EXPECTED_PRIVILEGES: Record<string, Omit<PrivacyTablePrivilegeRow, "tableName" | "exists">> = {
  schema_migrations: { canSelect: true, canInsert: false, canUpdate: false, canDelete: false },
  workspace_privacy_policies: { canSelect: true, canInsert: true, canUpdate: true, canDelete: true },
  call_privacy_state: { canSelect: true, canInsert: true, canUpdate: true, canDelete: true },
  call_consent_events: { canSelect: true, canInsert: true, canUpdate: false, canDelete: false },
  privacy_purge_lease: { canSelect: true, canInsert: true, canUpdate: true, canDelete: false },
  privacy_purge_runs: { canSelect: true, canInsert: true, canUpdate: true, canDelete: false },
  privacy_erasure_requests: { canSelect: true, canInsert: true, canUpdate: true, canDelete: false },
};

function read(env: EnvironmentSource, name: string): string | undefined {
  const value = env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function privacyPreflightConfigurationProblems(
  env: EnvironmentSource,
  options: PrivacyPreflightOptions
): string[] {
  const problems: string[] = [];

  if (!/^[a-z0-9]{20}$/i.test(options.expectedProjectRef)) {
    problems.push("--expected-project-ref must be a Supabase project reference");
  } else if (options.expectedProjectRef === PRODUCTION_SUPABASE_REF) {
    problems.push("the production Supabase project cannot be used for privacy staging preflight");
  }

  if (options.expectedMode !== "disabled" && options.expectedMode !== "scheduled") {
    problems.push("--expected-mode must be disabled or scheduled");
  }

  const databaseUrl = read(env, "DATABASE_URL");
  if (!databaseUrl) {
    problems.push("DATABASE_URL is required");
  } else {
    try {
      const url = new URL(databaseUrl);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) {
        problems.push("DATABASE_URL must be a Postgres connection string");
      }
      if (decodeURIComponent(url.username).split(".")[0] !== "app_runtime") {
        problems.push("DATABASE_URL must authenticate as app_runtime");
      }
    } catch {
      problems.push("DATABASE_URL is not a valid connection URL");
    }
    if (databaseProjectRef(databaseUrl) !== options.expectedProjectRef) {
      problems.push("DATABASE_URL does not use --expected-project-ref");
    }
  }

  const configuredMode = read(env, "PRIVACY_PURGE_MODE") ?? "disabled";
  if (configuredMode !== options.expectedMode) {
    problems.push(`PRIVACY_PURGE_MODE must match --expected-mode (${options.expectedMode})`);
  }

  if (options.expectedMode === "scheduled") {
    const cronSecret = read(env, "CRON_SECRET");
    if (!cronSecret || cronSecret.length < 32) {
      problems.push("scheduled mode requires CRON_SECRET with at least 32 characters");
    }
    const otherSecrets = [
      read(env, "AUTH_SECRET"),
      read(env, "AUTH_GOOGLE_SECRET"),
      read(env, "CREDENTIAL_ENCRYPTION_KEY"),
      read(env, "N8N_REQUEST_SIGNING_SECRET"),
      read(env, "N8N_WEBHOOK_SIGNING_SECRET"),
      read(env, "GOOGLE_CALENDAR_CLIENT_SECRET"),
      read(env, "TWILIO_AUTH_TOKEN"),
      read(env, "VAPI_API_KEY"),
      read(env, "VAPI_WEBHOOK_BEARER_TOKEN"),
      read(env, "AI_GATEWAY_API_KEY"),
    ].filter((value): value is string => Boolean(value));
    if (cronSecret && otherSecrets.includes(cronSecret)) {
      problems.push("CRON_SECRET must be dedicated and different from authentication/provider secrets");
    }
  }

  const vercelEnvironment = read(env, "VERCEL_ENV");
  if (vercelEnvironment && vercelEnvironment !== "preview") {
    problems.push("privacy staging preflight requires VERCEL_ENV=preview");
  }
  const branch = read(env, "VERCEL_GIT_COMMIT_REF");
  if (branch && branch !== "staging") {
    problems.push("privacy staging preflight requires the staging Git branch");
  }

  return [...new Set(problems)];
}

export function privacyPreflightDatabaseProblems(state: PrivacyPreflightDatabaseState): string[] {
  const problems: string[] = [];
  if (state.currentUser !== "app_runtime") {
    problems.push("database session is not using app_runtime");
  }

  for (const migration of PRIVACY_MIGRATIONS) {
    if (!state.appliedMigrations.includes(migration)) {
      problems.push(`missing applied privacy migration ${migration}`);
    }
  }

  const rows = new Map(state.tables.map((row) => [row.tableName, row]));
  for (const [tableName, expected] of Object.entries(EXPECTED_PRIVILEGES)) {
    const row = rows.get(tableName);
    if (!row?.exists) {
      problems.push(`missing app.${tableName}`);
      continue;
    }
    for (const privilege of ["canSelect", "canInsert", "canUpdate", "canDelete"] as const) {
      if (row[privilege] !== expected[privilege]) {
        const label = privilege.slice(3).toLowerCase();
        problems.push(`app_runtime ${label} privilege is incorrect for app.${tableName}`);
      }
    }
  }

  return problems;
}

export const PRIVACY_PREFLIGHT_TABLES = Object.freeze(Object.keys(EXPECTED_PRIVILEGES));

export async function inspectPrivacyPreflightDatabase(sql: Sql): Promise<PrivacyPreflightDatabaseState> {
  return sql.begin(async (transaction) => {
    await transaction`set transaction read only`;
    const [identity] = await transaction<{ currentUser: string }[]>`
      select current_user as "currentUser"`;
    const migrationRows = await transaction<{ name: string }[]>`
      select name
      from schema_migrations
      where name in ${transaction([...PRIVACY_MIGRATIONS])}`;
    const tableRows = await transaction<PrivacyTablePrivilegeRow[]>`
      select
        name as "tableName",
        to_regclass(format('%I.%I', current_schema(), name)) is not null as "exists",
        coalesce(has_table_privilege(current_user, to_regclass(format('%I.%I', current_schema(), name)), 'SELECT'), false) as "canSelect",
        coalesce(has_table_privilege(current_user, to_regclass(format('%I.%I', current_schema(), name)), 'INSERT'), false) as "canInsert",
        coalesce(has_table_privilege(current_user, to_regclass(format('%I.%I', current_schema(), name)), 'UPDATE'), false) as "canUpdate",
        coalesce(has_table_privilege(current_user, to_regclass(format('%I.%I', current_schema(), name)), 'DELETE'), false) as "canDelete"
      from unnest(${transaction.array([...PRIVACY_PREFLIGHT_TABLES])}) as inspected(name)
      order by name`;

    return {
      currentUser: identity?.currentUser ?? "unknown",
      appliedMigrations: migrationRows.map((row) => row.name),
      tables: tableRows,
    };
  });
}
