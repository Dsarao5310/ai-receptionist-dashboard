export type RecordingMode = "disabled" | "explicit_consent";
export type ConsentDecision = "granted" | "denied" | "withdrawn";
export type ConsentSource = "voice" | "admin" | "system";

export interface WorkspacePrivacyPolicy {
  recordingMode: RecordingMode;
  transcriptRetentionDays: number;
  recordingRetentionDays: number;
  consentNotice: string;
  policyVersion: number;
  updatedAt: string;
}

export interface CallPrivacyState {
  callId: string;
  consentStatus: "not_requested" | ConsentDecision;
  consentedAt: string | null;
  withdrawnAt: string | null;
  lastConsentEventAt: string | null;
  consentPolicyVersion: number | null;
  transcriptExpiresAt: string | null;
  recordingExpiresAt: string | null;
  transcriptDeletedAt: string | null;
  recordingDeletedAt: string | null;
}

export interface ErasureResult {
  found: boolean;
  transcriptErased: boolean;
  recordingErased: boolean;
}

export type ErasureRequestStatus = "pending_identity" | "verified" | "completed" | "rejected";
export type IdentityVerificationMethod = "callback_to_record" | "matched_account_record" | "in_person";
export type ErasureRejectionReason = "request_withdrawn" | "identity_unverified" | "not_applicable";

export interface PrivacyErasureRequest {
  id: string;
  callId: string;
  requestReference: string;
  status: ErasureRequestStatus;
  identityVerificationMethod: IdentityVerificationMethod | null;
  identityVerifiedAt: string | null;
  completedAt: string | null;
  transcriptErased: boolean | null;
  recordingErased: boolean | null;
  rejectedAt: string | null;
  rejectionReasonCode: ErasureRejectionReason | null;
  createdAt: string;
  updatedAt: string;
}
