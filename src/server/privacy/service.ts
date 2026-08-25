import "server-only";

import { can } from "@/lib/permissions";
import { recordAuditEvent } from "@/server/audit";
import { AuthorizationError, type AuthContext } from "@/server/auth/policy";
import type { Sql } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { PrivacyPolicyPatch } from "@/server/db/repositories/call-privacy";
import type { WorkspacePrivacyPolicy } from "./types";

function requireContextPermission(context: AuthContext, permission: "privacy.manage" | "privacy.erase"): void {
  if (!can({ platformRole: context.user.platformRole, workspaceRole: context.workspaceRole }, permission)) {
    throw new AuthorizationError(`missing_permission:${permission}`);
  }
}

export function validatePrivacyPolicy(input: PrivacyPolicyPatch): PrivacyPolicyPatch {
  const notice = input.consentNotice.trim();
  if (!Number.isInteger(input.transcriptRetentionDays) || input.transcriptRetentionDays < 1 || input.transcriptRetentionDays > 365) {
    throw new Error("invalid_transcript_retention");
  }
  if (!Number.isInteger(input.recordingRetentionDays) || input.recordingRetentionDays < 1 || input.recordingRetentionDays > 90) {
    throw new Error("invalid_recording_retention");
  }
  if (notice.length > 1000 || (input.recordingMode === "explicit_consent" && notice.length < 20)) {
    throw new Error("invalid_consent_notice");
  }
  return { ...input, consentNotice: notice };
}

export async function updateWorkspacePrivacyPolicy(
  context: AuthContext,
  input: PrivacyPolicyPatch,
  sql: Sql = getDb()
): Promise<WorkspacePrivacyPolicy> {
  requireContextPermission(context, "privacy.manage");
  const validated = validatePrivacyPolicy(input);
  const policy = await workspaceScope(context, sql).privacy.updatePolicy(validated, context.user.id);
  await recordAuditEvent(
    {
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "privacy.policy_changed",
      targetType: "workspace_privacy_policy",
      targetId: context.workspaceId,
      metadata: {
        recordingMode: policy.recordingMode,
        transcriptRetentionDays: policy.transcriptRetentionDays,
        recordingRetentionDays: policy.recordingRetentionDays,
        policyVersion: policy.policyVersion,
      },
    },
    new PostgresIdentityRepository(sql)
  );
  return policy;
}
