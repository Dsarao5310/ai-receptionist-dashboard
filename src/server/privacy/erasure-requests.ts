import "server-only";

import { can } from "@/lib/permissions";
import { recordAuditEvent } from "@/server/audit";
import { AuthorizationError, type AuthContext } from "@/server/auth/policy";
import { getDb, type Sql } from "@/server/db/client";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type {
  ErasureRejectionReason,
  IdentityVerificationMethod,
  PrivacyErasureRequest,
} from "./types";

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const VERIFICATION_METHODS = new Set<IdentityVerificationMethod>([
  "callback_to_record",
  "matched_account_record",
  "in_person",
]);
const REJECTION_REASONS = new Set<ErasureRejectionReason>([
  "request_withdrawn",
  "identity_unverified",
  "not_applicable",
]);

function requireErasurePermission(context: AuthContext): void {
  if (!can({ platformRole: context.user.platformRole, workspaceRole: context.workspaceRole }, "privacy.erase")) {
    throw new AuthorizationError("missing_permission:privacy.erase");
  }
}

export function validateErasureRequestReference(value: string): string {
  const normalized = value.trim();
  if (!REFERENCE.test(normalized)) throw new Error("invalid_erasure_request_reference");
  return normalized;
}

export async function listErasureRequests(
  context: AuthContext,
  sql: Sql = getDb()
): Promise<PrivacyErasureRequest[]> {
  requireErasurePermission(context);
  return workspaceScope(context, sql).privacyErasureRequests.list();
}

export async function createErasureRequest(
  context: AuthContext,
  input: { callId: string; requestReference: string; createdAt: string },
  sql: Sql = getDb()
): Promise<PrivacyErasureRequest | null> {
  requireErasurePermission(context);
  const requestReference = validateErasureRequestReference(input.requestReference);
  const result = await workspaceScope(context, sql).privacyErasureRequests.create({
    ...input,
    requestReference,
    actorUserId: context.user.id,
  });
  if (!result) return null;
  if (result.created) {
    await audit(context, sql, "privacy.erasure_requested", result.request.id, {
      callId: result.request.callId,
    });
  }
  return result.request;
}

export async function verifyErasureRequestIdentity(
  context: AuthContext,
  input: { requestId: string; method: IdentityVerificationMethod; verifiedAt: string },
  sql: Sql = getDb()
): Promise<PrivacyErasureRequest | null> {
  requireErasurePermission(context);
  if (!VERIFICATION_METHODS.has(input.method)) throw new Error("invalid_identity_verification_method");
  const transition = await workspaceScope(context, sql).privacyErasureRequests.verifyIdentity({
    ...input,
    actorUserId: context.user.id,
  });
  if (transition.outcome === "not_found") return null;
  if (transition.outcome === "invalid_state") throw new Error("invalid_erasure_request_state");
  if (transition.outcome === "updated") {
    await audit(context, sql, "privacy.erasure_identity_verified", transition.request.id, {
      method: transition.request.identityVerificationMethod,
    });
  }
  return transition.request;
}

export async function rejectErasureRequest(
  context: AuthContext,
  input: { requestId: string; reason: ErasureRejectionReason; rejectedAt: string },
  sql: Sql = getDb()
): Promise<PrivacyErasureRequest | null> {
  requireErasurePermission(context);
  if (!REJECTION_REASONS.has(input.reason)) throw new Error("invalid_erasure_rejection_reason");
  const transition = await workspaceScope(context, sql).privacyErasureRequests.reject({
    ...input,
    actorUserId: context.user.id,
  });
  if (transition.outcome === "not_found") return null;
  if (transition.outcome === "invalid_state") throw new Error("invalid_erasure_request_state");
  if (transition.outcome === "updated") {
    await audit(context, sql, "privacy.erasure_rejected", transition.request.id, {
      reason: transition.request.rejectionReasonCode,
    });
  }
  return transition.request;
}

export async function executeErasureRequest(
  context: AuthContext,
  input: { requestId: string; confirmation: string; completedAt: string },
  sql: Sql = getDb()
): Promise<PrivacyErasureRequest | null> {
  requireErasurePermission(context);
  if (input.confirmation !== `ERASE ${input.requestId}`) throw new Error("invalid_erasure_confirmation");
  const transition = await workspaceScope(context, sql).privacyErasureRequests.complete({
    requestId: input.requestId,
    actorUserId: context.user.id,
    completedAt: input.completedAt,
  });
  if (transition.outcome === "not_found") return null;
  if (transition.outcome === "invalid_state") throw new Error("invalid_erasure_request_state");
  if (transition.outcome === "updated") {
    await recordAuditEvent(
      {
        actorUserId: context.user.id,
        workspaceId: context.workspaceId,
        action: "privacy.content_erased",
        targetType: "call",
        targetId: transition.request.callId,
        metadata: {
          requestId: transition.request.id,
          transcriptErased: transition.request.transcriptErased,
          recordingErased: transition.request.recordingErased,
        },
      },
      new PostgresIdentityRepository(sql)
    );
  }
  return transition.request;
}

async function audit(
  context: AuthContext,
  sql: Sql,
  action: "privacy.erasure_requested" | "privacy.erasure_identity_verified" | "privacy.erasure_rejected",
  requestId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await recordAuditEvent(
    {
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action,
      targetType: "privacy_erasure_request",
      targetId: requestId,
      metadata,
    },
    new PostgresIdentityRepository(sql)
  );
}
