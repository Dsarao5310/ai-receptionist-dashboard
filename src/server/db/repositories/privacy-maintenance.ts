import "server-only";

import { iso, nullableIso, nullableStr, num, str } from "./base";
import type { Sql } from "../client";

export interface PurgeRunCounts {
  workspacesProcessed: number;
  callsProcessed: number;
  transcriptsErased: number;
  recordingsErased: number;
}

export interface PrivacyPurgeRunSummary extends PurgeRunCounts {
  runId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
}

/**
 * System-owned privacy maintenance state.
 *
 * This is deliberately not part of `workspaceScope`: a cron execution has no
 * user membership and must discover only tenant ids that currently have due
 * privacy state. The ids never leave this server module or enter the run ledger.
 */
export class PrivacyMaintenanceRepository {
  constructor(private readonly sql: Sql) {}

  async startRun(runId: string, startedAt: string, leaseUntil: string): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const claimed = await tx`
        update privacy_purge_lease set run_id = ${runId}, lease_until = ${leaseUntil}
        where id = 'global' and lease_until <= ${startedAt}::timestamptz
        returning id`;
      if (claimed.length === 0) return false;
      await tx`
        insert into privacy_purge_runs (id, status, started_at)
        values (${runId}, 'running', ${startedAt})`;
      return true;
    });
  }

  async dueWorkspaceIds(now: string, limit: number): Promise<string[]> {
    const rows = await this.sql`
      select workspace_id,
             min(least(
               coalesce(transcript_expires_at, 'infinity'::timestamptz),
               coalesce(recording_expires_at, 'infinity'::timestamptz)
             )) as first_due
      from call_privacy_state
      where (transcript_deleted_at is null and transcript_expires_at <= ${now}::timestamptz)
         or (recording_deleted_at is null and recording_expires_at <= ${now}::timestamptz)
      group by workspace_id
      order by first_due, workspace_id
      limit ${limit}`;
    return rows.map((row) => str(row.workspace_id));
  }

  async completeRun(runId: string, completedAt: string, durationMs: number, counts: PurgeRunCounts): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        update privacy_purge_runs set
          status = 'completed', completed_at = ${completedAt}, duration_ms = ${durationMs},
          workspaces_processed = ${counts.workspacesProcessed},
          calls_processed = ${counts.callsProcessed},
          transcripts_erased = ${counts.transcriptsErased},
          recordings_erased = ${counts.recordingsErased}
        where id = ${runId} and status = 'running'`;
      await tx`
        update privacy_purge_lease set run_id = null, lease_until = 'epoch'::timestamptz
        where id = 'global' and run_id = ${runId}`;
    });
  }

  async failRun(runId: string, completedAt: string, durationMs: number, counts: PurgeRunCounts): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        update privacy_purge_runs set
          status = 'failed', completed_at = ${completedAt}, duration_ms = ${durationMs},
          workspaces_processed = ${counts.workspacesProcessed},
          calls_processed = ${counts.callsProcessed},
          transcripts_erased = ${counts.transcriptsErased},
          recordings_erased = ${counts.recordingsErased},
          error_code = 'privacy_purge_failed'
        where id = ${runId} and status = 'running'`;
      await tx`
        update privacy_purge_lease set run_id = null, lease_until = 'epoch'::timestamptz
        where id = 'global' and run_id = ${runId}`;
    });
  }

  async findRun(runId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.sql`select * from privacy_purge_runs where id = ${runId}`;
    return row ?? null;
  }

  async latestRun(): Promise<PrivacyPurgeRunSummary | null> {
    const [row] = await this.sql`
      select id, status, started_at, completed_at, duration_ms, error_code,
             workspaces_processed, calls_processed, transcripts_erased, recordings_erased
      from privacy_purge_runs
      order by started_at desc, id desc
      limit 1`;
    if (!row) return null;
    return {
      runId: str(row.id),
      status: str(row.status) as PrivacyPurgeRunSummary["status"],
      startedAt: iso(row.started_at),
      completedAt: nullableIso(row.completed_at),
      durationMs: row.duration_ms == null ? null : num(row.duration_ms),
      errorCode: nullableStr(row.error_code),
      workspacesProcessed: num(row.workspaces_processed),
      callsProcessed: num(row.calls_processed),
      transcriptsErased: num(row.transcripts_erased),
      recordingsErased: num(row.recordings_erased),
    };
  }

  async runningLease(): Promise<{ runId: string | null; leaseUntilMs: number }> {
    const [row] = await this.sql`select run_id, lease_until from privacy_purge_lease where id = 'global'`;
    const leaseUntil = row?.lease_until;
    return {
      runId: row?.run_id == null ? null : str(row.run_id),
      leaseUntilMs: leaseUntil instanceof Date ? leaseUntil.getTime() : new Date(String(leaseUntil)).getTime(),
    };
  }
}
