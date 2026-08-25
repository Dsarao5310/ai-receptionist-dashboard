"use server";

import { revalidatePath } from "next/cache";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { updateWorkspacePrivacyPolicy } from "@/server/privacy/service";
import { parsePrivacyPolicyActionInput } from "@/server/privacy/action-input";
import type { WorkspacePrivacyPolicy } from "@/server/privacy/types";
import type { PrivacyErasureRequest } from "@/server/privacy/types";
import { serverNow } from "@/server/clock";
import {
  createErasureRequest,
  executeErasureRequest,
  rejectErasureRequest,
  verifyErasureRequestIdentity,
} from "@/server/privacy/erasure-requests";
import {
  parseCreateErasureRequestInput,
  parseExecuteErasureRequestInput,
  parseRejectErasureRequestInput,
  parseVerifyErasureIdentityInput,
} from "@/server/privacy/erasure-action-input";

export type PrivacyPolicyActionResult =
  | { ok: true; policy: WorkspacePrivacyPolicy }
  | { ok: false; error: string };

export type PrivacyErasureActionResult =
  | { ok: true; request: PrivacyErasureRequest }
  | { ok: false; error: string };

export async function updatePrivacyPolicyAction(input: unknown): Promise<PrivacyPolicyActionResult> {
  try {
    const parsed = parsePrivacyPolicyActionInput(input);
    if (!parsed.ok) return parsed;
    const context = await requirePermission("privacy.manage");
    const policy = await updateWorkspacePrivacyPolicy(context, parsed.value);
    revalidatePath("/settings");
    return { ok: true, policy };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return { ok: false, error: error.publicMessage };
    }
    if (error instanceof Error) {
      const safe: Record<string, string> = {
        invalid_transcript_retention: "Transcript retention must be between 1 and 365 days.",
        invalid_recording_retention: "Recording retention must be between 1 and 90 days.",
        invalid_consent_notice: "Add a meaningful consent notice before enabling recording.",
      };
      if (safe[error.message]) return { ok: false, error: safe[error.message] };
    }
    return { ok: false, error: "The privacy policy could not be saved. Try again." };
  }
}

export async function createErasureRequestAction(input: unknown): Promise<PrivacyErasureActionResult> {
  const parsed = parseCreateErasureRequestInput(input);
  if (!parsed.ok) return parsed;
  return erasureAction(async () => {
    const context = await requirePermission("privacy.erase");
    return createErasureRequest(context, { ...parsed.value, createdAt: serverNow().toISOString() });
  });
}

export async function verifyErasureIdentityAction(input: unknown): Promise<PrivacyErasureActionResult> {
  const parsed = parseVerifyErasureIdentityInput(input);
  if (!parsed.ok) return parsed;
  return erasureAction(async () => {
    const context = await requirePermission("privacy.erase");
    return verifyErasureRequestIdentity(context, { ...parsed.value, verifiedAt: serverNow().toISOString() });
  });
}

export async function rejectErasureRequestAction(input: unknown): Promise<PrivacyErasureActionResult> {
  const parsed = parseRejectErasureRequestInput(input);
  if (!parsed.ok) return parsed;
  return erasureAction(async () => {
    const context = await requirePermission("privacy.erase");
    return rejectErasureRequest(context, { ...parsed.value, rejectedAt: serverNow().toISOString() });
  });
}

export async function executeErasureRequestAction(input: unknown): Promise<PrivacyErasureActionResult> {
  const parsed = parseExecuteErasureRequestInput(input);
  if (!parsed.ok) return parsed;
  return erasureAction(async () => {
    const context = await requirePermission("privacy.erase");
    return executeErasureRequest(context, { ...parsed.value, completedAt: serverNow().toISOString() });
  });
}

async function erasureAction(operation: () => Promise<PrivacyErasureRequest | null>): Promise<PrivacyErasureActionResult> {
  try {
    const request = await operation();
    if (!request) return { ok: false, error: "Erasure request not found." };
    revalidatePath("/settings");
    return { ok: true, request };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return { ok: false, error: error.publicMessage };
    }
    if (error instanceof Error) {
      const safe: Record<string, string> = {
        invalid_erasure_request_reference: "Enter a valid internal request reference.",
        invalid_identity_verification_method: "Choose a supported identity-verification method.",
        invalid_erasure_rejection_reason: "Choose a supported rejection reason.",
        invalid_erasure_confirmation: "The confirmation did not match this request.",
        invalid_erasure_request_state: "This request cannot make that transition from its current state.",
      };
      if (safe[error.message]) return { ok: false, error: safe[error.message] };
    }
    return { ok: false, error: "The erasure request could not be updated. Try again." };
  }
}
