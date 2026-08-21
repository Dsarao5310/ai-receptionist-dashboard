/**
 * Migration runner.
 *
 * Applies every file in supabase/migrations in filename order, once, inside a
 * transaction, recording what it applied in app.schema_migrations. The schema is
 * therefore reproducible from source control: an empty database plus this
 * directory produces exactly the database the application expects.
 *
 * It connects with MIGRATION_DATABASE_URL — the only credential in the project
 * that may run DDL. The application runtime never reads that variable.
 *
 *   node scripts/db.mjs migrate   apply pending migrations
 *   node scripts/db.mjs status    list applied and pending
 *   node scripts/db.mjs reset     drop and recreate schema app, then migrate
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

loadEnv(join(ROOT, ".env.local"));

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const schema = process.env.DB_SCHEMA ?? "app";
const sql = postgres(url, {
  ssl: "require",
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { search_path: schema },
  // "schema already exists, skipping" is expected on a re-run and is not news.
  onnotice: () => {},
});

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return; // Deployed environments supply real environment variables.
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => {
      const body = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
      return { name, body, checksum: createHash("sha256").update(body).digest("hex").slice(0, 16) };
    });
}

async function ensureLedger() {
  await sql.unsafe(`
    create schema if not exists ${schema};
    create table if not exists ${schema}.schema_migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
  `).simple();
}

async function applied() {
  const rows = await sql`select name, checksum from ${sql(schema)}.schema_migrations order by name`;
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

async function migrate() {
  await ensureLedger();
  const done = await applied();
  let count = 0;

  for (const file of migrationFiles()) {
    const previous = done.get(file.name);
    if (previous) {
      // A migration that changed after being applied means the database and the
      // repository no longer agree; silently ignoring that is how schemas drift.
      if (previous !== file.checksum) {
        throw new Error(
          `${file.name} has changed since it was applied. Migrations are immutable — add a new one instead.`
        );
      }
      continue;
    }

    process.stdout.write(`  applying ${file.name} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(file.body).simple();
      await tx`insert into ${tx(schema)}.schema_migrations ${tx({ name: file.name, checksum: file.checksum })}`;
    });
    console.log("ok");
    count += 1;
  }

  console.log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
}

async function status() {
  await ensureLedger();
  const done = await applied();
  for (const file of migrationFiles()) {
    console.log(`  ${done.has(file.name) ? "applied" : "PENDING"}  ${file.name}`);
  }
}

async function reset() {
  if (process.env.NODE_ENV === "production") throw new Error("reset is refused in production.");
  console.log(`Dropping schema ${schema} ...`);
  await sql.unsafe(`drop schema if exists ${schema} cascade;`).simple();
  await migrate();
}

const command = process.argv[2] ?? "migrate";
const commands = { migrate, status, reset };

try {
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  await commands[command]();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
