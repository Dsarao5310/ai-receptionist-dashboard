import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { argument, validateRecoveryTarget } from "./recovery-verification-cli";

const SCHEMA = "app";
const REQUIRED_TABLES = ["audit_events", "provider_secrets", "workspace_memberships", "workspaces"] as const;

function loadEnv(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function sourceMigrations() {
  const directory = join(process.cwd(), "supabase", "migrations");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      checksum: createHash("sha256").update(readFileSync(join(directory, name), "utf8")).digest("hex").slice(0, 16),
    }));
}

async function main(): Promise<void> {
loadEnv(join(process.cwd(), ".env.local"));

const expectedProjectRef = argument(process.argv.slice(2), "--expected-project-ref").toLowerCase();
const confirmation = argument(process.argv.slice(2), "--confirm");
const runtimeUrl = process.env.RECOVERY_DATABASE_URL ?? "";
const migrationUrl = process.env.RECOVERY_MIGRATION_DATABASE_URL ?? "";
const problems = validateRecoveryTarget({ expectedProjectRef, confirmation, runtimeUrl, migrationUrl });

if (problems.length > 0) {
  console.error("Recovery verification blocked:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
  return;
}

const connect = (url: string) => postgres(url, {
  ssl: "require",
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { search_path: SCHEMA },
  onnotice: () => {},
});

const runtime = connect(runtimeUrl);
const migrator = connect(migrationUrl);

try {
  const migrations = sourceMigrations();
  const schemaEvidence = await migrator.begin(async (tx) => {
    await tx`set transaction read only`;
    const ledger = await tx<{ name: string; checksum: string }[]>`
      select name, checksum from ${tx(SCHEMA)}.schema_migrations order by name
    `;
    const tables = await tx<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = ${SCHEMA} and table_type = 'BASE TABLE'
      order by table_name
    `;
    const [constraints] = await tx<{ composite_tenant_foreign_keys: number }[]>`
      select count(*)::int as composite_tenant_foreign_keys
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = ${SCHEMA} and c.contype = 'f' and cardinality(c.conkey) >= 2
    `;
    const [identity] = await tx<{ current_user: string; owns_schema: boolean }[]>`
      select current_user, pg_get_userbyid(nspowner) = current_user as owns_schema
      from pg_namespace where nspname = ${SCHEMA}
    `;
    return { ledger, tables, constraints, identity };
  });

  const runtimeEvidence = await runtime.begin(async (tx) => {
    await tx`set transaction read only`;
    const [privileges] = await tx<{
      current_user: string;
      schema_usage: boolean;
      schema_create: boolean;
      audit_update: boolean;
      audit_delete: boolean;
      provider_secret_select: boolean;
    }[]>`
      select
        current_user,
        has_schema_privilege(current_user, ${SCHEMA}, 'usage') as schema_usage,
        has_schema_privilege(current_user, ${SCHEMA}, 'create') as schema_create,
        has_table_privilege(current_user, ${`${SCHEMA}.audit_events`}, 'update') as audit_update,
        has_table_privilege(current_user, ${`${SCHEMA}.audit_events`}, 'delete') as audit_delete,
        has_table_privilege(current_user, ${`${SCHEMA}.provider_secrets`}, 'select') as provider_secret_select
    `;
    const [counts] = await tx<{ workspaces: number; memberships: number; provider_secrets: number }[]>`
      select
        (select count(*)::int from ${tx(SCHEMA)}.workspaces) as workspaces,
        (select count(*)::int from ${tx(SCHEMA)}.workspace_memberships) as memberships,
        (select count(*)::int from ${tx(SCHEMA)}.provider_secrets) as provider_secrets
    `;
    return { privileges, counts };
  });

  const applied = new Map(schemaEvidence.ledger.map((row) => [row.name, row.checksum]));
  const missingMigrations = migrations.filter((migration) => !applied.has(migration.name)).map((migration) => migration.name);
  const checksumDrift = migrations
    .filter((migration) => applied.has(migration.name) && applied.get(migration.name) !== migration.checksum)
    .map((migration) => migration.name);
  const tableNames = new Set(schemaEvidence.tables.map((table) => table.table_name));
  const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.has(table));
  const invariantProblems = [
    ...(missingMigrations.length > 0 ? ["migration ledger is incomplete"] : []),
    ...(checksumDrift.length > 0 ? ["migration checksum drift detected"] : []),
    ...(missingTables.length > 0 ? ["required tables are missing"] : []),
    ...(!schemaEvidence.identity?.owns_schema ? ["app_migrator does not own the app schema"] : []),
    ...(runtimeEvidence.privileges?.current_user !== "app_runtime" ? ["runtime connection is not app_runtime"] : []),
    ...(!runtimeEvidence.privileges?.schema_usage ? ["app_runtime lacks schema usage"] : []),
    ...(runtimeEvidence.privileges?.schema_create ? ["app_runtime can create schema objects"] : []),
    ...(runtimeEvidence.privileges?.audit_update || runtimeEvidence.privileges?.audit_delete
      ? ["app_runtime can rewrite the audit trail"]
      : []),
    ...(!runtimeEvidence.privileges?.provider_secret_select ? ["app_runtime cannot read encrypted provider secret rows"] : []),
    ...((schemaEvidence.constraints?.composite_tenant_foreign_keys ?? 0) < 1
      ? ["no composite tenant foreign keys were found"]
      : []),
  ];

  console.log(JSON.stringify({
    status: invariantProblems.length === 0 ? "verified" : "failed",
    projectRef: expectedProjectRef,
    schema: SCHEMA,
    migrations: {
      source: migrations.length,
      applied: schemaEvidence.ledger.length,
      missing: missingMigrations.length,
      checksumDrift: checksumDrift.length,
    },
    schemaObjects: {
      tables: schemaEvidence.tables.length,
      missingRequired: missingTables.length,
      compositeTenantForeignKeys: schemaEvidence.constraints?.composite_tenant_foreign_keys ?? 0,
    },
    roles: {
      migratorOwnsSchema: schemaEvidence.identity?.owns_schema ?? false,
      runtimeSchemaUsage: runtimeEvidence.privileges?.schema_usage ?? false,
      runtimeSchemaCreate: runtimeEvidence.privileges?.schema_create ?? false,
      runtimeAuditRewrite: Boolean(runtimeEvidence.privileges?.audit_update || runtimeEvidence.privileges?.audit_delete),
      runtimeEncryptedProviderSecretSelect: runtimeEvidence.privileges?.provider_secret_select ?? false,
    },
    restoredRows: runtimeEvidence.counts,
    problems: invariantProblems,
  }, null, 2));

  if (invariantProblems.length > 0) process.exitCode = 1;
} catch {
  console.error("Recovery verification failed with a sanitized database error.");
  process.exitCode = 1;
} finally {
  await Promise.all([runtime.end({ timeout: 5 }), migrator.end({ timeout: 5 })]);
}
}

void main().catch(() => {
  console.error("Recovery verification failed before completion.");
  process.exitCode = 1;
});
