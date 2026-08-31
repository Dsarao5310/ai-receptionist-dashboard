"use server";

import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { KnowledgeProviderError } from "@/server/integrations/knowledge/errors";
import {
  parseKnowledgeReconciliationCommand,
  readKnowledgeSyncHealth,
  runKnowledgeReconciliation,
  type KnowledgeReconciliationSummary,
  type KnowledgeSyncHealth,
} from "@/server/integrations/knowledge/reconciliation";

export type KnowledgeSyncHealthActionResult =
  | { ok: true; health: KnowledgeSyncHealth }
  | { ok: false; error: string };

export type KnowledgeReconciliationActionResult =
  | { ok: true; summary: KnowledgeReconciliationSummary }
  | { ok: false; error: string };

function safeFailure(error: unknown, fallback: string): { ok: false; error: string } {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof KnowledgeProviderError
  ) {
    return { ok: false, error: error instanceof KnowledgeProviderError ? error.message : error.publicMessage };
  }
  return { ok: false, error: fallback };
}

/** Content-free, workspace-scoped operational status for an authorized owner. */
export async function readKnowledgeSyncHealthAction(): Promise<KnowledgeSyncHealthActionResult> {
  try {
    const context = await requirePermission("business.edit");
    return { ok: true, health: await readKnowledgeSyncHealth(context) };
  } catch (error) {
    return safeFailure(error, "Business Knowledge synchronization status is unavailable.");
  }
}

/**
 * Protected manual command. It is intentionally not wired to dashboard UI yet.
 * Execute mode additionally requires the exact confirmation phrase enforced by
 * the DAL and processes at most 100 retryable rows in the authorized workspace.
 */
export async function reconcileKnowledgeAction(input: unknown): Promise<KnowledgeReconciliationActionResult> {
  const parsed = parseKnowledgeReconciliationCommand(input);
  if (!parsed.ok) return parsed;
  try {
    const context = await requirePermission("business.edit");
    return { ok: true, summary: await runKnowledgeReconciliation(context, parsed.value) };
  } catch (error) {
    return safeFailure(error, "Business Knowledge reconciliation could not be completed.");
  }
}
