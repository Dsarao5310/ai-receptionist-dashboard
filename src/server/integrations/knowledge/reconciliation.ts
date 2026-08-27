import "server-only";

import { z } from "zod";
import type { AuthContext } from "@/server/auth/policy";
import { recordAuditEvent } from "@/server/audit";
import { serverNow } from "@/server/clock";
import { workspaceScope } from "@/server/db/workspace-scope";
import type {
  KnowledgeSyncRepository,
  KnowledgeSyncStatus,
} from "@/server/db/repositories/knowledge-sync";
import { serverEnv, type ProviderMode } from "@/server/env";
import type { AuditAction } from "@/types/identity";
import { KnowledgeProviderError } from "./errors";
import {
  createKnowledgeSyncService,
  type KnowledgeSyncService,
  type KnowledgeWriteResult,
} from "./operations";

const limitSchema = z.number().int().min(1).max(100).default(25);
const reconciliationCommandSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("dry_run"), limit: limitSchema }).strict(),
  z.object({
    mode: z.literal("execute"),
    limit: limitSchema,
    confirmation: z.literal("RECONCILE KNOWLEDGE"),
  }).strict(),
]);

export type KnowledgeReconciliationCommand = z.infer<typeof reconciliationCommandSchema>;
export type KnowledgeSyncHealthState = "healthy" | "backlog" | "needs_attention";

export interface KnowledgeSyncHealth extends KnowledgeSyncStatus {
  state: KnowledgeSyncHealthState;
}

export interface KnowledgeReconciliationSummary {
  mode: KnowledgeReconciliationCommand["mode"];
  limit: number;
  eligible: number;
  attempted: number;
  outcomes: {
    synced: number;
    superseded: number;
    localOnly: number;
    needsAttention: number;
  };
  before: KnowledgeSyncHealth;
  after: KnowledgeSyncHealth;
  completionAuditRecorded: boolean;
  warning?: string;
}

export function parseKnowledgeReconciliationCommand(input: unknown):
  | { ok: true; value: KnowledgeReconciliationCommand }
  | { ok: false; error: string } {
  const parsed = reconciliationCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Choose dry run or provide the exact reconciliation confirmation with a limit from 1 to 100.",
    };
  }
  return { ok: true, value: parsed.data };
}

export function classifyKnowledgeSyncHealth(status: KnowledgeSyncStatus): KnowledgeSyncHealth {
  return {
    ...status,
    state: status.syncRequired > 0
      ? "needs_attention"
      : status.retryable > 0
        ? "backlog"
        : "healthy",
  };
}

export async function readKnowledgeSyncHealth(
  context: AuthContext,
  repository: KnowledgeSyncRepository = workspaceScope(context).knowledgeSync
): Promise<KnowledgeSyncHealth> {
  return classifyKnowledgeSyncHealth(await repository.syncStatus());
}

type AuditInput = {
  actorUserId: string | null;
  workspaceId: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

interface ReconciliationDependencies {
  repository?: KnowledgeSyncRepository;
  service?: Pick<KnowledgeSyncService, "reconcile">;
  audit?: (input: AuditInput) => Promise<unknown>;
  now?: () => Date;
  providerMode?: ProviderMode;
}

const emptyOutcomes = () => ({
  synced: 0,
  superseded: 0,
  localOnly: 0,
  needsAttention: 0,
});

function summarize(results: KnowledgeWriteResult[]) {
  const outcomes = emptyOutcomes();
  for (const result of results) {
    if (result.state === "synced") outcomes.synced += 1;
    else if (result.state === "superseded") outcomes.superseded += 1;
    else if (result.state === "local_only") outcomes.localOnly += 1;
    else outcomes.needsAttention += 1;
  }
  return outcomes;
}

function auditMetadata(
  command: KnowledgeReconciliationCommand,
  status: KnowledgeSyncHealth,
  extra: Record<string, unknown> = {}
) {
  return {
    mode: command.mode,
    limit: command.limit,
    pending: status.pending,
    error: status.error,
    syncRequired: status.syncRequired,
    retryable: status.retryable,
    ...extra,
  };
}

/**
 * Runs one bounded, workspace-scoped reconciliation command.
 *
 * The caller must provide an AuthContext obtained from the server authorization
 * boundary. The exported Server Action does that with `business.edit`; this DAL
 * still accepts no workspace, namespace, document id, or provider configuration
 * from the command payload.
 */
export async function runKnowledgeReconciliation(
  context: AuthContext,
  command: KnowledgeReconciliationCommand,
  dependencies: ReconciliationDependencies = {}
): Promise<KnowledgeReconciliationSummary> {
  const repository = dependencies.repository ?? workspaceScope(context).knowledgeSync;
  const audit = dependencies.audit ?? recordAuditEvent;
  const now = dependencies.now ?? serverNow;
  const before = await readKnowledgeSyncHealth(context, repository);
  const eligible = Math.min(before.retryable, command.limit);

  if (command.mode === "dry_run") {
    await audit({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "knowledge.reconciliation_previewed",
      targetType: "knowledge_sync",
      targetId: context.workspaceId,
      metadata: auditMetadata(command, before, { eligible }),
    });
    return {
      mode: command.mode,
      limit: command.limit,
      eligible,
      attempted: 0,
      outcomes: emptyOutcomes(),
      before,
      after: before,
      completionAuditRecorded: true,
    };
  }

  const providerMode = dependencies.providerMode ?? serverEnv.knowledgeProviderMode;
  if (providerMode === "disabled") {
    throw new KnowledgeProviderError(
      "knowledge_disabled",
      false,
      "Business Knowledge reconciliation is disabled."
    );
  }

  await audit({
    actorUserId: context.user.id,
    workspaceId: context.workspaceId,
    action: "knowledge.reconciliation_started",
    targetType: "knowledge_sync",
    targetId: context.workspaceId,
    metadata: auditMetadata(command, before, { eligible }),
  });

  const service = dependencies.service ?? createKnowledgeSyncService(context, repository);
  let results: KnowledgeWriteResult[];
  try {
    results = await service.reconcile(now(), command.limit);
  } catch (error) {
    try {
      await audit({
        actorUserId: context.user.id,
        workspaceId: context.workspaceId,
        action: "knowledge.reconciliation_failed",
        targetType: "knowledge_sync",
        targetId: context.workspaceId,
        metadata: auditMetadata(command, before, { attempted: 0 }),
      });
    } catch {
      // Preserve the original reconciliation failure. The started event was
      // already durable before provider work began.
    }
    throw error;
  }

  const outcomes = summarize(results);
  const after = await readKnowledgeSyncHealth(context, repository);
  let completionAuditRecorded = true;
  try {
    await audit({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "knowledge.reconciliation_completed",
      targetType: "knowledge_sync",
      targetId: context.workspaceId,
      metadata: auditMetadata(command, after, {
        attempted: results.length,
        synced: outcomes.synced,
        superseded: outcomes.superseded,
        localOnly: outcomes.localOnly,
        needsAttention: outcomes.needsAttention,
      }),
    });
  } catch {
    // Provider work and authoritative settlement are already complete. Returning
    // a warning avoids encouraging a replay solely because the trailing audit
    // insert failed; the pre-operation audit still records who initiated it.
    completionAuditRecorded = false;
  }

  return {
    mode: command.mode,
    limit: command.limit,
    eligible,
    attempted: results.length,
    outcomes,
    before,
    after,
    completionAuditRecorded,
    ...(completionAuditRecorded
      ? {}
      : { warning: "Reconciliation completed, but its completion audit needs attention." }),
  };
}
