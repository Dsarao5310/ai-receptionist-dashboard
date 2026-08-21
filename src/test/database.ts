import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";

/**
 * The database test harness.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Tests never touch application data. They run against a separate Postgres
 * schema — `app_test` — built from the same migration files in
 * `supabase/migrations` and seeded with the same fixtures. Because the
 * migrations are written unqualified and the connection sets `search_path`, the
 * schema under test is byte-for-byte the schema the application uses; there is
 * no second definition to drift.
 *
 * A dedicated schema rather than a dedicated database because Supabase projects
 * are one database, and rather than transactional rollback because the code
 * under test opens its own transactions — wrapping those in an outer one would
 * change the behaviour being tested.
 *
 * ── Determinism ─────────────────────────────────────────────────────────────
 * The schema is rebuilt and reseeded once per run from a fixed clock, and the
 * seed uses the same seeded generator the product does. Security tests have to
 * be deterministic to be worth anything: an isolation test that passes because
 * of the time of day is not a test.
 *
 * ── Credentials ─────────────────────────────────────────────────────────────
 * Building the schema uses MIGRATION_DATABASE_URL, because it is DDL. Reads and
 * writes in tests use DATABASE_URL — the same least-privileged role the
 * application runs as. That matters: a test passing under a more powerful
 * credential than production uses would prove nothing about production.
 */

const TEST_SCHEMA = process.env.DB_SCHEMA ?? "app_test";

/**
 * Make the application's own client agree with the harness.
 *
 * `db/client.ts` resolves its search path from `DB_SCHEMA`, falling back to
 * `app` — the live schema. Tests that pass an explicit connection are fine
 * either way, but any code under test that reaches `getDb()` internally (the
 * orchestration service and the ingestion pipeline both do) would otherwise
 * read and write *application data* while the harness believed it was isolated.
 *
 * Setting it here rather than in each test file means the isolation cannot be
 * forgotten by a future test, which is the only way this stays true.
 */
process.env.DB_SCHEMA = TEST_SCHEMA;

/** Test runs get their own env loading; Next's is not involved. */
export function loadTestEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadTestEnv();

export const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.MIGRATION_DATABASE_URL);

function connect(url: string): Sql {
  return postgres(url, {
    ssl: "require",
    max: 2,
    prepare: false,
    connect_timeout: 20,
    connection: { search_path: TEST_SCHEMA },
    types: {
      date: { to: 1082, from: [1082, 1083], serialize: (x: string) => x, parse: (x: string) => x },
    },
    onnotice: () => {},
  }) as unknown as Sql;
}

/** The application-privileged connection tests should use. */
export function testDb(): Sql {
  return connect(process.env.DATABASE_URL!);
}

/**
 * A DDL connection, for the rare test that needs to change the schema.
 *
 * `app_runtime` cannot create objects — that is the point of it — so a test
 * that installs a trigger to force a write failure has to ask for the migrator
 * explicitly. Making that a separate, named function keeps the distinction
 * visible: a test using this one is doing something a request never could.
 */
export function testMigratorDb(): Sql {
  return connect(process.env.MIGRATION_DATABASE_URL!);
}

/**
 * Rebuild the test schema from the migration files and seed it.
 *
 * Dropping first means a test run cannot inherit state from the previous one —
 * including a previous run that failed halfway through.
 */
export async function resetTestDatabase(now = new Date("2026-08-17T20:00:00.000Z")): Promise<void> {
  const migrator = connect(process.env.MIGRATION_DATABASE_URL!);
  try {
    // The ledger is created by the runner rather than by a migration, so the
    // harness has to create it too — the grants migration revokes on it.
    await migrator.unsafe(`
      drop schema if exists ${TEST_SCHEMA} cascade;
      create schema ${TEST_SCHEMA};
      create table ${TEST_SCHEMA}.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      );
    `).simple();

    const dir = join(process.cwd(), "supabase", "migrations");
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await migrator.unsafe(readFileSync(join(dir, name), "utf8")).simple();
    }
  } finally {
    await migrator.end({ timeout: 5 });
  }

  // Seeding needs to clear the append-only audit table, which the application
  // role deliberately cannot do — the same reason `npm run db:seed` uses the
  // migrator credential.
  const seeder = connect(process.env.MIGRATION_DATABASE_URL!);
  try {
    await seedDatabase(seeder, now);
  } finally {
    await seeder.end({ timeout: 5 });
  }
}
