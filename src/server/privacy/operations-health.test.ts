import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import type { User } from "@/types/identity";
import { AuthorizationError } from "@/server/auth/policy";
import type { PrivacyPurgeRunSummary } from "@/server/db/repositories/privacy-maintenance";
import { classifyPrivacyOperationsHealth, readPrivacyOperationsHealth } from "./operations-health";

const NOW = new Date("2026-08-24T20:00:00.000Z");
const completed: PrivacyPurgeRunSummary = {
  runId: "pgr_healthy",
  status: "completed",
  startedAt: "2026-08-24T03:17:00.000Z",
  completedAt: "2026-08-24T03:17:00.250Z",
  durationMs: 250,
  errorCode: null,
  workspacesProcessed: 2,
  callsProcessed: 4,
  transcriptsErased: 3,
  recordingsErased: 1,
};
const released = { runId: null, leaseUntilMs: 0 };

describe("privacy operations health", () => {
  it("reports disabled mode without pretending old run state is live health", () => {
    expect(classifyPrivacyOperationsHealth("disabled", NOW, completed, released)).toMatchObject({
      state: "disabled",
      scheduleEnabled: false,
      externalAlertsConfigured: false,
    });
  });

  it("distinguishes never-run, healthy, failed, and missed schedules", () => {
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, null, released).state).toBe("never_run");
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, completed, released).state).toBe("healthy");
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, { ...completed, status: "failed", errorCode: "privacy_purge_failed" }, released).state).toBe("failed");
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, {
      ...completed,
      completedAt: "2026-08-23T07:59:59.999Z",
    }, released).state).toBe("missed");
  });

  it("treats the 36-hour freshness boundary as healthy", () => {
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, {
      ...completed,
      completedAt: "2026-08-23T08:00:00.000Z",
    }, released).state).toBe("healthy");
  });

  it("distinguishes an active lease from an expired or orphaned run", () => {
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, completed, {
      runId: "pgr_running",
      leaseUntilMs: NOW.getTime() + 60_000,
    }).state).toBe("running");
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, completed, {
      runId: "pgr_stale",
      leaseUntilMs: NOW.getTime(),
    }).state).toBe("stale");
    expect(classifyPrivacyOperationsHealth("scheduled", NOW, { ...completed, status: "running", completedAt: null }, released).state).toBe("stale");
  });

  it("rejects a non-operator before reading global maintenance state", async () => {
    const member = { platformRole: "member" } as User;
    const sql = (() => { throw new Error("database must not be reached"); }) as never;
    await expect(readPrivacyOperationsHealth(member, "disabled", NOW, sql)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
