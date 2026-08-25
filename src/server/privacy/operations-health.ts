import "server-only";

import { isPlatformOperator } from "@/lib/permissions";
import type { User } from "@/types/identity";
import { AuthorizationError } from "@/server/auth/policy";
import { getDb, type Sql } from "@/server/db/client";
import {
  PrivacyMaintenanceRepository,
  type PrivacyPurgeRunSummary,
} from "@/server/db/repositories/privacy-maintenance";

const MISSED_AFTER_MS = 36 * 60 * 60_000;

export type PrivacyOperationsState = "disabled" | "never_run" | "healthy" | "missed" | "failed" | "running" | "stale";

export interface PrivacyOperationsHealth {
  state: PrivacyOperationsState;
  checkedAt: string;
  scheduleEnabled: boolean;
  externalAlertsConfigured: false;
  lastRun: PrivacyPurgeRunSummary | null;
  lease: { runId: string | null; leaseUntil: string | null; active: boolean; stale: boolean };
}

export async function readPrivacyOperationsHealth(
  user: User,
  mode: "disabled" | "scheduled",
  now: Date,
  sql: Sql = getDb()
): Promise<PrivacyOperationsHealth> {
  if (!isPlatformOperator(user)) throw new AuthorizationError("not_platform_operator");
  const repository = new PrivacyMaintenanceRepository(sql);
  const [lastRun, lease] = await Promise.all([repository.latestRun(), repository.runningLease()]);
  return classifyPrivacyOperationsHealth(mode, now, lastRun, lease);
}

export function classifyPrivacyOperationsHealth(
  mode: "disabled" | "scheduled",
  now: Date,
  lastRun: PrivacyPurgeRunSummary | null,
  lease: { runId: string | null; leaseUntilMs: number }
): PrivacyOperationsHealth {
  const nowMs = now.getTime();
  const leaseActive = lease.runId !== null && lease.leaseUntilMs > nowMs;
  const leaseStale = lease.runId !== null && lease.leaseUntilMs <= nowMs;
  let state: PrivacyOperationsState;

  if (mode === "disabled") state = "disabled";
  else if (leaseStale) state = "stale";
  else if (leaseActive) state = "running";
  else if (!lastRun) state = "never_run";
  else if (lastRun.status === "failed") state = "failed";
  else if (lastRun.status === "running") state = "stale";
  else if (!lastRun.completedAt || nowMs - new Date(lastRun.completedAt).getTime() > MISSED_AFTER_MS) state = "missed";
  else state = "healthy";

  return {
    state,
    checkedAt: now.toISOString(),
    scheduleEnabled: mode === "scheduled",
    externalAlertsConfigured: false,
    lastRun,
    lease: {
      runId: lease.runId,
      leaseUntil: lease.runId ? new Date(lease.leaseUntilMs).toISOString() : null,
      active: leaseActive,
      stale: leaseStale,
    },
  };
}
