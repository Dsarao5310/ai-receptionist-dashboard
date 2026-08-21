import "server-only";

import type { AppNotification } from "@/types";
import { newId } from "../ids";
import { bool, iso, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Notifications, scoped to the workspace they concern.
 *
 * `timestamp` is an instant, not a phrase. The previous client-side version
 * stored strings like "2 min ago" — true when written and wrong a minute later.
 * The relative phrasing is now produced at render time from `created_at`, in the
 * business timezone.
 */
export class NotificationRepository extends WorkspaceScopedRepository {
  async list(limit = 50): Promise<AppNotification[]> {
    const rows = await this.sql`
      select * from notifications
      where workspace_id = ${this.ws}
      order by created_at desc
      limit ${limit}`;
    return rows.map(toNotification);
  }

  async markRead(id: string): Promise<void> {
    await this.sql`
      update notifications set read = true where id = ${id} and workspace_id = ${this.ws}`;
  }

  async markAllRead(): Promise<void> {
    await this.sql`
      update notifications set read = true where workspace_id = ${this.ws} and read = false`;
  }

  async create(input: {
    title: string;
    description: string;
    severity: AppNotification["severity"];
    critical?: boolean;
    read?: boolean;
    relatedType?: AppNotification["relatedType"];
    relatedId?: string;
    createdAt?: Date;
  }): Promise<string> {
    const id = newId("ntf");
    await this.sql`
      insert into notifications
        (id, workspace_id, title, description, severity, read, critical, related_type, related_id, created_at)
      values
        (${id}, ${this.ws}, ${input.title}, ${input.description}, ${input.severity},
         ${input.read ?? false}, ${input.critical ?? false},
         ${input.relatedType ?? null}, ${input.relatedId ?? null}, ${input.createdAt ?? new Date()})`;
    return id;
  }
}

function toNotification(row: Row): AppNotification {
  return {
    id: str(row.id),
    title: str(row.title),
    description: str(row.description),
    severity: str(row.severity) as AppNotification["severity"],
    timestamp: iso(row.created_at),
    read: bool(row.read),
    critical: bool(row.critical),
    relatedType: row.related_type ? (str(row.related_type) as AppNotification["relatedType"]) : undefined,
    relatedId: row.related_id ? str(row.related_id) : undefined,
  };
}
