import "server-only";

import type { Channel, Customer } from "@/types";
import { newId } from "../ids";
import { iso, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Customers, with their summary figures derived rather than stored.
 *
 * `totalAppointments`, `upcomingAppointmentId`, `lastInteraction` and
 * `lastChannel` are not columns. They were, in an earlier shape of this
 * product, and they went stale: cancelling an appointment left a count saying
 * otherwise, and a customer's "next appointment" outlived the appointment
 * itself. Each is a question the appointment and conversation tables can answer
 * exactly, so they are answered on read.
 *
 * The cost is one join-heavy query instead of a plain select. The benefit is
 * that these numbers cannot disagree with the records they describe — there is
 * only one copy of the truth, so there is nothing to keep in step.
 */
export class CustomerRepository extends WorkspaceScopedRepository {
  /**
   * Every customer with their derived summary.
   *
   * Cancelled appointments are excluded from the totals and from "upcoming",
   * because a customer with one cancelled booking has had no appointments and
   * has none coming.
   */
  async list(now: Date): Promise<Customer[]> {
    return this.select(now, null);
  }

  async findById(id: string, now: Date = new Date()): Promise<Customer | null> {
    const [customer] = await this.select(now, id);
    return customer ?? null;
  }

  private async select(now: Date, onlyId: string | null): Promise<Customer[]> {
    const rows = await this.sql`
      with appointment_summary as (
        select
          customer_id,
          count(*) filter (where status <> 'cancelled')                            as total,
          min(scheduled_start) filter (
            where status <> 'cancelled' and scheduled_start >= ${now}
          )                                                                        as next_start
        from appointments
        where workspace_id = ${this.ws}
        group by customer_id
      ),
      next_appointment as (
        select distinct on (a.customer_id) a.customer_id, a.id
        from appointments a
        join appointment_summary s
          on s.customer_id = a.customer_id and s.next_start = a.scheduled_start
        where a.workspace_id = ${this.ws} and a.status <> 'cancelled'
        order by a.customer_id, a.scheduled_start
      ),
      last_contact as (
        select distinct on (customer_id) customer_id, started_at, channel
        from conversations
        where workspace_id = ${this.ws} and customer_id is not null
        order by customer_id, started_at desc
      )
      select
        c.*,
        coalesce(s.total, 0)              as total_appointments,
        n.id                              as upcoming_appointment_id,
        coalesce(l.started_at, c.created_at) as last_interaction,
        coalesce(l.channel, 'voice')      as last_channel
      from customers c
      left join appointment_summary s on s.customer_id = c.id
      left join next_appointment   n on n.customer_id = c.id
      left join last_contact       l on l.customer_id = c.id
      where c.workspace_id = ${this.ws}
        and c.archived_at is null
        and (${onlyId}::text is null or c.id = ${onlyId})
      order by c.created_at desc`;

    return rows.map(toCustomer);
  }

  /**
   * Find an existing customer by the contact details a caller gave.
   *
   * Used when an inbound booking arrives: the same person phoning twice should
   * be one customer with two appointments, not two customers with one each.
   * Phone and email are matched independently because a caller may give either,
   * and phone is preferred when both match different people — a number is the
   * stronger identifier on a voice channel.
   *
   * Scoped, like everything else. A phone number that exists in another
   * workspace is not this workspace's customer, and must not be found here.
   */
  async findByContact(contact: { phone?: string; email?: string }): Promise<Customer | null> {
    const phone = contact.phone?.trim() || null;
    const email = contact.email?.trim().toLowerCase() || null;
    if (!phone && !email) return null;

    const [row] = await this.sql`
      select id from customers
      where workspace_id = ${this.ws}
        and archived_at is null
        and (
          (${phone}::text is not null and phone = ${phone})
          or (${email}::text is not null and lower(email) = ${email})
        )
      order by (phone = ${phone}) desc, created_at asc
      limit 1`;

    return row ? this.findById(str(row.id)) : null;
  }

  async create(input: { name: string; phone: string; email: string; createdAt?: Date }): Promise<string> {
    const id = newId("cust");
    await this.sql`
      insert into customers (id, workspace_id, name, phone, email, created_at)
      values (${id}, ${this.ws}, ${input.name}, ${input.phone}, ${input.email},
              ${input.createdAt ?? new Date()})`;
    return id;
  }

  /**
   * Archival, not deletion.
   *
   * A customer's appointments and conversations reference them; removing the
   * row would either fail on the foreign key or, with a cascade, take a chunk
   * of the business's history with it. Neither is what "remove this contact"
   * should mean.
   */
  async archive(id: string): Promise<void> {
    await this.sql`
      update customers set archived_at = now() where id = ${id} and workspace_id = ${this.ws}`;
  }
}

function toCustomer(row: Row): Customer {
  return {
    id: str(row.id),
    name: str(row.name),
    phone: str(row.phone),
    email: str(row.email),
    lastInteraction: iso(row.last_interaction),
    lastChannel: str(row.last_channel) as Channel,
    totalAppointments: Number(row.total_appointments ?? 0),
    upcomingAppointmentId: row.upcoming_appointment_id ? str(row.upcoming_appointment_id) : undefined,
    createdAt: iso(row.created_at),
  };
}
