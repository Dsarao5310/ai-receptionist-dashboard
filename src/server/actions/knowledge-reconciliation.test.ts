import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AuthenticationError extends Error {
    publicMessage = "Please sign in to continue.";
  }
  class AuthorizationError extends Error {
    publicMessage = "Access denied.";
  }
  return {
    AuthenticationError,
    AuthorizationError,
    requirePermission: vi.fn(),
    parse: vi.fn(),
    readHealth: vi.fn(),
    run: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/guards", () => ({
  AuthenticationError: mocks.AuthenticationError,
  AuthorizationError: mocks.AuthorizationError,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/integrations/knowledge/reconciliation", () => ({
  parseKnowledgeReconciliationCommand: mocks.parse,
  readKnowledgeSyncHealth: mocks.readHealth,
  runKnowledgeReconciliation: mocks.run,
}));

import {
  readKnowledgeSyncHealthAction,
  reconcileKnowledgeAction,
} from "./knowledge-reconciliation";

describe("Knowledge reconciliation actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid commands before authorization", async () => {
    mocks.parse.mockReturnValueOnce({ ok: false, error: "Invalid reconciliation command." });
    await expect(reconcileKnowledgeAction({ mode: "execute" })).resolves.toEqual({
      ok: false,
      error: "Invalid reconciliation command.",
    });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects a caller without business.edit before reading or mutating state", async () => {
    mocks.parse.mockReturnValueOnce({ ok: true, value: { mode: "dry_run", limit: 25 } });
    mocks.requirePermission.mockRejectedValueOnce(new mocks.AuthorizationError());
    await expect(reconcileKnowledgeAction({ mode: "dry_run" })).resolves.toEqual({
      ok: false,
      error: "Access denied.",
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("passes only the server-authorized context to the reconciliation DAL", async () => {
    const context = { workspaceId: "ws_authorized", user: { id: "usr_owner" } };
    const command = { mode: "dry_run", limit: 10 };
    const summary = { mode: "dry_run", attempted: 0 };
    mocks.parse.mockReturnValueOnce({ ok: true, value: command });
    mocks.requirePermission.mockResolvedValueOnce(context);
    mocks.run.mockResolvedValueOnce(summary);

    await expect(reconcileKnowledgeAction({ ...command, workspaceId: "ws_foreign" })).resolves.toEqual({
      ok: true,
      summary,
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith("business.edit");
    expect(mocks.run).toHaveBeenCalledWith(context, command);
  });

  it("returns content-free sync health only after authorization", async () => {
    const context = { workspaceId: "ws_authorized", user: { id: "usr_owner" } };
    const health = {
      state: "backlog",
      total: 8,
      pending: 8,
      error: 0,
      syncRequired: 0,
      synced: 0,
      retryable: 8,
      oldestRetryableAt: "2026-08-25T20:00:00.000Z",
    };
    mocks.requirePermission.mockResolvedValueOnce(context);
    mocks.readHealth.mockResolvedValueOnce(health);

    await expect(readKnowledgeSyncHealthAction()).resolves.toEqual({ ok: true, health });
    expect(mocks.requirePermission).toHaveBeenCalledWith("business.edit");
    expect(mocks.readHealth).toHaveBeenCalledWith(context);
    expect(JSON.stringify(health)).not.toMatch(/providerDocumentId|namespace|content/i);
  });

  it("does not expose unexpected server failures", async () => {
    mocks.parse.mockReturnValueOnce({ ok: true, value: { mode: "dry_run", limit: 25 } });
    mocks.requirePermission.mockResolvedValueOnce({ workspaceId: "ws_authorized" });
    mocks.run.mockRejectedValueOnce(new Error("postgres password raw provider response"));
    await expect(reconcileKnowledgeAction({ mode: "dry_run" })).resolves.toEqual({
      ok: false,
      error: "Business Knowledge reconciliation could not be completed.",
    });
  });
});
