import { readFileSync } from "node:fs";
import postgres from "postgres";

const LOCK_KEY_1 = 1_095_324_228; // ASCII "AIRD"
const LOCK_KEY_2 = 1_413_829_460; // ASCII "TEST"
const LOCK_TIMEOUT_MS = 5 * 60 * 1_000;
const RETRY_INTERVAL_MS = 1_000;

function loadTestEnv(): void {
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Own the shared disposable database schema for the whole Vitest process.
 *
 * `fileParallelism: false` prevents this process from racing itself, while the
 * session advisory lock prevents another terminal or agent from rebuilding
 * `app_test` mid-suite. The migrator uses a session-capable connection, and a
 * one-connection client ensures acquisition and release use the same session.
 */
export default async function acquireTestDatabaseLock(): Promise<(() => Promise<void>) | undefined> {
  loadTestEnv();

  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationUrl) return undefined;

  const sql = postgres(migrationUrl, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 20,
    onnotice: () => {},
  });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  try {
    while (true) {
      const [result] = await sql<{ acquired: boolean }[]>`
        select pg_try_advisory_lock(${LOCK_KEY_1}, ${LOCK_KEY_2}) as acquired
      `;
      if (result.acquired) break;

      if (Date.now() >= deadline) {
        throw new Error(
          "Timed out waiting for exclusive ownership of the shared app_test schema. " +
            "Let the other Vitest process finish, then retry.",
        );
      }
      await delay(RETRY_INTERVAL_MS);
    }
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }

  return async () => {
    try {
      await sql`
        select pg_advisory_unlock(${LOCK_KEY_1}, ${LOCK_KEY_2})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}
