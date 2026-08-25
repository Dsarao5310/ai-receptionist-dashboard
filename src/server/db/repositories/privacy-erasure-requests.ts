import "server-only";

import { newId } from "../ids";
import type {
  ErasureRejectionReason,
  IdentityVerificationMethod,
  PrivacyErasureRequest,
} from "@/server/privacy/types";
import { bool, iso, nullableIso, nullableStr, str, WorkspaceScopedRepository, type Row } from "./base";
import { eraseSensitiveContentInTransaction } from "./call-privacy";

export type ErasureRequestTransition =
  | { outcome: "not_found" }
  | { outcome: "invalid_state"; request: PrivacyErasureRequest }
  | { outcome: "unchanged"; request: PrivacyErasureRequest }
  | { outcome: "updated"; request: PrivacyErasureRequest };

export class PrivacyErasureRequestRepository extends WorkspaceScopedRepository {
  async list(): Promise<PrivacyErasureRequest[]> {
    const rows = await this.sql`
      select * from privacy_erasure_requests
      where workspace_id = ${this.ws}
      order by created_at desc, id desc`;
    return rows.map(toRequest);
  }

  async create(input: {
    callId: string;
    requestReference: string;
    actorUserId: string;
    createdAt: string;
  }): Promise<{ created: boolean; request: PrivacyErasureRequest } | null> {
    const [existing] = await this.sql`
      select * from privacy_erasure_requests
      where workspace_id = ${this.ws} and call_id = ${input.callId}
        and status in ('pending_identity','verified')`;
    if (existing) return { created: false, request: toRequest(existing) };

    const requestId = newId("erq");
    const [row] = await this.sql`
      insert into privacy_erasure_requests (
        id, workspace_id, call_id, request_reference, requested_by_user_id, created_at, updated_at
      )
      select ${requestId}, ${this.ws}, c.id, ${input.requestReference},
             ${input.actorUserId}, ${input.createdAt}, ${input.createdAt}
      from calls c
      where c.workspace_id = ${this.ws} and c.id = ${input.callId}
      on conflict (workspace_id, call_id)
        where status in ('pending_identity','verified')
      do update set updated_at = privacy_erasure_requests.updated_at
      returning *`;
    return row ? { created: str(row.id) === requestId, request: toRequest(row) } : null;
  }

  async verifyIdentity(input: {
    requestId: string;
    method: IdentityVerificationMethod;
    actorUserId: string;
    verifiedAt: string;
  }): Promise<ErasureRequestTransition> {
    return this.sql.begin(async (tx) => {
      const [current] = await tx`
        select * from privacy_erasure_requests
        where workspace_id = ${this.ws} and id = ${input.requestId}
        for update`;
      if (!current) return { outcome: "not_found" };
      if (current.status === "verified") return { outcome: "unchanged", request: toRequest(current) };
      if (current.status !== "pending_identity") return { outcome: "invalid_state", request: toRequest(current) };

      const [row] = await tx`
        update privacy_erasure_requests set
          status = 'verified',
          identity_verification_method = ${input.method},
          identity_verified_by_user_id = ${input.actorUserId},
          identity_verified_at = ${input.verifiedAt}
        where workspace_id = ${this.ws} and id = ${input.requestId}
        returning *`;
      return { outcome: "updated", request: toRequest(row) };
    });
  }

  async reject(input: {
    requestId: string;
    reason: ErasureRejectionReason;
    actorUserId: string;
    rejectedAt: string;
  }): Promise<ErasureRequestTransition> {
    return this.sql.begin(async (tx) => {
      const [current] = await tx`
        select * from privacy_erasure_requests
        where workspace_id = ${this.ws} and id = ${input.requestId}
        for update`;
      if (!current) return { outcome: "not_found" };
      if (current.status === "rejected") return { outcome: "unchanged", request: toRequest(current) };
      if (current.status === "completed") return { outcome: "invalid_state", request: toRequest(current) };

      const [row] = await tx`
        update privacy_erasure_requests set
          status = 'rejected',
          rejected_by_user_id = ${input.actorUserId},
          rejected_at = ${input.rejectedAt},
          rejection_reason_code = ${input.reason}
        where workspace_id = ${this.ws} and id = ${input.requestId}
        returning *`;
      return { outcome: "updated", request: toRequest(row) };
    });
  }

  async complete(input: {
    requestId: string;
    actorUserId: string;
    completedAt: string;
  }): Promise<ErasureRequestTransition> {
    return this.sql.begin(async (tx) => {
      const [current] = await tx`
        select * from privacy_erasure_requests
        where workspace_id = ${this.ws} and id = ${input.requestId}
        for update`;
      if (!current) return { outcome: "not_found" };
      if (current.status === "completed") return { outcome: "unchanged", request: toRequest(current) };
      if (current.status !== "verified") return { outcome: "invalid_state", request: toRequest(current) };

      const erased = await eraseSensitiveContentInTransaction(
        tx,
        this.ws,
        str(current.call_id),
        input.completedAt,
        true,
        true
      );
      if (!erased.found) return { outcome: "not_found" };

      const [row] = await tx`
        update privacy_erasure_requests set
          status = 'completed',
          completed_by_user_id = ${input.actorUserId},
          completed_at = ${input.completedAt},
          transcript_erased = ${erased.transcriptErased},
          recording_erased = ${erased.recordingErased}
        where workspace_id = ${this.ws} and id = ${input.requestId}
        returning *`;
      return { outcome: "updated", request: toRequest(row) };
    });
  }
}

function toRequest(row: Row): PrivacyErasureRequest {
  return {
    id: str(row.id),
    callId: str(row.call_id),
    requestReference: str(row.request_reference),
    status: str(row.status) as PrivacyErasureRequest["status"],
    identityVerificationMethod: nullableStr(row.identity_verification_method) as IdentityVerificationMethod | null,
    identityVerifiedAt: nullableIso(row.identity_verified_at),
    completedAt: nullableIso(row.completed_at),
    transcriptErased: row.transcript_erased == null ? null : bool(row.transcript_erased),
    recordingErased: row.recording_erased == null ? null : bool(row.recording_erased),
    rejectedAt: nullableIso(row.rejected_at),
    rejectionReasonCode: nullableStr(row.rejection_reason_code) as ErasureRejectionReason | null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
