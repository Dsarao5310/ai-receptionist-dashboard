import "server-only";

import type { Sql } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { newId } from "@/server/db/ids";
import { CallPrivacyRepository } from "@/server/db/repositories/call-privacy";
import {
  PrivacyMaintenanceRepository,
  type PurgeRunCounts,
} from "@/server/db/repositories/privacy-maintenance";

const DEFAULT_MAX_WORKSPACES = 10;
const DEFAULT_CALLS_PER_WORKSPACE = 25;
const DEFAULT_LEASE_MS = 10 * 60_000;

export type PrivacyPurgeRunResult =
  | ({ status: "completed"; runId: string } & PurgeRunCounts)
  | { status: "skipped"; reason: "lease_held" }
  | ({ status: "failed"; runId: string; errorCode: "privacy_purge_failed" } & PurgeRunCounts);

interface SchedulerOptions {
  sql?: Sql;
  now?: Date;
  clock?: () => Date;
  maxWorkspaces?: number;
  callsPerWorkspace?: number;
  leaseMs?: number;
  /** Test seam for a deterministic failure; production always uses the repository. */
  purgeWorkspace?: (
    workspaceId: string,
    now: string,
    limit: number
  ) => Promise<{ callsProcessed: number; transcriptsErased: number; recordingsErased: number }>;
}

export async function runPrivacyPurge(options: SchedulerOptions = {}): Promise<PrivacyPurgeRunResult> {
  const sql = options.sql ?? getDb();
  const started = options.now ?? new Date();
  const clock = options.clock ?? (() => new Date());
  const startedAt = started.toISOString();
  const runId = newId("pgr");
  const maxWorkspaces = boundedInteger(options.maxWorkspaces, DEFAULT_MAX_WORKSPACES, 1, 50);
  const callsPerWorkspace = boundedInteger(options.callsPerWorkspace, DEFAULT_CALLS_PER_WORKSPACE, 1, 100);
  const leaseMs = boundedInteger(options.leaseMs, DEFAULT_LEASE_MS, 60_000, 30 * 60_000);
  const maintenance = new PrivacyMaintenanceRepository(sql);
  const counts: PurgeRunCounts = {
    workspacesProcessed: 0,
    callsProcessed: 0,
    transcriptsErased: 0,
    recordingsErased: 0,
  };

  try {
    const acquired = await maintenance.startRun(
      runId,
      startedAt,
      new Date(started.getTime() + leaseMs).toISOString()
    );
    if (!acquired) return { status: "skipped", reason: "lease_held" };

    const workspaceIds = await maintenance.dueWorkspaceIds(startedAt, maxWorkspaces);
    for (const workspaceId of workspaceIds) {
      const result = options.purgeWorkspace
        ? await options.purgeWorkspace(workspaceId, startedAt, callsPerWorkspace)
        : await new CallPrivacyRepository(sql, workspaceId).purgeExpired(startedAt, callsPerWorkspace);
      counts.workspacesProcessed += 1;
      counts.callsProcessed += result.callsProcessed;
      counts.transcriptsErased += result.transcriptsErased;
      counts.recordingsErased += result.recordingsErased;
    }

    const completed = clock();
    await maintenance.completeRun(runId, completed.toISOString(), durationMs(started, completed), counts);
    return { status: "completed", runId, ...counts };
  } catch {
    const completed = clock();
    try {
      await maintenance.failRun(runId, completed.toISOString(), durationMs(started, completed), counts);
    } catch {
      // The lease expires even if the database cannot record/release it. Never
      // replace a safe error with raw database detail.
    }
    return { status: "failed", runId, errorCode: "privacy_purge_failed", ...counts };
  }
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isInteger(value) && value! >= min && value! <= max ? value! : fallback;
}

function durationMs(started: Date, completed: Date): number {
  return Math.max(0, Math.min(2_147_483_647, completed.getTime() - started.getTime()));
}
