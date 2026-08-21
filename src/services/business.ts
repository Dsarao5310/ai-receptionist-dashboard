import type {
  AppConfiguration,
  Appointment,
  BusinessService,
  DayHours,
  KnowledgeEntry,
  ServiceSnapshot,
  SpecialHours,
  TimeInterval,
  Weekday,
} from "@/types";
import { WEEKDAY_LABELS } from "@/types";
import {
  addZonedDays,
  formatWallClockTime,
  parseTimeOfDay,
  wallClockToInstant,
  zonedDayKey,
  zonedMinutesOfDay,
  zonedWeekday,
} from "@/lib/timezone";

/**
 * Pure selectors over the configuration document. Everything is derived on read
 * rather than stored, so there is never a precomputed copy to go stale when the
 * underlying configuration changes.
 *
 * Every question about days and times is answered in the *business* timezone
 * (`config.business.timezone`), never the browser's. A salon in Vancouver
 * viewed from a laptop in Tokyo must still report its own opening hours.
 */

export function businessZone(config: AppConfiguration): string {
  return config.business.timezone || "UTC";
}

export function weekdayOf(config: AppConfiguration, instant: Date): Weekday {
  return zonedWeekday(instant, businessZone(config));
}

export function toMinutes(hhmm: string): number {
  const { hour, minute } = parseTimeOfDay(hhmm);
  return hour * 60 + minute;
}

/** "09:00" → "9:00 AM". Kept here so hours read the same everywhere they're shown. */
export const formatTimeOfDay = formatWallClockTime;

export function formatIntervals(intervals: TimeInterval[]): string {
  if (intervals.length === 0) return "Closed";
  return intervals.map((i) => `${formatTimeOfDay(i.open)} – ${formatTimeOfDay(i.close)}`).join(", ");
}

/**
 * The instant an appointment starts. Its stored date and time are wall-clock
 * values in the business timezone, so they must be resolved against that zone —
 * `new Date("2026-08-17T09:00")` would silently mean 09:00 wherever the viewer
 * happens to be sitting.
 */
export function appointmentInstant(config: AppConfiguration, appointment: Pick<Appointment, "date" | "time">): Date {
  return wallClockToInstant(appointment.date, appointment.time, businessZone(config));
}

export function appointmentEndInstant(config: AppConfiguration, appointment: Appointment): Date {
  return new Date(appointmentInstant(config, appointment).getTime() + appointment.service.durationMin * 60000);
}

export interface EffectiveHours {
  isOpen: boolean;
  intervals: TimeInterval[];
  /** Set when a special-hours entry overrode the normal weekly schedule. */
  exception: SpecialHours | null;
}

/**
 * The hours that actually apply on a given date. Special hours win over the
 * weekly schedule — a receptionist that quotes normal Wednesday hours on
 * Christmas Day is worse than useless, so every hours question routes here.
 */
export function getEffectiveHours(config: AppConfiguration, instant: Date): EffectiveHours {
  const zone = businessZone(config);
  const exception = config.specialHours.find((s) => s.date === zonedDayKey(instant, zone));
  if (exception) {
    return { isOpen: !exception.isClosed && exception.intervals.length > 0, intervals: exception.intervals, exception };
  }
  const day = config.hours.find((h) => h.day === zonedWeekday(instant, zone));
  if (!day) return { isOpen: false, intervals: [], exception: null };
  return { isOpen: day.isOpen && day.intervals.length > 0, intervals: day.intervals, exception: null };
}

/**
 * The hours that apply on a stored wall-clock day (`"2026-08-17"`).
 *
 * Resolved through midday so the lookup can never be pushed onto a neighbouring
 * date by a daylight-saving shift at midnight.
 */
export function getEffectiveHoursForDay(config: AppConfiguration, dayKey: string): EffectiveHours {
  return getEffectiveHours(config, wallClockToInstant(dayKey, "12:00", businessZone(config)));
}

/** True when an instant falls outside opening hours (or on a closed day), judged in the business timezone. */
export function isOutsideBusinessHours(config: AppConfiguration, timestamp: string | Date): boolean {
  const instant = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const { isOpen, intervals } = getEffectiveHours(config, instant);
  if (!isOpen) return true;
  const minutes = zonedMinutesOfDay(instant, businessZone(config));
  return !intervals.some((i) => minutes >= toMinutes(i.open) && minutes < toMinutes(i.close));
}

/**
 * The next date, at or after `from`, on which the business is still open.
 *
 * Today only counts if there is opening time left in it — at 9pm on a Saturday
 * the honest answer to "when are you next open?" is Monday, not "Saturday".
 */
export function getNextOpenDay(config: AppConfiguration, from: Date, lookaheadDays = 14): { date: Date; hours: EffectiveHours } | null {
  const zone = businessZone(config);
  const minutesNow = zonedMinutesOfDay(from, zone);

  for (let i = 0; i <= lookaheadDays; i++) {
    const candidate = addZonedDays(from, zone, i);
    const hours = getEffectiveHours(config, candidate);
    if (!hours.isOpen) continue;
    // On the starting day, ignore intervals that have already finished.
    if (i === 0 && !hours.intervals.some((interval) => minutesNow < toMinutes(interval.close))) continue;
    return { date: candidate, hours };
  }
  return null;
}

export function describeDayHours(day: DayHours): string {
  return day.isOpen && day.intervals.length > 0 ? formatIntervals(day.intervals) : "Closed";
}

export function getWeekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day];
}

// ── Services ────────────────────────────────────────────────────────────────

/**
 * The services a *new* booking may be made against.
 *
 * Deactivating a service takes it off the menu without erasing it, so this is
 * the selector every booking-facing surface must use — the receptionist's spoken
 * list, price quotes, and any future new-appointment form. It is deliberately
 * not the same thing as the catalogue.
 *
 * The full catalogue (`config.services`) stays available to history: an
 * appointment booked against a service that has since been deactivated still
 * resolves through `getCatalogueService`, still shows its snapshot, and is
 * still rescheduleable. Being inactive is not drift — it is the same service,
 * simply no longer offered — so `getServiceDrift` ignores it.
 */
export function getBookableServices(config: AppConfiguration): BusinessService[] {
  return config.services.filter((s) => s.active);
}

export function findServiceByName(config: AppConfiguration, query: string): BusinessService | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const active = getBookableServices(config);
  return (
    active.find((s) => s.name.toLowerCase() === q) ??
    active.find((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase())) ??
    null
  );
}

/**
 * Renders a price the way the business chose to express it, not as a bare
 * number. Accepts either a catalogue entry or an appointment's snapshot, since
 * both carry the same pricing shape.
 */
export function formatServicePrice(service: Pick<BusinessService, "priceModel" | "price">): string {
  switch (service.priceModel) {
    case "free":
      return "Free";
    case "contact":
      return "Contact for pricing";
    case "hidden":
      return "—";
    case "from":
      return `From $${service.price}`;
    default:
      return `$${service.price}`;
  }
}

export function formatDurationMinutes(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatServiceDuration(service: Pick<BusinessService, "durationMin">): string {
  return formatDurationMinutes(service.durationMin);
}

/**
 * Builds the immutable record stored on an appointment at the moment of booking.
 * Copies the four fields by value — the snapshot must not share structure with a
 * catalogue entry that can later be edited.
 */
export function snapshotOfService(service: Pick<BusinessService, "name" | "priceModel" | "price" | "durationMin">): ServiceSnapshot {
  return { name: service.name, priceModel: service.priceModel, price: service.price, durationMin: service.durationMin };
}

/** The live catalogue entry an appointment points at, or null if it has been deleted. */
export function getCatalogueService(config: AppConfiguration, appointment: Appointment): BusinessService | null {
  if (!appointment.serviceId) return null;
  return config.services.find((s) => s.id === appointment.serviceId) ?? null;
}

export type ServiceDriftReason = "deleted" | "renamed" | "repriced" | "reduration";

/**
 * How an appointment's booked details differ from the catalogue today. Used to
 * show that history is being displayed rather than current pricing — without
 * ever overwriting what the customer was actually quoted.
 */
export function getServiceDrift(config: AppConfiguration, appointment: Appointment): ServiceDriftReason[] {
  if (!appointment.serviceId) return [];
  const current = getCatalogueService(config, appointment);
  if (!current) return ["deleted"];

  const drift: ServiceDriftReason[] = [];
  if (current.name !== appointment.service.name) drift.push("renamed");
  if (current.priceModel !== appointment.service.priceModel || current.price !== appointment.service.price) drift.push("repriced");
  if (current.durationMin !== appointment.service.durationMin) drift.push("reduration");
  return drift;
}

/** One side of a booked-vs-current comparison, already formatted for display. */
export interface ServiceComparisonSide {
  name: string;
  /** Price and duration, omitted when that field did not change. */
  details: string;
}

export interface ServiceComparison {
  reasons: ServiceDriftReason[];
  /** The catalogue entry is gone; only the historical snapshot survives. */
  deleted: boolean;
  booked: ServiceComparisonSide;
  /** Null when the service was deleted — there is nothing current to compare against. */
  current: ServiceComparisonSide | null;
}

/**
 * A display-ready comparison of what was booked against the catalogue today,
 * or null when nothing has changed.
 *
 * Only the fields that actually differ are described, so a rename alone does
 * not print an identical price twice. Nothing here mutates the appointment —
 * the snapshot remains the record of what the customer agreed to.
 */
export function getServiceComparison(config: AppConfiguration, appointment: Appointment): ServiceComparison | null {
  const reasons = getServiceDrift(config, appointment);
  if (reasons.length === 0) return null;

  const booked = appointment.service;
  const current = getCatalogueService(config, appointment);

  if (!current) {
    return {
      reasons,
      deleted: true,
      booked: { name: booked.name, details: describeServiceDetails(booked, true, true) },
      current: null,
    };
  }

  const showPrice = reasons.includes("repriced");
  const showDuration = reasons.includes("reduration");
  return {
    reasons,
    deleted: false,
    booked: { name: booked.name, details: describeServiceDetails(booked, showPrice, showDuration) },
    current: { name: current.name, details: describeServiceDetails(current, showPrice, showDuration) },
  };
}

function describeServiceDetails(
  service: Pick<BusinessService, "priceModel" | "price" | "durationMin">,
  includePrice: boolean,
  includeDuration: boolean
): string {
  const parts: string[] = [];
  if (includePrice) parts.push(formatServicePrice(service));
  if (includeDuration) parts.push(formatDurationMinutes(service.durationMin));
  return parts.join(" · ");
}

// ── Knowledge ───────────────────────────────────────────────────────────────

export function getActiveKnowledge(config: AppConfiguration): KnowledgeEntry[] {
  return config.knowledge.filter((k) => k.active);
}

export function findKnowledge(config: AppConfiguration, query: string): KnowledgeEntry | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  let best: { entry: KnowledgeEntry; score: number } | null = null;

  for (const entry of getActiveKnowledge(config)) {
    const haystack = `${entry.title} ${entry.content}`.toLowerCase();
    const score = words.reduce((sum, w) => sum + (haystack.includes(w) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

// ── Setup completeness ──────────────────────────────────────────────────────

export interface CompletenessSection {
  key: string;
  label: string;
  complete: boolean;
  hint: string;
  /** Business Profile tab this section lives on, for jump-to links. */
  tab: "details" | "hours" | "services" | "knowledge";
}

export interface Completeness {
  sections: CompletenessSection[];
  completed: number;
  total: number;
  percent: number;
}

/**
 * A transparent count of recommended sections that are filled in — not a
 * weighted score that looks precise while meaning nothing. Every item states
 * exactly what makes it complete.
 */
export function getSetupCompleteness(config: AppConfiguration): Completeness {
  const hasKnowledgeCategory = (category: KnowledgeEntry["category"]) =>
    config.knowledge.some((k) => k.active && k.category === category && k.content.trim().length > 0);

  const sections: CompletenessSection[] = [
    {
      key: "business",
      label: "Business details",
      complete: !!(config.business.name.trim() && config.business.phone.trim() && config.business.address.trim()),
      hint: "Name, phone and address",
      tab: "details",
    },
    {
      key: "hours",
      label: "Business hours",
      complete: config.hours.some((h) => h.isOpen && h.intervals.length > 0),
      hint: "At least one open day",
      tab: "hours",
    },
    {
      key: "services",
      label: "Services",
      complete: getBookableServices(config).length > 0,
      hint: "At least one active service",
      tab: "services",
    },
    {
      key: "pricing",
      label: "Pricing",
      complete: getBookableServices(config).every((s) => s.priceModel !== "fixed" || s.price > 0),
      hint: "Every fixed-price service has a price",
      tab: "services",
    },
    {
      key: "faq",
      label: "Frequently asked questions",
      complete: hasKnowledgeCategory("faq"),
      hint: "At least one answered question",
      tab: "knowledge",
    },
    {
      key: "cancellation",
      label: "Cancellation policy",
      complete: hasKnowledgeCategory("cancellation"),
      hint: "So the receptionist can explain your policy",
      tab: "knowledge",
    },
    {
      key: "parking",
      label: "Parking information",
      complete: hasKnowledgeCategory("parking"),
      hint: "A common question before a first visit",
      tab: "knowledge",
    },
    {
      key: "payment",
      label: "Payment methods",
      complete: hasKnowledgeCategory("payment"),
      hint: "What customers can pay with",
      tab: "knowledge",
    },
  ];

  const completed = sections.filter((s) => s.complete).length;
  return { sections, completed, total: sections.length, percent: Math.round((completed / sections.length) * 100) };
}
