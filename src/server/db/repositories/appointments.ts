import "server-only";

import type { Appointment, ServiceSnapshot } from "@/types";
import { wallClockToInstant } from "@/lib/timezone";
import { newId } from "../ids";
import { dateOnly, iso, num, str, timeOnly, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Appointments — the table where two of this product's rules are enforced.
 *
 * ── The snapshot is history and is never regenerated ────────────────────────
 * `service_name`, `service_price_model`, `service_price` and
 * `service_duration_min` are written once, when the appointment is created, and
 * no method here updates them. Renaming a service, repricing it, changing its
 * duration or deleting it outright leaves every past booking saying exactly what
 * the customer agreed to. `service_id` is the live link to the catalogue and is
 * allowed to become null; the snapshot is not.
 *
 * Nothing in this file reads the `services` table. That is the guarantee, and
 * it is easy to check: a query that joined the catalogue to fill in a name would
 * be the bug.
 *
 * ── Wall clock is authoritative, the instant is derived ─────────────────────
 * `scheduled_date` and `scheduled_time` are the booking: "the 18th at 10:00, in
 * this business's timezone". `scheduled_start` and `scheduled_end` are the same
 * moment as an absolute instant, computed here from the workspace's timezone so
 * that ordering, range filters and analytics buckets are correct across zones
 * and DST boundaries.
 *
 * They are derived in this one place. `recomputeInstants` exists because a
 * business that changes its timezone changes what its wall clocks mean, and the
 * derived column has to follow — otherwise the two representations quietly
 * disagree, which is the failure mode that having two representations invites.
 */
export class AppointmentRepository extends WorkspaceScopedRepository {
  async list(): Promise<Appointment[]> {
    const rows = await this.sql`
      select a.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      from appointments a
      join customers c on c.id = a.customer_id
      where a.workspace_id = ${this.ws}
      order by a.scheduled_start desc`;
    return rows.map(toAppointment);
  }

  /**
   * One appointment, scoped.
   *
   * An id from another tenant returns null — not because ownership is checked
   * afterwards, but because the query never looked outside this workspace. The
   * caller cannot tell "not yours" from "not there", which is the intended
   * answer to both.
   */
  async findById(id: string): Promise<Appointment | null> {
    const [row] = await this.sql`
      select a.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      from appointments a
      join customers c on c.id = a.customer_id
      where a.id = ${id} and a.workspace_id = ${this.ws}`;
    return row ? toAppointment(row) : null;
  }

  async create(input: {
    customerId: string;
    serviceId: string | null;
    service: ServiceSnapshot;
    date: string;
    time: string;
    status: Appointment["status"];
    source: Appointment["source"];
    notes?: string;
    timezone: string;
    createdAt?: Date;
  }): Promise<string> {
    const id = newId("apt");
    const { start, end } = instants(input.date, input.time, input.service.durationMin, input.timezone);

    await this.sql`
      insert into appointments (
        id, workspace_id, customer_id, service_id,
        service_name, service_price_model, service_price, service_duration_min,
        scheduled_date, scheduled_time, scheduled_start, scheduled_end,
        status, source, notes, created_at
      ) values (
        ${id}, ${this.ws}, ${input.customerId}, ${input.serviceId},
        ${input.service.name}, ${input.service.priceModel}, ${input.service.price},
        ${input.service.durationMin},
        ${input.date}, ${input.time}, ${start}, ${end},
        ${input.status}, ${input.source}, ${input.notes ?? ""}, ${input.createdAt ?? new Date()}
      )`;
    return id;
  }

  /**
   * Move an appointment to a new wall-clock slot.
   *
   * The duration comes from the appointment's own snapshot, read back inside the
   * same statement — never from the current catalogue. A service whose duration
   * was changed after this booking must not silently lengthen it.
   */
  async reschedule(id: string, date: string, time: string, timezone: string): Promise<Appointment | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const { start, end } = instants(date, time, existing.service.durationMin, timezone);
    const [row] = await this.sql`
      update appointments set
        scheduled_date  = ${date},
        scheduled_time  = ${time},
        scheduled_start = ${start},
        scheduled_end   = ${end},
        status          = 'rescheduled'
      where id = ${id} and workspace_id = ${this.ws}
      returning id`;
    return row ? this.findById(id) : null;
  }

  async setStatus(id: string, status: Appointment["status"]): Promise<Appointment | null> {
    const [row] = await this.sql`
      update appointments set status = ${status}
      where id = ${id} and workspace_id = ${this.ws}
      returning id`;
    return row ? this.findById(id) : null;
  }

  async setNotes(id: string, notes: string): Promise<Appointment | null> {
    const [row] = await this.sql`
      update appointments set notes = ${notes}
      where id = ${id} and workspace_id = ${this.ws}
      returning id`;
    return row ? this.findById(id) : null;
  }

  /**
   * Restore a previous version of an appointment — the undo behind a cancel or
   * reschedule toast.
   *
   * Only the fields the user's action changed are put back. The snapshot is not
   * among them, because no ordinary action can alter it.
   */
  async restore(snapshot: Appointment, timezone: string): Promise<void> {
    const { start, end } = instants(snapshot.date, snapshot.time, snapshot.service.durationMin, timezone);
    await this.sql`
      update appointments set
        scheduled_date  = ${snapshot.date},
        scheduled_time  = ${snapshot.time},
        scheduled_start = ${start},
        scheduled_end   = ${end},
        status          = ${snapshot.status},
        notes           = ${snapshot.notes}
      where id = ${snapshot.id} and workspace_id = ${this.ws}`;
  }

  // ── External calendar mapping ─────────────────────────────────────────────
  //
  // The appointment id stays the identity. These columns record *where this
  // booking also appears* — a mapping that can change, vanish, or belong to a
  // calendar the business later disconnects, none of which may alter what the
  // business's own record says happened.

  /**
   * Attach (or re-attach) an external calendar event to an appointment.
   *
   * A unique index makes an external event id resolve to at most one
   * appointment, so a mis-mapped workflow or a duplicated delivery fails at the
   * database rather than silently pointing two bookings at one calendar entry.
   */
  async setProviderMapping(
    id: string,
    mapping: { provider: string; eventId: string; calendarId: string; syncedAt: Date }
  ): Promise<void> {
    await this.sql`
      update appointments set
        provider             = ${mapping.provider},
        provider_event_id    = ${mapping.eventId},
        provider_calendar_id = ${mapping.calendarId},
        provider_sync_state  = 'synced',
        provider_synced_at   = ${mapping.syncedAt},
        provider_sync_detail = null
      where id = ${id} and workspace_id = ${this.ws}`;
  }

  /**
   * Record that this appointment and the calendar may disagree.
   *
   * `detail` is one safe sentence for an operator — never a provider payload.
   * The mapping is left in place: knowing *which* event is out of step is the
   * whole basis of reconciling it.
   */
  async setSyncState(
    id: string,
    state: "synced" | "pending" | "sync_required" | "error" | "external_change_detected",
    detail: string | null,
    at: Date
  ): Promise<void> {
    await this.sql`
      update appointments set
        provider_sync_state  = ${state},
        provider_sync_detail = ${detail},
        provider_synced_at   = ${state === "synced" ? at : this.sql`provider_synced_at`}
      where id = ${id} and workspace_id = ${this.ws}`;
  }

  /**
   * Find the appointment an external event belongs to.
   *
   * Scoped, so an event id from another tenant's calendar resolves to nothing —
   * the same guarantee `findById` gives, for the same reason.
   */
  async findByProviderEvent(eventId: string): Promise<Appointment | null> {
    const [row] = await this.sql`
      select a.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      from appointments a
      join customers c on c.id = a.customer_id
      where a.provider_event_id = ${eventId} and a.workspace_id = ${this.ws}`;
    return row ? toAppointment(row) : null;
  }

  /** Appointments whose calendar state needs a person to look at it. */
  async listNeedingSync(limit = 50): Promise<(Appointment & { syncDetail: string | null; calendarId: string | null; eventId: string | null })[]> {
    const rows = await this.sql`
      select a.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      from appointments a
      join customers c on c.id = a.customer_id
      where a.workspace_id = ${this.ws}
        and a.provider_sync_state in ('sync_required','error','external_change_detected')
      order by a.scheduled_start desc
      limit ${limit}`;

    return rows.map((row) => ({
      ...toAppointment(row),
      syncDetail: row.provider_sync_detail ? str(row.provider_sync_detail) : null,
      calendarId: row.provider_calendar_id ? str(row.provider_calendar_id) : null,
      eventId: row.provider_event_id ? str(row.provider_event_id) : null,
    }));
  }

  /** The mapping for one appointment. Admin and orchestration paths only. */
  async providerMapping(id: string): Promise<{ eventId: string | null; calendarId: string | null }> {
    const [row] = await this.sql`
      select provider_event_id, provider_calendar_id from appointments
      where id = ${id} and workspace_id = ${this.ws}`;
    return {
      eventId: row?.provider_event_id ? str(row.provider_event_id) : null,
      calendarId: row?.provider_calendar_id ? str(row.provider_calendar_id) : null,
    };
  }

  /**
   * Rewrite every derived instant in this workspace for a new timezone.
   *
   * Called when the business profile's timezone changes. The wall clocks stay
   * as they are — a 10:00 appointment is still at 10:00 — but 10:00 now names a
   * different moment, and the columns that describe that moment have to say so.
   */
  async recomputeInstants(timezone: string): Promise<number> {
    const rows = await this.sql`
      select id, scheduled_date, scheduled_time, service_duration_min
      from appointments where workspace_id = ${this.ws}`;

    if (rows.length === 0) return 0;

    await this.sql.begin(async (tx) => {
      for (const row of rows) {
        const { start, end } = instants(
          dateOnly(row.scheduled_date),
          timeOnly(row.scheduled_time),
          num(row.service_duration_min),
          timezone
        );
        await tx`
          update appointments set scheduled_start = ${start}, scheduled_end = ${end}
          where id = ${str(row.id)} and workspace_id = ${this.ws}`;
      }
    });
    return rows.length;
  }
}

/** The one place a wall clock becomes an instant. */
function instants(date: string, time: string, durationMin: number, timezone: string) {
  const start = wallClockToInstant(date, time, timezone);
  return { start, end: new Date(start.getTime() + durationMin * 60_000) };
}

function toAppointment(row: Row): Appointment {
  return {
    id: str(row.id),
    customerId: str(row.customer_id),
    customerName: str(row.customer_name),
    customerPhone: str(row.customer_phone),
    customerEmail: str(row.customer_email),
    serviceId: row.service_id ? str(row.service_id) : null,
    service: {
      name: str(row.service_name),
      priceModel: str(row.service_price_model) as ServiceSnapshot["priceModel"],
      price: num(row.service_price),
      durationMin: num(row.service_duration_min),
    },
    date: dateOnly(row.scheduled_date),
    time: timeOnly(row.scheduled_time),
    source: str(row.source) as Appointment["source"],
    status: str(row.status) as Appointment["status"],
    syncState: row.provider_sync_state ? (str(row.provider_sync_state) as Appointment["syncState"]) : null,
    notes: str(row.notes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
