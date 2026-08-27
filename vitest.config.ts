import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every database-backed file rebuilds the same disposable app_test schema.
    // File-level serialization protects one Vitest process; the global setup
    // holds a Postgres advisory lock so a second process cannot drop the schema
    // while the first process is still using it.
    globalSetup: ["./src/test/database-lock.ts"],
    // Pin the runner's clock to a zone that is NOT the business timezone used in
    // tests. Timezone bugs are invisible when the two happen to match, which is
    // exactly the situation that hid them before.
    env: { TZ: "UTC" },
    /**
     * Test files run one at a time.
     *
     * More than one suite is database-backed, and they share a single isolated
     * schema that each rebuilds from the migration files before it starts. Run
     * in parallel, one suite would drop the schema out from under another and
     * the failures would be intermittent and nonsensical.
     *
     * The alternative — a schema per file — buys parallelism the suite does not
     * need: the pure tests take milliseconds, and the database ones are
     * dominated by a rebuild that would happen either way.
     */
    fileParallelism: false,
    /**
     * The database-backed suites talk to a hosted Postgres over a connection
     * pooler, and a single test may make a dozen round trips. The 5s default is
     * a limit on network latency rather than on anything the code does, and a
     * suite that fails because a link was slow teaches nobody anything.
     */
    testTimeout: 30_000,
    // Keep next-auth inside Vite's transform pipeline so the exact
    // `next/server` alias below also applies to its ESM imports. Externalizing
    // it hands the extensionless subpath to Node, which refuses to append .js.
    server: { deps: { inline: ["next-auth"] } },
  },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // next-auth imports this extensionless subpath. Node's ESM resolver does
      // not append `.js` for an unexported package subpath, even though Next
      // ships server.js. Next's runtime resolves it; Vitest needs the exact
      // test-only mapping so integration suites can load the Auth.js boundary.
      { find: /^next\/server$/, replacement: fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)) },
    ],
  },
});
