#!/usr/bin/env node
import * as nextEnv from "@next/env";
import postgres from "postgres";
import {
  PRIVACY_MIGRATIONS,
  inspectPrivacyPreflightDatabase,
  privacyPreflightConfigurationProblems,
  privacyPreflightDatabaseProblems,
  type PrivacyPreflightDatabaseState,
  type PrivacyPreflightMode,
} from "../src/server/privacy-preflight";
import type { Sql } from "../src/server/db/client";

nextEnv.loadEnvConfig(process.cwd());

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

async function inspectDatabase(databaseUrl: string): Promise<PrivacyPreflightDatabaseState> {
  const sql = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 15,
    connection: { search_path: "app" },
  });

  try {
    return await inspectPrivacyPreflightDatabase(sql as unknown as Sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const expectedMode = argument("--expected-mode") as PrivacyPreflightMode;
  const options = {
    expectedProjectRef: argument("--expected-project-ref"),
    expectedMode,
  };
  const configurationProblems = privacyPreflightConfigurationProblems(process.env, options);
  let databaseState: PrivacyPreflightDatabaseState | null = null;
  let databaseProblems: string[] = [];

  if (configurationProblems.length === 0) {
    try {
      databaseState = await inspectDatabase(process.env.DATABASE_URL!);
      databaseProblems = privacyPreflightDatabaseProblems(databaseState);
    } catch (error) {
      databaseProblems = [
        `read-only database inspection failed (${error instanceof Error ? error.constructor.name : "unknown error"})`,
      ];
    }
  }

  const problems = [...configurationProblems, ...databaseProblems];
  console.log("\nPrivacy staging preflight\n");
  console.log(`  expected mode          ${expectedMode || "missing"}`);
  console.log(`  configuration         ${configurationProblems.length === 0 ? "ok" : "blocked"}`);
  console.log(`  database inspection   ${databaseState ? "read-only complete" : "not queried"}`);
  console.log(`  privacy migrations    ${databaseState ? `${databaseState.appliedMigrations.length}/${PRIVACY_MIGRATIONS.length}` : "not queried"}`);
  console.log(`  schema/grants         ${databaseState ? `${databaseState.tables.length} tables inspected` : "not queried"}`);
  console.log("  data mutations        none");
  console.log("  provider calls        none\n");

  if (problems.length > 0) {
    console.error("Preflight blocked:");
    for (const problem of problems) console.error(`- ${problem}`);
    console.error("\nNo secret values were printed and no database mutation was attempted.\n");
    process.exitCode = 1;
    return;
  }

  console.log("Privacy prerequisites match the requested staging mode. Secret values were not printed.\n");
  if (expectedMode === "disabled") {
    console.log("Next gate: deploy disabled and confirm the cron route returns 204 without creating a run row.\n");
  } else {
    console.log("Next gate: execute the controlled scheduler certification runbook with an assigned operator.\n");
  }
}

main().catch((error: unknown) => {
  console.error(`Preflight failed safely (${error instanceof Error ? error.constructor.name : "unknown error"}).`);
  console.error("No secret values were printed and no database mutation was attempted.\n");
  process.exitCode = 1;
});
