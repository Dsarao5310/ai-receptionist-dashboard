#!/usr/bin/env node
import * as nextEnv from "@next/env";
import postgres from "postgres";
import {
  n8nCallbackUrl,
  n8nConfigurationProblems,
  n8nMappingProblems,
  type N8nMappingRow,
} from "../src/server/n8n-preflight";

nextEnv.loadEnvConfig(process.cwd());

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

async function main(): Promise<void> {
  const options = {
    workspaceId: argument("--workspace"),
    expectedOrigin: argument("--expected-origin"),
    expectedProjectRef: argument("--expected-project-ref"),
  };

  const configurationProblems = n8nConfigurationProblems(process.env, options);
  let mappingProblems: string[] = [];
  let mappings: N8nMappingRow[] = [];

  if (configurationProblems.length === 0) {
    const sql = postgres(process.env.DATABASE_URL!, {
      ssl: "require",
      max: 1,
      prepare: false,
      connect_timeout: 15,
      connection: { search_path: "app" },
    });
    try {
      mappings = await sql<N8nMappingRow[]>`
        select operation, capability, environment, status
        from workflow_mappings
        where workspace_id = ${options.workspaceId}
        order by capability, operation nulls first`;
      mappingProblems = n8nMappingProblems(mappings);
    } catch (error) {
      mappingProblems = [
        `workflow mapping check failed (${error instanceof Error ? error.constructor.name : "unknown error"})`,
      ];
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  const problems = [...configurationProblems, ...mappingProblems];
  let callback = "unavailable until --expected-origin is valid";
  try {
    if (options.expectedOrigin) callback = n8nCallbackUrl(options.expectedOrigin);
  } catch {
    // The validation result below owns the safe error message.
  }
  console.log("\nn8n staging live-certification preflight\n");
  console.log(`  workspace             ${options.workspaceId || "missing"}`);
  console.log(`  configuration         ${configurationProblems.length === 0 ? "ok" : "blocked"}`);
  console.log(`  workflow mappings     ${configurationProblems.length === 0 ? `${mappings.length} inspected` : "not queried"}`);
  console.log(`  inbound callback      ${callback}`);
  console.log("  provider calls        none\n");

  if (problems.length > 0) {
    console.error("Preflight blocked:");
    for (const problem of problems) console.error(`- ${problem}`);
    console.error("\nNo secret values were printed and no n8n request was made.\n");
    process.exitCode = 1;
  } else {
    console.log("Ready for the ordered live-certification runbook. Secret values were not printed.\n");
    console.log("Note: outbound appointment.book remains automated-only until it has a trusted product call site.\n");
  }
}

main().catch((error: unknown) => {
  console.error(`Preflight failed safely (${error instanceof Error ? error.constructor.name : "unknown error"}).`);
  console.error("No secret values were printed and no n8n request was made.\n");
  process.exitCode = 1;
});
