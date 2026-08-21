import "server-only";

import postgres from "postgres";
import { assertProductionConfiguration, serverEnv } from "@/server/env";

/**
 * The one database connection.
 *
 * ── One access path, deliberately ───────────────────────────────────────────
 * Every query in the application goes through this client. There is no ORM, no
 * second driver, and no Supabase JS client: `@supabase/supabase-js` speaks to
 * PostgREST using an API key, and the useful key for server work is the
 * service-role key — which bypasses every row-level policy. Reaching for it
 * would mean the most powerful credential in the project became the default
 * data path. A plain Postgres connection under a least-privilege role is both
 * simpler and safer, so that is what this is.
 *
 * ── Pooling ─────────────────────────────────────────────────────────────────
 * `DATABASE_URL` points at Supabase's transaction pooler. Serverless and
 * per-request environments open far more connections than Postgres will accept
 * directly, and the pooler is what makes that survivable. Transaction mode does
 * not support server-side prepared statements, hence `prepare: false`.
 *
 * `max` is small on purpose: each Next.js server instance keeps its own pool,
 * and the pooler is what actually multiplexes them.
 */

/**
 * The driver's type parameter records the custom parsers below, so `Sql` and
 * `Tx` stay assignable to each other and to what `sql.begin` hands a callback.
 */
type CustomTypes = { date: string };

export type Sql = postgres.Sql<CustomTypes>;
export type Tx = postgres.TransactionSql<CustomTypes>;

export interface DbOptions {
  /** Overridden by the test harness so tests never touch application data. */
  searchPath?: string;
  max?: number;
}

export function createDb(url: string, { searchPath = "app", max = 5 }: DbOptions = {}): Sql {
  return postgres(url, {
    ssl: "require",
    max,
    idle_timeout: 20,
    connect_timeout: 15,
    // Required by the transaction pooler; it hands out a different backend per
    // transaction, so a prepared statement from an earlier one would not exist.
    prepare: false,
    connection: { search_path: searchPath },
    types: {
      // `timestamptz` keeps its default parsing: it is an absolute instant, and
      // a JS Date is the right representation of one.
      //
      // `date` and `time` do not. They are wall-clock values in the *business's*
      // timezone — "the 18th at 10:00, wherever this business is" — and parsing
      // them into a Date would silently attach the server's zone to a value
      // that has none. Everything the timezone layer does to keep business time
      // and server time apart would be undone at the driver. So they come back
      // as the strings the domain already speaks.
      date: { to: 1082, from: [1082, 1083], serialize: (x: string) => x, parse: (x: string) => x },
    },
    transform: { undefined: null },
  });
}

/**
 * Held on `globalThis` so Next's dev server does not open a new pool on every
 * hot reload and exhaust the pooler's connection limit within a few edits.
 *
 * Resolved lazily rather than at module scope: importing a repository must not
 * require a database to be configured. Unit tests that exercise pure policy
 * import the same modules and never issue a query, and they should not have to
 * provide a connection string to do it. postgres.js opens sockets on first use
 * anyway, so nothing is lost by waiting.
 */
const globalForDb = globalThis as unknown as { __appDb?: Sql };

export function getDb(): Sql {
  if (globalForDb.__appDb) return globalForDb.__appDb;
  assertProductionConfiguration();
  globalForDb.__appDb = createDb(serverEnv.databaseUrl, {
    // The test harness points every query at an isolated schema so a test run
    // can never read or write application data.
    searchPath: process.env.DB_SCHEMA ?? "app",
  });
  return globalForDb.__appDb;
}

/**
 * Can we reach the database at all?
 *
 * Used before telling someone their session has ended. Auth.js catches errors
 * inside its own JWT callback and simply reports "no session", so an outage and
 * a signed-out visitor arrive at the layout looking identical. They are not the
 * same thing and must not get the same page: one person needs to sign in, the
 * other needs to be told the problem is ours and their session is fine.
 *
 * It touches a real table rather than running `select 1`. A socket that opens
 * proves very little: an unmigrated database, a wrong search_path or a revoked
 * grant all answer `select 1` perfectly happily and then fail on everything the
 * application actually needs. The question being asked is "can I read my own
 * data", so that is the question the query asks.
 *
 * One indexed lookup, and only on the path that was about to render sign-in, so
 * it costs nothing in the normal case.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await getDb()`select 1 from users limit 1`;
    return true;
  } catch {
    return false;
  }
}
