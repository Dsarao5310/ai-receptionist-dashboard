import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import type { User } from "@/types/identity";
import { AuthorizationError, authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import type { Sql } from "@/server/db/client";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import { updateWorkspacePrivacyPolicy, validatePrivacyPolicy } from "./service";
import {
  createErasureRequest,
  executeErasureRequest,
  listErasureRequests,
  rejectErasureRequest,
  verifyErasureRequestIdentity,
} from "./erasure-requests";
import { runPrivacyPurge } from "./scheduler";
import { PrivacyMaintenanceRepository } from "@/server/db/repositories/privacy-maintenance";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-24T20:00:00.000Z");
const describeDb = hasDatabase ? describe : describe.skip;

let sql: Sql;
let identities: PostgresIdentityRepository;
let ownerA: AuthContext;
let managerA: AuthContext;
let staffA: AuthContext;
let ownerB: AuthContext;
let callsA: string[];

beforeAll(async () => {
  if (!hasDatabase) return;
  await resetTestDatabase(NOW);
  sql = testDb();
  identities = new PostgresIdentityRepository(sql);
  [ownerA, managerA, staffA, ownerB] = await Promise.all([
    contextFor("alex@coastalbloom.example", DEV_WORKSPACE_A),
    contextFor("marcus@coastalbloom.example", DEV_WORKSPACE_A),
    contextFor("nina@coastalbloom.example", DEV_WORKSPACE_A),
    contextFor("priya@harbourdental.example", DEV_WORKSPACE_B),
  ]);
  callsA = (await sql`
    select c.id from calls c
    join conversations co on co.id = c.conversation_id
    where c.workspace_id = ${DEV_WORKSPACE_A} and co.summary <> ''
    order by c.started_at desc
    limit 6`).map((row) => String(row.id));
  if (callsA.length < 5) throw new Error("privacy fixtures require five calls");
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

async function contextFor(email: string, workspaceId: string): Promise<AuthContext> {
  const user = await identities.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return authorizeWorkspace(user as User, workspaceId, identities);
}

describe("privacy policy validation", () => {
  it("requires meaningful notice text before explicit-consent mode", () => {
    expect(() => validatePrivacyPolicy({
      recordingMode: "explicit_consent",
      transcriptRetentionDays: 30,
      recordingRetentionDays: 7,
      consentNotice: "Too short",
    })).toThrow("invalid_consent_notice");
  });

  it("enforces bounded retention", () => {
    expect(() => validatePrivacyPolicy({
      recordingMode: "disabled",
      transcriptRetentionDays: 366,
      recordingRetentionDays: 7,
      consentNotice: "",
    })).toThrow("invalid_transcript_retention");
  });
});

describeDb("call privacy lifecycle", () => {
  it("starts fail closed and limits raw transcript access", async () => {
    const policy = await workspaceScope(ownerA, sql).privacy.getPolicy();
    expect(policy).toMatchObject({
      recordingMode: "disabled",
      transcriptRetentionDays: 90,
      recordingRetentionDays: 30,
      consentNotice: "",
      policyVersion: 1,
    });
    await expect(workspaceScope(ownerA, sql).privacy.recordConsent({
      eventId: "cns_privacy_disabled_grant",
      callId: callsA[0],
      decision: "granted",
      source: "voice",
      occurredAt: NOW.toISOString(),
    })).rejects.toThrow("recording_disabled");
    expect(await workspaceScope(ownerA, sql).privacy.storeRecording({
      callId: callsA[0],
      recordingUrl: "https://recordings.example/private/disabled",
      durationSec: 30,
      storedAt: NOW.toISOString(),
    })).toBe(false);

    const ownerCall = (await workspaceScope(ownerA, sql).calls.list()).find((call) => call.id === callsA[0]);
    const staffCall = (await workspaceScope(staffA, sql).calls.list()).find((call) => call.id === callsA[0]);
    expect(ownerCall?.transcript.length).toBeGreaterThan(0);
    expect(ownerCall?.summary).not.toBe("");
    expect(staffCall?.transcript).toEqual([]);
    expect(staffCall?.summary).toBe("");
    expect(JSON.stringify(ownerCall)).not.toContain("recording_url");
    expect(JSON.stringify(ownerCall)).not.toContain("recordingUrl");
  });

  it("allows only an owner or operator to change policy", async () => {
    const input = {
      recordingMode: "explicit_consent" as const,
      transcriptRetentionDays: 30,
      recordingRetentionDays: 7,
      consentNotice: "This call may be recorded only if you explicitly agree.",
    };
    await expect(updateWorkspacePrivacyPolicy(managerA, input, sql)).rejects.toBeInstanceOf(AuthorizationError);

    const updated = await updateWorkspacePrivacyPolicy(ownerA, input, sql);
    expect(updated).toMatchObject({ ...input, policyVersion: 2 });
    const [audit] = await sql`
      select action, actor_user_id, metadata from audit_events
      where workspace_id = ${DEV_WORKSPACE_A} and action = 'privacy.policy_changed'
      order by occurred_at desc limit 1`;
    expect(audit?.actor_user_id).toBe(ownerA.user.id);
    expect(audit?.metadata).not.toHaveProperty("consentNotice");
  });

  it("refuses recording storage until explicit consent and never exposes its locator", async () => {
    const privacy = workspaceScope(ownerA, sql).privacy;
    expect(await privacy.storeRecording({
      callId: callsA[1],
      recordingUrl: "https://recordings.example/private/call-1",
      durationSec: 45,
      storedAt: NOW.toISOString(),
    })).toBe(false);

    const state = await privacy.recordConsent({
      eventId: "cns_privacy_test_grant",
      callId: callsA[1],
      decision: "granted",
      source: "voice",
      occurredAt: NOW.toISOString(),
    });
    expect(state?.consentStatus).toBe("granted");
    expect(state?.consentPolicyVersion).toBe(2);

    expect(await privacy.storeRecording({
      callId: callsA[1],
      recordingUrl: "https://recordings.example/private/call-1",
      durationSec: 45,
      storedAt: NOW.toISOString(),
    })).toBe(true);
    const [stored] = await sql`
      select recording_url from calls
      where workspace_id = ${DEV_WORKSPACE_A} and id = ${callsA[1]}`;
    expect(stored?.recording_url).toBe("https://recordings.example/private/call-1");

    const clientCall = (await workspaceScope(ownerA, sql).calls.list()).find((call) => call.id === callsA[1]);
    expect(JSON.stringify(clientCall)).not.toContain("recordings.example");
  });

  it("withdrawal immediately erases transcript and recording content", async () => {
    const privacy = workspaceScope(ownerA, sql).privacy;
    const state = await privacy.recordConsent({
      eventId: "cns_privacy_test_withdraw",
      callId: callsA[1],
      decision: "withdrawn",
      source: "voice",
      occurredAt: "2026-08-24T20:05:00.000Z",
    });
    expect(state?.consentStatus).toBe("withdrawn");
    expect(state?.transcriptDeletedAt).toBe("2026-08-24T20:05:00.000Z");
    expect(state?.recordingDeletedAt).toBe("2026-08-24T20:05:00.000Z");

    const afterDelayedGrant = await privacy.recordConsent({
      eventId: "cns_privacy_test_delayed_grant",
      callId: callsA[1],
      decision: "granted",
      source: "voice",
      occurredAt: "2026-08-24T20:04:00.000Z",
    });
    expect(afterDelayedGrant?.consentStatus).toBe("withdrawn");
    expect(await privacy.storeRecording({
      callId: callsA[1],
      recordingUrl: "https://recordings.example/private/late",
      durationSec: 45,
      storedAt: "2026-08-24T20:06:00.000Z",
    })).toBe(false);

    const [row] = await sql`
      select ca.recording_url, co.summary, co.transcript_preview,
             (select count(*)::int from conversation_messages m where m.conversation_id = co.id) as message_count
      from calls ca join conversations co on co.id = ca.conversation_id
      where ca.workspace_id = ${DEV_WORKSPACE_A} and ca.id = ${callsA[1]}`;
    expect(row).toMatchObject({ recording_url: null, summary: "", transcript_preview: "", message_count: 0 });
    await expect(sql`
      update call_consent_events set decision = 'denied'
      where id = 'cns_privacy_test_grant'`).rejects.toBeDefined();
  });

  it("requires a tenant-scoped identity-verified request before explicit erasure", async () => {
    const createInput = {
      callId: callsA[2],
      requestReference: "CASE-2026-001",
      createdAt: NOW.toISOString(),
    };
    await expect(createErasureRequest(managerA, createInput, sql)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await createErasureRequest(ownerB, createInput, sql)).toBeNull();

    const request = await createErasureRequest(ownerA, createInput, sql);
    expect(request).toMatchObject({ callId: callsA[2], status: "pending_identity" });
    if (!request) throw new Error("erasure request missing");

    const replay = await createErasureRequest(ownerA, { ...createInput, requestReference: "CASE-2026-RETRY" }, sql);
    expect(replay).toEqual(request);
    await expect(executeErasureRequest(ownerA, {
      requestId: request.id,
      confirmation: `ERASE ${request.id}`,
      completedAt: NOW.toISOString(),
    }, sql)).rejects.toThrow("invalid_erasure_request_state");

    await expect(verifyErasureRequestIdentity(managerA, {
      requestId: request.id,
      method: "callback_to_record",
      verifiedAt: NOW.toISOString(),
    }, sql)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await verifyErasureRequestIdentity(ownerB, {
      requestId: request.id,
      method: "callback_to_record",
      verifiedAt: NOW.toISOString(),
    }, sql)).toBeNull();

    const verified = await verifyErasureRequestIdentity(ownerA, {
      requestId: request.id,
      method: "callback_to_record",
      verifiedAt: NOW.toISOString(),
    }, sql);
    expect(verified).toMatchObject({ status: "verified", identityVerificationMethod: "callback_to_record" });
    await expect(executeErasureRequest(ownerA, {
      requestId: request.id,
      confirmation: "ERASE wrong-request",
      completedAt: NOW.toISOString(),
    }, sql)).rejects.toThrow("invalid_erasure_confirmation");

    const completed = await executeErasureRequest(ownerA, {
      requestId: request.id,
      confirmation: `ERASE ${request.id}`,
      completedAt: NOW.toISOString(),
    }, sql);
    expect(completed).toMatchObject({ status: "completed", transcriptErased: true });
    expect(await executeErasureRequest(ownerA, {
      requestId: request.id,
      confirmation: `ERASE ${request.id}`,
      completedAt: "2026-08-24T20:01:00.000Z",
    }, sql)).toEqual(completed);

    const [call] = await sql`
      select ca.recording_url, co.summary, co.transcript_preview,
             (select count(*)::int from conversation_messages m where m.conversation_id = co.id) as message_count
      from calls ca join conversations co on co.id = ca.conversation_id
      where ca.workspace_id = ${DEV_WORKSPACE_A} and ca.id = ${callsA[2]}`;
    expect(call).toMatchObject({ recording_url: null, summary: "", transcript_preview: "", message_count: 0 });

    const audits = await sql`
      select action, actor_user_id, target_id, metadata from audit_events
      where workspace_id = ${DEV_WORKSPACE_A}
        and action in ('privacy.erasure_requested','privacy.erasure_identity_verified','privacy.content_erased')
        and (target_id = ${request.id} or target_id = ${callsA[2]})
      order by occurred_at`;
    expect(audits.map((row) => row.action)).toEqual([
      "privacy.erasure_requested",
      "privacy.erasure_identity_verified",
      "privacy.content_erased",
    ]);
    expect(audits.every((row) => row.actor_user_id === ownerA.user.id)).toBe(true);

    const [stored] = await sql`
      select * from privacy_erasure_requests
      where workspace_id = ${DEV_WORKSPACE_A} and id = ${request.id}`;
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain("@coastalbloom.example");
    expect(serialized).not.toContain("recordings.example");
    await expect(sql`delete from privacy_erasure_requests where id = ${request.id}`).rejects.toBeDefined();
  });

  it("records rejection without erasing content and refuses later completion", async () => {
    const request = await createErasureRequest(ownerA, {
      callId: callsA[0],
      requestReference: "CASE-2026-REJECT",
      createdAt: NOW.toISOString(),
    }, sql);
    if (!request) throw new Error("erasure request missing");
    const rejected = await rejectErasureRequest(ownerA, {
      requestId: request.id,
      reason: "identity_unverified",
      rejectedAt: NOW.toISOString(),
    }, sql);
    expect(rejected).toMatchObject({ status: "rejected", rejectionReasonCode: "identity_unverified" });
    await expect(executeErasureRequest(ownerA, {
      requestId: request.id,
      confirmation: `ERASE ${request.id}`,
      completedAt: NOW.toISOString(),
    }, sql)).rejects.toThrow("invalid_erasure_request_state");

    const [call] = await sql`
      select co.summary,
             (select count(*)::int from conversation_messages m where m.conversation_id = co.id) as message_count
      from calls ca join conversations co on co.id = ca.conversation_id
      where ca.workspace_id = ${DEV_WORKSPACE_A} and ca.id = ${callsA[0]}`;
    expect(call.summary).not.toBe("");
    expect(call.message_count).toBeGreaterThan(0);
  });

  it("lists only the authorized workspace's minimal request queue", async () => {
    const request = await createErasureRequest(ownerA, {
      callId: callsA[1],
      requestReference: "CASE-2026-PENDING",
      createdAt: NOW.toISOString(),
    }, sql);
    expect(request).toMatchObject({ status: "pending_identity", callId: callsA[1] });
    expect((await listErasureRequests(ownerA, sql)).some((item) => item.id === request?.id)).toBe(true);
    expect(await listErasureRequests(ownerB, sql)).toEqual([]);
    expect(JSON.stringify(request)).not.toContain("@coastalbloom.example");
  });

  it("purges only content whose bounded retention has expired", async () => {
    const callId = callsA[3];
    await sql`
      update call_privacy_state set transcript_expires_at = '2026-09-01T20:00:00.000Z'
      where workspace_id = ${DEV_WORKSPACE_A} and transcript_deleted_at is null`;
    await sql`
      update call_privacy_state set
        transcript_expires_at = '2026-08-24T19:59:00.000Z',
        transcript_deleted_at = null
      where workspace_id = ${DEV_WORKSPACE_A} and call_id = ${callId}`;
    const result = await workspaceScope(ownerA, sql).privacy.purgeExpired(NOW.toISOString(), 10);
    expect(result.callsProcessed).toBeGreaterThanOrEqual(1);
    expect(result.transcriptsErased).toBeGreaterThanOrEqual(1);

    const [call] = await sql`
      select ca.id, ca.status, co.outcome, co.appointment_id, co.summary,
             (select count(*)::int from conversation_messages m where m.conversation_id = co.id) as message_count
      from calls ca join conversations co on co.id = ca.conversation_id
      where ca.workspace_id = ${DEV_WORKSPACE_A} and ca.id = ${callId}`;
    expect(call?.id).toBe(callId);
    expect(call?.status).toBeTruthy();
    expect(call?.outcome).toBeTruthy();
    expect(call?.summary).toBe("");
    expect(call?.message_count).toBe(0);
  });

  it("runs the bounded scheduled purge and records only sanitized aggregates", async () => {
    const callId = callsA[4];
    await sql`
      update call_privacy_state set transcript_expires_at = '2026-08-24T19:59:00.000Z',
                                    transcript_deleted_at = null
      where workspace_id = ${DEV_WORKSPACE_A} and call_id = ${callId}`;

    const result = await runPrivacyPurge({
      sql,
      now: NOW,
      clock: () => new Date("2026-08-24T20:00:00.250Z"),
      maxWorkspaces: 2,
      callsPerWorkspace: 5,
    });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.callsProcessed).toBeGreaterThanOrEqual(1);
    expect(result.transcriptsErased).toBeGreaterThanOrEqual(1);

    const run = await new PrivacyMaintenanceRepository(sql).findRun(result.runId);
    expect(run).toMatchObject({
      status: "completed",
      workspaces_processed: result.workspacesProcessed,
      duration_ms: 250,
      error_code: null,
    });
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain(DEV_WORKSPACE_A);
    expect(serialized).not.toContain("recordings.example");
    expect(serialized).not.toContain("Miles Chen");
  });

  it("skips an overlapping lease and releases the lease after a normalized failure", async () => {
    await sql`
      update privacy_purge_lease set run_id = 'pgr_existing', lease_until = '2026-08-24T20:10:00.000Z'
      where id = 'global'`;
    expect(await runPrivacyPurge({ sql, now: NOW })).toEqual({ status: "skipped", reason: "lease_held" });

    await sql`
      update privacy_purge_lease set run_id = null, lease_until = 'epoch'::timestamptz
      where id = 'global'`;
    await sql`
      update call_privacy_state set transcript_expires_at = '2026-08-24T19:59:00.000Z',
                                    transcript_deleted_at = null
      where workspace_id = ${DEV_WORKSPACE_A} and call_id = ${callsA[0]}`;

    const failed = await runPrivacyPurge({
      sql,
      now: NOW,
      clock: () => new Date("2026-08-24T20:00:00.100Z"),
      purgeWorkspace: async () => {
        throw new Error("sensitive database detail that must not escape");
      },
    });
    expect(failed.status).toBe("failed");
    if (failed.status !== "failed") return;
    expect(failed.errorCode).toBe("privacy_purge_failed");
    expect(JSON.stringify(failed)).not.toContain("sensitive database detail");

    const maintenance = new PrivacyMaintenanceRepository(sql);
    expect(await maintenance.findRun(failed.runId)).toMatchObject({
      status: "failed",
      error_code: "privacy_purge_failed",
      duration_ms: 100,
    });
    expect((await maintenance.runningLease()).runId).toBeNull();
  });
});
