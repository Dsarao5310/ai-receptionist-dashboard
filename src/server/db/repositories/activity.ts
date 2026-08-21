import "server-only";

import type { ActivityEvent } from "@/types";
import { newId } from "../ids";
import { iso, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * The activity stream.
 *
 * An event says what happened; it is not where current state lives. "Appointment
 * cancelled" belongs here, but whether the appointment *is* cancelled is a
 * column on the appointment, and nothing in this product reconstructs state by
 * replaying this table. Keeping that line clear is what stops the stream from
 * becoming a second, subtly different copy of the business.
 */
export class ActivityRepository extends WorkspaceScopedRepository {
  async list(limit = 200): Promise<ActivityEvent[]> {
    const rows = await this.sql`
      select e.*, c.name as customer_name
      from activity_events e
      left join customers c on c.id = e.customer_id
      where e.workspace_id = ${this.ws}
      order by e.occurred_at desc
      limit ${limit}`;
    return rows.map(toActivityEvent);
  }

  async record(input: {
    type: ActivityEvent["type"];
    occurredAt: Date;
    customerId: string | null;
    channel: ActivityEvent["channel"];
    summary: string;
    detail: string;
    conversationId?: string | null;
    callId?: string | null;
    appointmentId?: string | null;
  }): Promise<string> {
    const id = newId("act");
    await this.sql`
      insert into activity_events
        (id, workspace_id, type, occurred_at, customer_id, channel, summary, detail,
         conversation_id, call_id, appointment_id)
      values
        (${id}, ${this.ws}, ${input.type}, ${input.occurredAt}, ${input.customerId},
         ${input.channel}, ${input.summary}, ${input.detail},
         ${input.conversationId ?? null}, ${input.callId ?? null}, ${input.appointmentId ?? null})`;
    return id;
  }
}

function toActivityEvent(row: Row): ActivityEvent {
  return {
    id: str(row.id),
    type: str(row.type) as ActivityEvent["type"],
    timestamp: iso(row.occurred_at),
    customerId: str(row.customer_id),
    customerName: str(row.customer_name),
    channel: str(row.channel) as ActivityEvent["channel"],
    summary: str(row.summary),
    detail: str(row.detail),
    conversationId: row.conversation_id ? str(row.conversation_id) : undefined,
    callId: row.call_id ? str(row.call_id) : undefined,
    appointmentId: row.appointment_id ? str(row.appointment_id) : undefined,
  };
}
