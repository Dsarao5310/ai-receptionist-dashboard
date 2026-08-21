/**
 * Development seed runner.
 *
 *   npm run db:seed
 *
 * Connects with MIGRATION_DATABASE_URL, not the application's credential — and
 * the reason is a good demonstration that the privilege split is real rather
 * than decorative. Reseeding starts from empty, which means deleting audit
 * events; the runtime role holds INSERT and SELECT on that table and nothing
 * else, so it is refused. Seeding is an administrative act, like migrating, and
 * uses the administrative credential.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { seedDatabase } from "../src/server/db/seed";
import type { Sql } from "../src/server/db/client";

function loadEnv(path: string) {
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

loadEnv(".env.local");

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const sql = postgres(url, {
  ssl: "require",
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { search_path: process.env.DB_SCHEMA ?? "app" },
  types: {
    date: { to: 1082, from: [1082, 1083], serialize: (x: string) => x, parse: (x: string) => x },
  },
  onnotice: () => {},
});

// Wrapped rather than top-level await: this file is compiled as CommonJS,
// which has no top-level await.
async function main() {
  try {
    console.log(`Seeding ${process.env.DB_SCHEMA ?? "app"} ...`);
    await seedDatabase(sql as unknown as Sql);

    const [{ count: workspaces }] = await sql`select count(*)::int as count from workspaces`;
    const [{ count: appointments }] = await sql`select count(*)::int as count from appointments`;
    const [{ count: conversations }] = await sql`select count(*)::int as count from conversations`;
    const [{ count: customers }] = await sql`select count(*)::int as count from customers`;
    console.log(
      `Seeded ${workspaces} workspaces, ${customers} customers, ${conversations} conversations, ${appointments} appointments.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }

}

void main();
