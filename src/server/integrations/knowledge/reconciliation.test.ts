import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AuthContext } from "@/server/auth/policy";
import type {
  KnowledgeSyncRepository,
  KnowledgeSyncStatus,
} from "@/server/db/repositories/knowledge-sync";
import { KnowledgeProviderError } from "./errors";
import {
  classifyKnowledgeSyncHealth,
  parseKnowledgeReconciliationCommand,
  runKnowledgeReconciliation,
} from "./reconciliation";

const NOW = new Date("2026-08-26T20:00:00.000Z");
const context = {
  user: { id: "usr_owner" },
  workspaceId: "ws_authorized",
  workspaceRole: "owner",
} as AuthContext;

function status(patch: Partial<KnowledgeSyncStatus> = {}): KnowledgeSyncStatus {
  const base = {
    total: 8,
    pending: 5,
    error: 2,
    syncRequired: 1,
    synced: 0,
    retryable: 7,
    oldestRetryableAt: "2026-08-25T20:00:00.000Z",
  };
  return { ...base, ...patch };
}

describe("Knowledge reconciliation command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a bounded limit and exact confirmation for execute mode", () => {
    expect(parseKnowledgeReconciliationCommand({ mode: "dry_run" })).toEqual({
      ok: true,
      value: { mode: "dry_run", limit: 25 },
    });
    expect(parseKnowledgeReconciliationCommand({
      mode: "execute",
      limit: 10,
      confirmation: "RECONCILE KNOWLEDGE",
    }).ok).toBe(true);
    expect(parseKnowledgeReconciliationCommand({ mode: "execute", limit: 10 }).ok).toBe(false);
    expect(parseKnowledgeReconciliationCommand({ mode: "dry_run", limit: 101 }).ok).toBe(false);
    expect(parseKnowledgeReconciliationCommand({ mode: "dry_run", limit: 10, workspaceId: "ws_foreign" }).ok).toBe(false);
  });

  it("classifies manual attention ahead of retryable backlog", () => {
    expect(classifyKnowledgeSyncHealth(status()).state).toBe("needs_attention");
    expect(classifyKnowledgeSyncHealth(status({ syncRequired: 0 })).state).toBe("backlog");
    expect(classifyKnowledgeSyncHealth(status({
      pending: 0,
      error: 0,
      syncRequired: 0,
      retryable: 0,
      oldestRetryableAt: null,
    })).state).toBe("healthy");
  });

  it("dry-runs without invoking provider reconciliation or exposing records", async () => {
    const syncStatus = vi.fn().mockResolvedValue(status());
    const reconcile = vi.fn();
    const audit = vi.fn().mockResolvedValue(undefined);

    const result = await runKnowledgeReconciliation(
      context,
      { mode: "dry_run", limit: 3 },
      {
        repository: { syncStatus } as unknown as KnowledgeSyncRepository,
        service: { reconcile },
        audit,
        now: () => NOW,
        providerMode: "simulated",
      }
    );

    expect(result).toMatchObject({
      mode: "dry_run",
      limit: 3,
      eligible: 3,
      attempted: 0,
      outcomes: { synced: 0, superseded: 0, localOnly: 0, needsAttention: 0 },
    });
    expect(reconcile).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "usr_owner",
      workspaceId: "ws_authorized",
      action: "knowledge.reconciliation_previewed",
      metadata: expect.objectContaining({ eligible: 3, retryable: 7 }),
    }));
    expect(JSON.stringify(result)).not.toMatch(/providerDocumentId|namespace|content/i);
  });

  it("refuses execute mode while the provider is disabled", async () => {
    const reconcile = vi.fn();
    const audit = vi.fn();
    const operation = runKnowledgeReconciliation(
      context,
      { mode: "execute", limit: 3, confirmation: "RECONCILE KNOWLEDGE" },
      {
        repository: { syncStatus: vi.fn().mockResolvedValue(status()) } as unknown as KnowledgeSyncRepository,
        service: { reconcile },
        audit,
        providerMode: "disabled",
      }
    );

    await expect(operation).rejects.toMatchObject({ code: "knowledge_disabled" });
    expect(reconcile).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("summarizes a bounded run and does not replay it when completion audit fails", async () => {
    const syncStatus = vi.fn()
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ pending: 2, error: 1, retryable: 3 }));
    const reconcile = vi.fn().mockResolvedValue([
      { state: "synced", id: "kn_one" },
      { state: "superseded", id: "kn_two" },
      { state: "needs_attention", id: "kn_three", message: "Safe warning" },
    ]);
    const audit = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("audit unavailable"));

    const result = await runKnowledgeReconciliation(
      context,
      { mode: "execute", limit: 3, confirmation: "RECONCILE KNOWLEDGE" },
      {
        repository: { syncStatus } as unknown as KnowledgeSyncRepository,
        service: { reconcile },
        audit,
        now: () => NOW,
        providerMode: "simulated",
      }
    );

    expect(reconcile).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledWith(NOW, 3);
    expect(result).toMatchObject({
      attempted: 3,
      outcomes: { synced: 1, superseded: 1, localOnly: 0, needsAttention: 1 },
      completionAuditRecorded: false,
      warning: "Reconciliation completed, but its completion audit needs attention.",
    });
    expect(audit.mock.calls.map(([event]) => event.action)).toEqual([
      "knowledge.reconciliation_started",
      "knowledge.reconciliation_completed",
    ]);
  });

  it("records a safe failure event and preserves the original reconciliation error", async () => {
    const failure = new KnowledgeProviderError(
      "knowledge_provider_failed",
      true,
      "Business Knowledge reconciliation failed safely."
    );
    const audit = vi.fn().mockResolvedValue(undefined);
    const operation = runKnowledgeReconciliation(
      context,
      { mode: "execute", limit: 2, confirmation: "RECONCILE KNOWLEDGE" },
      {
        repository: { syncStatus: vi.fn().mockResolvedValue(status()) } as unknown as KnowledgeSyncRepository,
        service: { reconcile: vi.fn().mockRejectedValue(failure) },
        audit,
        now: () => NOW,
        providerMode: "simulated",
      }
    );

    await expect(operation).rejects.toBe(failure);
    expect(audit.mock.calls.map(([event]) => event.action)).toEqual([
      "knowledge.reconciliation_started",
      "knowledge.reconciliation_failed",
    ]);
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/api.?key|credential|namespace/i);
  });
});
