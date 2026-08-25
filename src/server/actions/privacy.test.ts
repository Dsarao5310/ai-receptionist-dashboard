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
    updatePolicy: vi.fn(),
    createErasure: vi.fn(),
    verifyErasure: vi.fn(),
    rejectErasure: vi.fn(),
    executeErasure: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/guards", () => ({
  AuthenticationError: mocks.AuthenticationError,
  AuthorizationError: mocks.AuthorizationError,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/privacy/service", () => ({ updateWorkspacePrivacyPolicy: mocks.updatePolicy }));
vi.mock("@/server/privacy/erasure-requests", () => ({
  createErasureRequest: mocks.createErasure,
  verifyErasureRequestIdentity: mocks.verifyErasure,
  rejectErasureRequest: mocks.rejectErasure,
  executeErasureRequest: mocks.executeErasure,
}));
vi.mock("@/server/clock", () => ({ serverNow: () => new Date("2026-08-24T20:00:00.000Z") }));

import {
  createErasureRequestAction,
  executeErasureRequestAction,
  updatePrivacyPolicyAction,
  verifyErasureIdentityAction,
} from "./privacy";

const input = {
  recordingMode: "disabled" as const,
  transcriptRetentionDays: 90,
  recordingRetentionDays: 30,
  consentNotice: "",
};

describe("updatePrivacyPolicyAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid input before authorization or persistence", async () => {
    const result = await updatePrivacyPolicyAction({ ...input, transcriptRetentionDays: 0 });
    expect(result.ok).toBe(false);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.updatePolicy).not.toHaveBeenCalled();
  });

  it("rejects a caller without privacy.manage", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new mocks.AuthorizationError());
    await expect(updatePrivacyPolicyAction(input)).resolves.toEqual({ ok: false, error: "Access denied." });
    expect(mocks.updatePolicy).not.toHaveBeenCalled();
  });

  it("persists with the server-authorized context and revalidates settings", async () => {
    const context = { workspaceId: "ws_authorized" };
    const policy = { ...input, policyVersion: 2, updatedAt: "2026-08-24T20:00:00.000Z" };
    mocks.requirePermission.mockResolvedValueOnce(context);
    mocks.updatePolicy.mockResolvedValueOnce(policy);

    await expect(updatePrivacyPolicyAction(input)).resolves.toEqual({ ok: true, policy });
    expect(mocks.requirePermission).toHaveBeenCalledWith("privacy.manage");
    expect(mocks.updatePolicy).toHaveBeenCalledWith(context, input);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("does not expose unexpected persistence errors", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ workspaceId: "ws_authorized" });
    mocks.updatePolicy.mockRejectedValueOnce(new Error("postgres secret detail"));
    await expect(updatePrivacyPolicyAction(input)).resolves.toEqual({
      ok: false,
      error: "The privacy policy could not be saved. Try again.",
    });
  });
});

const erasureRequest = {
  id: "erq_abcdefgh",
  callId: "call_abcdefgh",
  requestReference: "CASE-2026-001",
  status: "pending_identity" as const,
  identityVerificationMethod: null,
  identityVerifiedAt: null,
  completedAt: null,
  transcriptErased: null,
  recordingErased: null,
  rejectedAt: null,
  rejectionReasonCode: null,
  createdAt: "2026-08-24T20:00:00.000Z",
  updatedAt: "2026-08-24T20:00:00.000Z",
};

describe("privacy erasure request actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed request input before authorization", async () => {
    await expect(createErasureRequestAction({
      callId: "another tenant",
      requestReference: "requester@example.com",
    })).resolves.toMatchObject({ ok: false });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.createErasure).not.toHaveBeenCalled();
  });

  it("requires privacy.erase independently of UI visibility", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new mocks.AuthorizationError());
    await expect(createErasureRequestAction({
      callId: "call_abcdefgh",
      requestReference: "CASE-2026-001",
    })).resolves.toEqual({ ok: false, error: "Access denied." });
    expect(mocks.createErasure).not.toHaveBeenCalled();
  });

  it("uses the server-authorized context and server clock", async () => {
    const context = { workspaceId: "ws_authorized" };
    mocks.requirePermission.mockResolvedValueOnce(context);
    mocks.createErasure.mockResolvedValueOnce(erasureRequest);
    await expect(createErasureRequestAction({
      callId: "call_abcdefgh",
      requestReference: "CASE-2026-001",
    })).resolves.toEqual({ ok: true, request: erasureRequest });
    expect(mocks.requirePermission).toHaveBeenCalledWith("privacy.erase");
    expect(mocks.createErasure).toHaveBeenCalledWith(context, {
      callId: "call_abcdefgh",
      requestReference: "CASE-2026-001",
      createdAt: "2026-08-24T20:00:00.000Z",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("records identity verification as a separate action", async () => {
    const context = { workspaceId: "ws_authorized" };
    const verified = {
      ...erasureRequest,
      status: "verified" as const,
      identityVerificationMethod: "callback_to_record" as const,
      identityVerifiedAt: "2026-08-24T20:00:00.000Z",
    };
    mocks.requirePermission.mockResolvedValueOnce(context);
    mocks.verifyErasure.mockResolvedValueOnce(verified);
    await expect(verifyErasureIdentityAction({
      requestId: erasureRequest.id,
      method: "callback_to_record",
    })).resolves.toEqual({ ok: true, request: verified });
    expect(mocks.verifyErasure).toHaveBeenCalledWith(context, {
      requestId: erasureRequest.id,
      method: "callback_to_record",
      verifiedAt: "2026-08-24T20:00:00.000Z",
    });
  });

  it("returns safe state and confirmation errors", async () => {
    mocks.requirePermission.mockResolvedValue({ workspaceId: "ws_authorized" });
    mocks.executeErasure.mockRejectedValueOnce(new Error("invalid_erasure_confirmation"));
    await expect(executeErasureRequestAction({
      requestId: erasureRequest.id,
      confirmation: "ERASE wrong",
    })).resolves.toEqual({ ok: false, error: "The confirmation did not match this request." });

    mocks.executeErasure.mockRejectedValueOnce(new Error("postgres transcript detail"));
    await expect(executeErasureRequestAction({
      requestId: erasureRequest.id,
      confirmation: `ERASE ${erasureRequest.id}`,
    })).resolves.toEqual({ ok: false, error: "The erasure request could not be updated. Try again." });
  });
});
