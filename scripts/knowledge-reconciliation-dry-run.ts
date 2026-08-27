#!/usr/bin/env node
import * as nextEnv from "@next/env";
import { can } from "../src/lib/permissions";
import { authorizeWorkspace } from "../src/server/auth/policy";
import { getDb } from "../src/server/db/client";
import { identityRepository } from "../src/server/db/identity";
import { runKnowledgeReconciliation } from "../src/server/integrations/knowledge/reconciliation";
import {
  argument,
  connectionMatchesProject,
  positiveLimit,
  resolveActor,
} from "./knowledge-reconciliation-cli";

nextEnv.loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const workspaceId = argument(process.argv, "--workspace");
  const actorEmailEnv = argument(process.argv, "--actor-email-env");
  const actorEmail = argument(process.argv, "--actor-email") || (actorEmailEnv ? process.env[actorEmailEnv]?.trim() ?? "" : "");
  const resolveActiveOwner = process.argv.includes("--resolve-active-owner");
  const expectedProjectRef = argument(process.argv, "--expected-project-ref");
  const limit = positiveLimit(argument(process.argv, "--limit"));
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const schema = process.env.DB_SCHEMA?.trim() || "app";

  const problems: string[] = [];
  if (!workspaceId) problems.push("--workspace is required");
  if (!actorEmail && !resolveActiveOwner) {
    problems.push("--actor-email, a populated --actor-email-env, or --resolve-active-owner is required");
  }
  if (!expectedProjectRef) problems.push("--expected-project-ref is required");
  if (!limit) problems.push("--limit must be an integer from 1 to 100");
  if (schema !== "app") problems.push("DB_SCHEMA must be app or unset");
  if (!databaseUrl || !connectionMatchesProject(databaseUrl, expectedProjectRef)) {
    problems.push("DATABASE_URL does not match the expected Supabase project");
  }

  if (problems.length > 0) {
    console.error("Knowledge reconciliation dry run blocked:");
    for (const problem of problems) console.error(`- ${problem}`);
    console.error("No database mutation or provider call was attempted.");
    process.exitCode = 1;
    return;
  }

  try {
    const user = await resolveActor(identityRepository, workspaceId, actorEmail, resolveActiveOwner);
    if (!user || user.status !== "active") throw new Error("actor_unavailable");

    const context = await authorizeWorkspace(user, workspaceId);
    if (!can(
      { platformRole: context.user.platformRole, workspaceRole: context.workspaceRole },
      "business.edit",
    )) {
      throw new Error("actor_not_authorized");
    }

    const summary = await runKnowledgeReconciliation(context, {
      mode: "dry_run",
      limit: limit!,
    });

    console.log("\nKnowledge reconciliation dry run\n");
    console.log(`  project match          ok`);
    console.log(`  workspace authorized   yes`);
    console.log(`  provider calls         none`);
    console.log(`  limit                  ${summary.limit}`);
    console.log(`  eligible               ${summary.eligible}`);
    console.log(`  pending                ${summary.before.pending}`);
    console.log(`  retryable errors       ${summary.before.error}`);
    console.log(`  sync required          ${summary.before.syncRequired}`);
    console.log(`  synchronized           ${summary.before.synced}`);
    console.log(`  attempted              ${summary.attempted}`);
    console.log(`  preview audit          ${summary.completionAuditRecorded ? "recorded" : "not recorded"}\n`);
  } catch (error) {
    const reason = error instanceof Error &&
      (error.message === "actor_unavailable" || error.message === "actor_not_authorized")
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "unknown_error";
    console.error(`Knowledge reconciliation dry run failed safely (${reason}).`);
    console.error("No provider call was made and no secret values were printed.");
    process.exitCode = 1;
  } finally {
    await getDb().end({ timeout: 5 });
  }
}

void main();
