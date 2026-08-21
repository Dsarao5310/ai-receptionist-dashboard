import { productionConfigurationProblems } from "../src/server/production-config";

const problems = productionConfigurationProblems(process.env);

if (problems.length > 0) {
  console.error("Production configuration is not deployable:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log("Production configuration passed (secrets were not printed).");
}
