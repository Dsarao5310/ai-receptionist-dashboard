import "server-only";

import type {
  AIConfiguration,
  AppConfiguration,
  BusinessIdentity,
  BusinessService,
  DayHours,
  KnowledgeEntry,
  SpecialHours,
  TimeInterval,
  Weekday,
} from "@/types";
import { WEEKDAYS } from "@/types";
import type { Tx } from "../client";
import { newId } from "../ids";
import { bool, dateOnly, num, str, timeOnly, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Business and AI configuration for one workspace.
 *
 * Reads assemble the same `AppConfiguration` document the product has always
 * worked with, so nothing above this layer had to learn a new shape. Writes are
 * narrow and named — `updateHours`, `addService` — rather than one "save the
 * document" call, because a whole-document write silently overwrites whatever
 * another tab changed in the meantime.
 *
 * Hours and special hours are replaced wholesale within a transaction. They are
 * small, ordered lists where "the third interval" has no identity worth
 * preserving; diffing them would be more code and more ways to be wrong.
 */
export class ConfigurationRepository extends WorkspaceScopedRepository {
  // ── Read ──────────────────────────────────────────────────────────────────

  /** The whole configuration document, in five scoped queries. */
  async load(): Promise<AppConfiguration | null> {
    const [profile] = await this.sql`
      select * from business_profiles where workspace_id = ${this.ws}`;
    // No profile means the workspace has not been provisioned. Returning null
    // lets the caller show a real error rather than a plausible-looking default
    // that hides a missing tenant.
    if (!profile) return null;

    const [dayRows, intervalRows, specialRows, specialIntervalRows, serviceRows, knowledgeRows, aiRows] =
      await Promise.all([
        this.sql`select * from business_hours where workspace_id = ${this.ws}`,
        this.sql`select * from business_hour_intervals where workspace_id = ${this.ws}
                 order by weekday, position`,
        this.sql`select * from special_hours where workspace_id = ${this.ws} order by on_date`,
        this.sql`select i.* from special_hour_intervals i
                 join special_hours s on s.id = i.special_hours_id
                 where s.workspace_id = ${this.ws} order by i.special_hours_id, i.position`,
        this.sql`select * from services where workspace_id = ${this.ws} order by position, created_at`,
        this.sql`select * from knowledge_entries where workspace_id = ${this.ws}
                 and deleted_at is null
                 order by position, created_at`,
        this.sql`select * from ai_configurations where workspace_id = ${this.ws}`,
      ]);

    const intervalsByDay = new Map<string, TimeInterval[]>();
    for (const row of intervalRows) {
      const day = str(row.weekday);
      const list = intervalsByDay.get(day) ?? [];
      list.push({ open: timeOnly(row.opens_at), close: timeOnly(row.closes_at) });
      intervalsByDay.set(day, list);
    }

    const openByDay = new Map(dayRows.map((r) => [str(r.weekday), bool(r.is_open)]));

    // Always seven days in weekday order, whatever the table happens to hold —
    // a missing row means "not configured", not "this day does not exist".
    const hours: DayHours[] = WEEKDAYS.map((day) => ({
      day,
      isOpen: openByDay.get(day) ?? false,
      intervals: intervalsByDay.get(day) ?? [],
    }));

    // Provisioning creates the profile and the AI row together; one without the
    // other is a broken tenant, not a tenant with defaults.
    if (!aiRows[0]) return null;

    const specialIntervals = new Map<string, TimeInterval[]>();
    for (const row of specialIntervalRows) {
      const id = str(row.special_hours_id);
      const list = specialIntervals.get(id) ?? [];
      list.push({ open: timeOnly(row.opens_at), close: timeOnly(row.closes_at) });
      specialIntervals.set(id, list);
    }

    return {
      business: toBusiness(profile),
      hours,
      specialHours: specialRows.map((row) => ({
        id: str(row.id),
        date: dateOnly(row.on_date),
        label: str(row.label),
        isClosed: bool(row.is_closed),
        intervals: specialIntervals.get(str(row.id)) ?? [],
      })),
      services: serviceRows.map(toService),
      knowledge: knowledgeRows.map(toKnowledge),
      ai: toAi(aiRows[0]),
    };
  }

  /** Just the timezone — the one field several scheduling paths need alone. */
  async timezone(): Promise<string | null> {
    const [row] = await this.sql`select timezone from business_profiles where workspace_id = ${this.ws}`;
    return row ? str(row.timezone) : null;
  }

  // ── Business identity ─────────────────────────────────────────────────────

  async updateBusiness(patch: Partial<BusinessIdentity>): Promise<void> {
    const columns: Record<string, string | undefined> = {
      name: patch.name,
      phone: patch.phone,
      email: patch.email,
      address: patch.address,
      website: patch.website,
      timezone: patch.timezone,
      category: patch.category,
      description: patch.description,
    };
    const entries = Object.entries(columns).filter(([, v]) => v !== undefined) as [string, string][];
    if (entries.length === 0) return;

    await this.sql`
      update business_profiles set ${this.sql(Object.fromEntries(entries))}
      where workspace_id = ${this.ws}`;
  }

  // ── Hours ─────────────────────────────────────────────────────────────────

  async replaceHours(hours: DayHours[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      // Intervals cascade from the day rows, so clearing the days clears both.
      await tx`delete from business_hours where workspace_id = ${this.ws}`;
      for (const day of hours) {
        await tx`
          insert into business_hours (workspace_id, weekday, is_open)
          values (${this.ws}, ${day.day}, ${day.isOpen})`;
        for (const [position, interval] of day.intervals.entries()) {
          await tx`
            insert into business_hour_intervals (workspace_id, weekday, position, opens_at, closes_at)
            values (${this.ws}, ${day.day}, ${position}, ${interval.open}, ${interval.close})`;
        }
      }
    });
  }

  // ── Special hours ─────────────────────────────────────────────────────────

  async addSpecialHours(entry: Omit<SpecialHours, "id">): Promise<string> {
    const id = newId("sh");
    await this.sql.begin(async (tx) => {
      await tx`
        insert into special_hours (id, workspace_id, on_date, label, is_closed)
        values (${id}, ${this.ws}, ${entry.date}, ${entry.label}, ${entry.isClosed})`;
      await insertSpecialIntervals(tx, id, entry.intervals);
    });
    return id;
  }

  async updateSpecialHours(id: string, patch: Partial<Omit<SpecialHours, "id">>): Promise<void> {
    await this.sql.begin(async (tx) => {
      // Scoped by workspace, so an id belonging to another tenant updates nothing.
      const rows = await tx`
        update special_hours set
          on_date   = coalesce(${patch.date ?? null}::date, on_date),
          label     = coalesce(${patch.label ?? null}, label),
          is_closed = coalesce(${patch.isClosed ?? null}, is_closed)
        where id = ${id} and workspace_id = ${this.ws}
        returning id`;
      if (rows.length === 0 || patch.intervals === undefined) return;

      await tx`delete from special_hour_intervals where special_hours_id = ${id}`;
      await insertSpecialIntervals(tx, id, patch.intervals);
    });
  }

  async removeSpecialHours(id: string): Promise<void> {
    await this.sql`delete from special_hours where id = ${id} and workspace_id = ${this.ws}`;
  }

  // ── Services ──────────────────────────────────────────────────────────────

  async addService(service: Omit<BusinessService, "id">): Promise<string> {
    const id = newId("svc");
    await this.sql`
      insert into services (id, workspace_id, name, description, price_model, price, duration_min, active, position)
      values (${id}, ${this.ws}, ${service.name}, ${service.description}, ${service.priceModel},
              ${service.price}, ${service.durationMin}, ${service.active},
              coalesce((select max(position) + 1 from services where workspace_id = ${this.ws}), 0))`;
    return id;
  }

  async updateService(id: string, patch: Partial<Omit<BusinessService, "id">>): Promise<void> {
    const columns: Record<string, unknown> = {
      name: patch.name,
      description: patch.description,
      price_model: patch.priceModel,
      price: patch.price,
      duration_min: patch.durationMin,
      active: patch.active,
    };
    const entries = Object.entries(columns).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    await this.sql`
      update services set ${this.sql(Object.fromEntries(entries))}
      where id = ${id} and workspace_id = ${this.ws}`;
  }

  /**
   * Removing a service removes the catalogue entry and nothing else.
   *
   * `appointments.service_id` is ON DELETE SET NULL, so every past booking keeps
   * its own snapshot of the name, price and duration that were agreed, and
   * simply loses the link to an entry that no longer exists. History is not
   * rewritten and not lost.
   */
  async removeService(id: string): Promise<void> {
    await this.sql`delete from services where id = ${id} and workspace_id = ${this.ws}`;
  }

  /** Swaps a service with its neighbour, which is what the ordering control means. */
  async moveService(id: string, direction: -1 | 1): Promise<void> {
    await this.sql.begin(async (tx) => {
      const rows = await tx`
        select id, position from services where workspace_id = ${this.ws}
        order by position, created_at`;
      const index = rows.findIndex((r) => str(r.id) === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= rows.length) return;

      // Positions may have gaps or duplicates after edits; rewriting the whole
      // list from the swapped order is simpler than reasoning about that.
      const ordered = rows.map((r) => str(r.id));
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      for (const [position, serviceId] of ordered.entries()) {
        await tx`update services set position = ${position}
                 where id = ${serviceId} and workspace_id = ${this.ws}`;
      }
    });
  }

  // ── AI behaviour ──────────────────────────────────────────────────────────

  async updateAI(patch: Partial<AIConfiguration>): Promise<void> {
    const columns: Record<string, unknown> = {
      enabled: patch.enabled,
      channel_voice: patch.channels?.voice,
      channel_sms: patch.channels?.sms,
      channel_email: patch.channels?.email,
      greeting: patch.greeting,
      personality: patch.personality,
      voice_name: patch.voice?.name,
      voice_speed_pct: patch.voice?.speedPct,
      voice_tone: patch.voice?.tone,
      booking_default_duration_min: patch.booking?.defaultDurationMin,
      booking_min_notice_min: patch.booking?.minNoticeMin,
      booking_max_advance_days: patch.booking?.maxAdvanceDays,
      booking_max_concurrent: patch.booking?.maxConcurrent,
      booking_send_confirmation: patch.booking?.sendConfirmation,
      booking_allow_reschedule: patch.booking?.allowReschedule,
      booking_allow_cancellation: patch.booking?.allowCancellation,
      escalation_when_unsure: patch.escalation?.whenUnsure,
      escalation_urgent: patch.escalation?.urgentRequests,
      escalation_unsupported: patch.escalation?.unsupportedRequests,
      after_hours: patch.afterHours,
    };
    const entries = Object.entries(columns).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    await this.sql`
      update ai_configurations set ${this.sql(Object.fromEntries(entries))}
      where workspace_id = ${this.ws}`;
  }
}

async function insertSpecialIntervals(tx: Tx, specialHoursId: string, intervals: TimeInterval[]) {
  for (const [position, interval] of intervals.entries()) {
    await tx`
      insert into special_hour_intervals (special_hours_id, position, opens_at, closes_at)
      values (${specialHoursId}, ${position}, ${interval.open}, ${interval.close})`;
  }
}

function toBusiness(row: Row): BusinessIdentity {
  return {
    name: str(row.name),
    phone: str(row.phone),
    email: str(row.email),
    address: str(row.address),
    website: str(row.website),
    timezone: str(row.timezone),
    category: str(row.category),
    description: str(row.description),
  };
}

function toService(row: Row): BusinessService {
  return {
    id: str(row.id),
    name: str(row.name),
    description: str(row.description),
    priceModel: str(row.price_model) as BusinessService["priceModel"],
    price: num(row.price),
    durationMin: num(row.duration_min),
    active: bool(row.active),
  };
}

function toKnowledge(row: Row): KnowledgeEntry {
  return {
    id: str(row.id),
    category: str(row.category) as KnowledgeEntry["category"],
    title: str(row.title),
    content: str(row.content),
    active: bool(row.active),
  };
}

function toAi(row: Row): AIConfiguration {
  return {
    enabled: bool(row.enabled),
    channels: {
      voice: bool(row.channel_voice),
      sms: bool(row.channel_sms),
      email: bool(row.channel_email),
    },
    greeting: str(row.greeting),
    personality: str(row.personality) as AIConfiguration["personality"],
    voice: {
      name: str(row.voice_name),
      speedPct: num(row.voice_speed_pct),
      tone: str(row.voice_tone),
    },
    booking: {
      defaultDurationMin: num(row.booking_default_duration_min),
      minNoticeMin: num(row.booking_min_notice_min),
      maxAdvanceDays: num(row.booking_max_advance_days),
      maxConcurrent: num(row.booking_max_concurrent),
      sendConfirmation: bool(row.booking_send_confirmation),
      allowReschedule: bool(row.booking_allow_reschedule),
      allowCancellation: bool(row.booking_allow_cancellation),
    },
    escalation: {
      whenUnsure: str(row.escalation_when_unsure) as AIConfiguration["escalation"]["whenUnsure"],
      urgentRequests: str(row.escalation_urgent) as AIConfiguration["escalation"]["urgentRequests"],
      unsupportedRequests: str(row.escalation_unsupported) as AIConfiguration["escalation"]["unsupportedRequests"],
    },
    afterHours: str(row.after_hours) as AIConfiguration["afterHours"],
  };
}

export type { Weekday };
