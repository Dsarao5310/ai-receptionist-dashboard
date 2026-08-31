import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { argument } from "./recovery-verification-cli";
import { localRehearsalTarget, validateLocalRehearsal } from "./recovery-rehearsal-cli";

const REQUIRED_TABLES = ["audit_events", "provider_secrets", "workspace_memberships", "workspaces"] as const;

function sourceMigrations() {
  const directory = join(process.cwd(), "supabase", "migrations");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const body = readFileSync(join(directory, name), "utf8");
      return {
        name,
        body,
        checksum: createHash("sha256").update(body).digest("hex").slice(0, 16),
      };
    });
}

async function main(): Promise<void> {
  // Deliberately do not load .env.local: this command accepts only its dedicated
  // loopback URL and must never inherit the application's hosted database URLs.
  const connection = process.env.RECOVERY_REHEARSAL_DATABASE_URL ?? "";
  const confirmation = argument(process.argv.slice(2), "--confirm");
  const problems = validateLocalRehearsal({ connection, confirmation, nodeEnv: process.env.NODE_ENV });

  if (problems.length > 0) {
    console.error("Local recovery rehearsal blocked:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const target = localRehearsalTarget(connection);
  const schema = `recovery_rehearsal_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const sql = postgres(connection, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    connection: { search_path: schema },
    onnotice: () => {},
  });

  let created = false;
  try {
    await sql`create schema ${sql(schema)}`;
    created = true;
    await sql`
      create table ${sql(schema)}.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const migrations = sourceMigrations();
    for (const migration of migrations) {
      await sql.begin(async (tx) => {
        await tx.unsafe(migration.body).simple();
        await tx`
          insert into ${tx(schema)}.schema_migrations ${tx({
            name: migration.name,
            checksum: migration.checksum,
          })}
        `;
      });
    }

    const ledger = await sql<{ name: string; checksum: string }[]>`
      select name, checksum from ${sql(schema)}.schema_migrations order by name
    `;
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = ${schema} and table_type = 'BASE TABLE'
      order by table_name
    `;
    const [constraints] = await sql<{ composite_tenant_foreign_keys: number }[]>`
      select count(*)::int as composite_tenant_foreign_keys
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = ${schema} and c.contype = 'f' and cardinality(c.conkey) >= 2
    `;

    const expected = new Map(migrations.map((migration) => [migration.name, migration.checksum]));
    const replayed = new Map(ledger.map((migration) => [migration.name, migration.checksum]));
    const missingMigrations = migrations.filter((migration) => !replayed.has(migration.name));
    const checksumDrift = migrations.filter((migration) => replayed.get(migration.name) !== migration.checksum);
    const unexpectedMigrations = ledger.filter((migration) => !expected.has(migration.name));
    const tableNames = new Set(tables.map((table) => table.table_name));
    const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.has(table));
    const invariantProblems = [
      ...(missingMigrations.length > 0 ? ["migration replay is incomplete"] : []),
      ...(checksumDrift.length > 0 ? ["migration replay checksum drift detected"] : []),
      ...(unexpectedMigrations.length > 0 ? ["unexpected migration ledger rows detected"] : []),
      ...(missingTables.length > 0 ? ["required tables are missing"] : []),
      ...((constraints?.composite_tenant_foreign_keys ?? 0) < 1
        ? ["no composite tenant foreign keys were found"]
        : []),
    ];

    console.log(JSON.stringify({
      status: invariantProblems.length === 0 ? "rehearsed" : "failed",
      target: "loopback",
      database: target.database,
      migrations: {
        source: migrations.length,
        replayed: ledger.length,
        missing: missingMigrations.length,
        checksumDrift: checksumDrift.length,
        unexpected: unexpectedMigrations.length,
      },
      schemaObjects: {
        tables: tables.length,
        missingRequired: missingTables.length,
        compositeTenantForeignKeys: constraints?.composite_tenant_foreign_keys ?? 0,
      },
      problems: invariantProblems,
    }, null, 2));

    if (invariantProblems.length > 0) process.exitCode = 1;
  } catch {
    console.error("Local recovery rehearsal failed with a sanitized database error.");
    process.exitCode = 1;
  } finally {
    try {
      if (created) await sql`drop schema ${sql(schema)} cascade`;
    } catch {
      console.error("Local recovery rehearsal cleanup failed; inspect the generated recovery_rehearsal schema locally.");
      process.exitCode = 1;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

void main().catch(() => {
  console.error("Local recovery rehearsal failed before completion.");
  process.exitCode = 1;
});
