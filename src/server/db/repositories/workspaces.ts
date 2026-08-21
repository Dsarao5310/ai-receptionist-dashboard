import "server-only";

import type { Workspace } from "@/types";
import { num, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * The workspace itself, as the admin surfaces see it: plan, flags, notes and
 * usage.
 *
 * Usage is counted, not stored. `conversationsThisPeriod` and
 * `minutesThisPeriod` are `select count(*)` and `sum(duration)` over the current
 * billing month; the plan's *included* allowances are columns, because those are
 * facts about the subscription rather than about the traffic.
 *
 * A counter column would be one more thing to increment on every write and one
 * more thing to be wrong after a failed transaction. It is not worth it at this
 * volume, and if it ever is, the right answer is a materialized rollup with a
 * refresh — not a number the application nudges by hand.
 */
export class WorkspaceRepository extends WorkspaceScopedRepository {
  async load(periodStart: Date): Promise<Workspace | null> {
    const [row] = await this.sql`
      select
        w.*,
        b.name as business_name,
        (select count(*) from conversations c
          where c.workspace_id = w.id and c.started_at >= ${periodStart})       as conversations_this_period,
        (select coalesce(sum(ca.duration_sec), 0) from calls ca
          where ca.workspace_id = w.id and ca.started_at >= ${periodStart})     as seconds_this_period
      from workspaces w
      left join business_profiles b on b.workspace_id = w.id
      where w.id = ${this.ws}`;
    return row ? toWorkspace(row) : null;
  }

  async setInternalNotes(notes: string): Promise<void> {
    await this.sql`update workspaces set internal_notes = ${notes} where id = ${this.ws}`;
  }

  /**
   * Feature flags are a small key/value document read as a whole, which is what
   * JSONB is for. The merge happens in SQL so two concurrent toggles cannot lose
   * each other's change.
   */
  async setFeatureFlag(flag: string, enabled: boolean): Promise<void> {
    await this.sql`
      update workspaces
      set feature_flags = feature_flags || ${this.sql.json({ [flag]: enabled } as never)}
      where id = ${this.ws}`;
  }
}

function toWorkspace(row: Row): Workspace {
  return {
    id: str(row.id),
    name: str(row.name),
    businessName: str(row.business_name) || str(row.name),
    tier: str(row.tier) as Workspace["tier"],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : str(row.created_at),
    featureFlags: (row.feature_flags ?? {}) as Record<string, boolean>,
    usage: {
      conversationsThisPeriod: num(row.conversations_this_period),
      conversationsIncluded: num(row.conversations_included),
      minutesThisPeriod: Math.round(num(row.seconds_this_period) / 60),
      minutesIncluded: num(row.minutes_included),
    },
    internalNotes: str(row.internal_notes),
  };
}
