import "server-only";

import { newId } from "../ids";
import type {
  CallPrivacyState,
  ConsentDecision,
  ConsentSource,
  ErasureResult,
  RecordingMode,
  WorkspacePrivacyPolicy,
} from "@/server/privacy/types";
import { iso, nullableIso, num, str, WorkspaceScopedRepository, type Row } from "./base";
import type { Tx } from "../client";

export interface PrivacyPolicyPatch {
  recordingMode: RecordingMode;
  transcriptRetentionDays: number;
  recordingRetentionDays: number;
  consentNotice: string;
}

export class CallPrivacyRepository extends WorkspaceScopedRepository {
  async getPolicy(): Promise<WorkspacePrivacyPolicy> {
    const [row] = await this.sql`
      select recording_mode, transcript_retention_days, recording_retention_days,
             consent_notice, policy_version, updated_at
      from workspace_privacy_policies
      where workspace_id = ${this.ws}`;
    if (!row) throw new Error("privacy_policy_missing");
    return toPolicy(row);
  }

  async updatePolicy(patch: PrivacyPolicyPatch, actorUserId: string): Promise<WorkspacePrivacyPolicy> {
    const [row] = await this.sql`
      update workspace_privacy_policies set
        recording_mode = ${patch.recordingMode},
        transcript_retention_days = ${patch.transcriptRetentionDays},
        recording_retention_days = ${patch.recordingRetentionDays},
        consent_notice = ${patch.consentNotice},
        policy_version = policy_version + 1,
        updated_by_user_id = ${actorUserId}
      where workspace_id = ${this.ws}
      returning recording_mode, transcript_retention_days, recording_retention_days,
                consent_notice, policy_version, updated_at`;
    if (!row) throw new Error("privacy_policy_missing");
    return toPolicy(row);
  }

  async getState(callId: string): Promise<CallPrivacyState | null> {
    const [row] = await this.sql`
      select * from call_privacy_state
      where workspace_id = ${this.ws} and call_id = ${callId}`;
    return row ? toState(row) : null;
  }

  /**
   * Appends minimal consent evidence and updates the current projection.
   * Customer wording and audio are deliberately not accepted by this API.
   */
  async recordConsent(input: {
    callId: string;
    decision: ConsentDecision;
    source: ConsentSource;
    occurredAt: string;
    actorUserId?: string | null;
    eventId?: string;
  }): Promise<CallPrivacyState | null> {
    return this.sql.begin(async (tx) => {
      const [policy] = await tx`
        select recording_mode, policy_version
        from workspace_privacy_policies
        where workspace_id = ${this.ws}`;
      if (!policy) throw new Error("privacy_policy_missing");
      if (input.decision === "granted" && policy.recording_mode !== "explicit_consent") {
        throw new Error("recording_disabled");
      }

      const eventId = input.eventId ?? newId("cns");
      const inserted = await tx`
        insert into call_consent_events (
          id, workspace_id, call_id, decision, source, policy_version,
          actor_user_id, occurred_at
        )
        select ${eventId}, ${this.ws}, c.id, ${input.decision}, ${input.source},
               ${num(policy.policy_version)}, ${input.actorUserId ?? null}, ${input.occurredAt}
        from calls c
        where c.workspace_id = ${this.ws} and c.id = ${input.callId}
        on conflict (id) do nothing
        returning call_id`;
      if (inserted.length === 0) {
        const [sameEvent] = await tx`
          select id from call_consent_events
          where id = ${eventId} and workspace_id = ${this.ws} and call_id = ${input.callId}
            and decision = ${input.decision} and source = ${input.source}`;
        if (!sameEvent) throw new Error("consent_event_conflict");
        return this.stateIn(tx, input.callId);
      }

      const granted = input.decision === "granted";
      const projected = await tx`
        update call_privacy_state set
          consent_status = ${input.decision},
          consented_at = case when ${granted} then ${input.occurredAt}::timestamptz else consented_at end,
          withdrawn_at = case when ${input.decision === "withdrawn"} then ${input.occurredAt}::timestamptz else null end,
          last_consent_event_at = ${input.occurredAt},
          consent_policy_version = case when ${granted} then ${num(policy.policy_version)} else consent_policy_version end
        where workspace_id = ${this.ws} and call_id = ${input.callId}
          and (last_consent_event_at is null or last_consent_event_at <= ${input.occurredAt}::timestamptz)
        returning call_id`;

      if (projected.length > 0 && !granted) {
        await eraseSensitiveContentInTransaction(tx, this.ws, input.callId, input.occurredAt, true, true);
      }
      return this.stateIn(tx, input.callId);
    });
  }

  /** Server-only storage gate for a future provider adapter. Not called by Vapi today. */
  async storeRecording(input: {
    callId: string;
    recordingUrl: string;
    durationSec: number;
    storedAt: string;
  }): Promise<boolean> {
    assertRecordingInput(input.recordingUrl, input.durationSec);
    return this.sql.begin(async (tx) => {
      const [eligible] = await tx`
        select p.recording_retention_days
        from calls c
        join call_privacy_state s
          on s.workspace_id = c.workspace_id and s.call_id = c.id
        join workspace_privacy_policies p on p.workspace_id = c.workspace_id
        where c.workspace_id = ${this.ws} and c.id = ${input.callId}
          and p.recording_mode = 'explicit_consent'
          and s.consent_status = 'granted'
        for update of c, s`;
      if (!eligible) return false;

      const expiresAt = new Date(
        new Date(input.storedAt).getTime() + num(eligible.recording_retention_days) * 86_400_000
      ).toISOString();
      await tx`
        update calls set recording_url = ${input.recordingUrl},
                         recording_duration_sec = ${input.durationSec}
        where workspace_id = ${this.ws} and id = ${input.callId}`;
      await tx`
        update call_privacy_state set
          recording_stored_at = ${input.storedAt},
          recording_expires_at = ${expiresAt},
          recording_deleted_at = null
        where workspace_id = ${this.ws} and call_id = ${input.callId}`;
      return true;
    });
  }

  async eraseSensitiveContent(callId: string, erasedAt: string): Promise<ErasureResult> {
    return this.sql.begin((tx) => eraseSensitiveContentInTransaction(tx, this.ws, callId, erasedAt, true, true));
  }

  async purgeExpired(now: string, limit = 100): Promise<{ callsProcessed: number; transcriptsErased: number; recordingsErased: number }> {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return this.sql.begin(async (tx) => {
      const rows = await tx`
        select s.call_id,
               s.transcript_deleted_at is null and s.transcript_expires_at <= ${now}::timestamptz as transcript_due,
               s.recording_deleted_at is null and s.recording_expires_at <= ${now}::timestamptz as recording_due
        from call_privacy_state s
        where s.workspace_id = ${this.ws}
          and ((s.transcript_deleted_at is null and s.transcript_expires_at <= ${now}::timestamptz)
            or (s.recording_deleted_at is null and s.recording_expires_at <= ${now}::timestamptz))
        order by least(
          coalesce(s.transcript_expires_at, 'infinity'::timestamptz),
          coalesce(s.recording_expires_at, 'infinity'::timestamptz)
        )
        limit ${boundedLimit}
        for update skip locked`;

      let transcriptsErased = 0;
      let recordingsErased = 0;
      for (const row of rows) {
        const result = await eraseSensitiveContentInTransaction(
          tx,
          this.ws,
          str(row.call_id),
          now,
          row.transcript_due === true,
          row.recording_due === true
        );
        if (result.transcriptErased) transcriptsErased += 1;
        if (result.recordingErased) recordingsErased += 1;
      }
      return { callsProcessed: rows.length, transcriptsErased, recordingsErased };
    });
  }

  private async stateIn(tx: Tx, callId: string): Promise<CallPrivacyState | null> {
    const [row] = await tx`
      select * from call_privacy_state
      where workspace_id = ${this.ws} and call_id = ${callId}`;
    return row ? toState(row) : null;
  }
}

export async function eraseSensitiveContentInTransaction(
  tx: Tx,
  workspaceId: string,
  callId: string,
  erasedAt: string,
  eraseTranscript: boolean,
  eraseRecording: boolean
): Promise<ErasureResult> {
  const [call] = await tx`
    select id, conversation_id, recording_url
    from calls
    where workspace_id = ${workspaceId} and id = ${callId}
    for update`;
  if (!call) return { found: false, transcriptErased: false, recordingErased: false };

  let transcriptErased = false;
  let recordingErased = false;
  if (eraseTranscript) {
    const removed = await tx`
      delete from conversation_messages m
      using conversations c
      where m.conversation_id = c.id and c.id = ${str(call.conversation_id)}
        and c.workspace_id = ${workspaceId}
      returning m.conversation_id`;
    const changed = await tx`
      update conversations set summary = '', transcript_preview = ''
      where id = ${str(call.conversation_id)} and workspace_id = ${workspaceId}
        and (summary <> '' or transcript_preview <> '')
      returning id`;
    transcriptErased = removed.length > 0 || changed.length > 0;
    await tx`
      update call_privacy_state set transcript_deleted_at = ${erasedAt}
      where workspace_id = ${workspaceId} and call_id = ${callId}`;
  }

  if (eraseRecording) {
    recordingErased = call.recording_url != null;
    await tx`
      update calls set recording_url = null, recording_duration_sec = null
      where workspace_id = ${workspaceId} and id = ${callId}`;
    await tx`
      update call_privacy_state set recording_deleted_at = ${erasedAt}
      where workspace_id = ${workspaceId} and call_id = ${callId}`;
  }

  return { found: true, transcriptErased, recordingErased };
}

function assertRecordingInput(url: string, durationSec: number): void {
  if (!Number.isInteger(durationSec) || durationSec < 0) throw new Error("invalid_recording_duration");
  if (url.length > 2048) throw new Error("invalid_recording_url");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid_recording_url");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid_recording_url");
}

function toPolicy(row: Row): WorkspacePrivacyPolicy {
  return {
    recordingMode: str(row.recording_mode) as RecordingMode,
    transcriptRetentionDays: num(row.transcript_retention_days),
    recordingRetentionDays: num(row.recording_retention_days),
    consentNotice: str(row.consent_notice),
    policyVersion: num(row.policy_version),
    updatedAt: iso(row.updated_at),
  };
}

function toState(row: Row): CallPrivacyState {
  return {
    callId: str(row.call_id),
    consentStatus: str(row.consent_status) as CallPrivacyState["consentStatus"],
    consentedAt: nullableIso(row.consented_at),
    withdrawnAt: nullableIso(row.withdrawn_at),
    lastConsentEventAt: nullableIso(row.last_consent_event_at),
    consentPolicyVersion: row.consent_policy_version == null ? null : num(row.consent_policy_version),
    transcriptExpiresAt: nullableIso(row.transcript_expires_at),
    recordingExpiresAt: nullableIso(row.recording_expires_at),
    transcriptDeletedAt: nullableIso(row.transcript_deleted_at),
    recordingDeletedAt: nullableIso(row.recording_deleted_at),
  };
}
