#!/usr/bin/env node
import * as nextEnv from "@next/env";
import { can } from "../src/lib/permissions";
import { authorizeWorkspace } from "../src/server/auth/policy";
import { getDb } from "../src/server/db/client";
import { identityRepository } from "../src/server/db/identity";
import { credentialStore } from "../src/server/integrations/credential-store";
import {
  readKnowledgeSyncHealth,
  runKnowledgeReconciliation,
} from "../src/server/integrations/knowledge/reconciliation";
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
  const actorEmail = argument(process.argv, "--actor-email") ||
    (actorEmailEnv ? process.env[actorEmailEnv]?.trim() ?? "" : "");
  const resolveActiveOwner = process.argv.includes("--resolve-active-owner");
  const expectedProjectRef = argument(process.argv, "--expected-project-ref");
  const expectedIndexHost = argument(process.argv, "--expected-index-host");
  const confirmation = argument(process.argv, "--confirmation");
  const limit = positiveLimit(argument(process.argv, "--limit"));
  const expectedEligible = positiveLimit(argument(process.argv, "--expected-eligible"));
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const schema = process.env.DB_SCHEMA?.trim() || "app";
  const providerMode = process.env.KNOWLEDGE_PROVIDER_MODE?.trim();
  const indexHost = process.env.PINECONE_INDEX_HOST?.trim();

  const problems: string[] = [];
  if (!workspaceId) problems.push("--workspace is required");
  if (!actorEmail && !resolveActiveOwner) {
    problems.push("--actor-email, a populated --actor-email-env, or --resolve-active-owner is required");
  }
  if (!expectedProjectRef) problems.push("--expected-project-ref is required");
  if (!expectedIndexHost) problems.push("--expected-index-host is required");
  if (!limit) problems.push("--limit must be an integer from 1 to 100");
  if (!expectedEligible) problems.push("--expected-eligible must be an integer from 1 to 100");
  if (limit && expectedEligible && limit !== expectedEligible) {
    problems.push("--limit must exactly equal --expected-eligible");
  }
  if (confirmation !== "RECONCILE KNOWLEDGE") {
    problems.push("--confirmation must exactly equal RECONCILE KNOWLEDGE");
  }
  if (schema !== "app") problems.push("DB_SCHEMA must be app or unset");
  if (!databaseUrl || !connectionMatchesProject(databaseUrl, expectedProjectRef)) {
    problems.push("DATABASE_URL does not match the expected Supabase project");
  }
  if (providerMode !== "live") problems.push("KNOWLEDGE_PROVIDER_MODE must be live");
  if (!credentialStore.isFullyConfigured("pinecone")) {
    problems.push("the Pinecone server credential is not configured");
  }
  if (!indexHost || indexHost !== expectedIndexHost) {
    problems.push("PINECONE_INDEX_HOST does not match the expected staging index");
  }

  if (problems.length > 0) {
    console.error("Knowledge reconciliation execution blocked:");
    for (const problem of problems) console.error(`- ${problem}`);
    console.error("No database or provider mutation was attempted.");
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

    const before = await readKnowledgeSyncHealth(context);
    if (before.syncRequired !== 0) throw new Error("preexisting_sync_required");
    if (before.retryable !== expectedEligible) throw new Error("eligible_count_changed");

    const summary = await runKnowledgeReconciliation(context, {
      mode: "execute",
      limit: limit!,
      confirmation: "RECONCILE KNOWLEDGE",
    });

    console.log("\nKnowledge reconciliation execution\n");
    console.log("  project match          ok");
    console.log("  index match            ok");
    console.log("  workspace authorized   yes");
    console.log(`  eligible               ${summary.eligible}`);
    console.log(`  attempted              ${summary.attempted}`);
    console.log(`  synchronized           ${summary.outcomes.synced}`);
    console.log(`  superseded             ${summary.outcomes.superseded}`);
    console.log(`  local only             ${summary.outcomes.localOnly}`);
    console.log(`  needs attention        ${summary.outcomes.needsAttention}`);
    console.log(`  remaining retryable    ${summary.after.retryable}`);
    console.log(`  sync required          ${summary.after.syncRequired}`);
    console.log(`  completion audit       ${summary.completionAuditRecorded ? "recorded" : "needs attention"}\n`);

    const clean = summary.eligible === expectedEligible &&
      summary.attempted === expectedEligible &&
      summary.outcomes.synced === expectedEligible &&
      summary.outcomes.superseded === 0 &&
      summary.outcomes.localOnly === 0 &&
      summary.outcomes.needsAttention === 0 &&
      summary.after.retryable === 0 &&
      summary.after.syncRequired === 0 &&
      summary.completionAuditRecorded;
    if (!clean) process.exitCode = 2;
  } catch (error) {
    const safeReasons = new Set([
      "actor_unavailable",
      "actor_not_authorized",
      "preexisting_sync_required",
      "eligible_count_changed",
    ]);
    const reason = error instanceof Error && safeReasons.has(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "unknown_error";
    console.error(`Knowledge reconciliation execution failed safely (${reason}).`);
    console.error("No secret values or Knowledge content were printed.");
    process.exitCode = 1;
  } finally {
    await getDb().end({ timeout: 5 });
  }
}

void main();
