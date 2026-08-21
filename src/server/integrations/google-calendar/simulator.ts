import "server-only";

import type { CalendarEvent, CalendarResult, CalendarSummary, CreateEventInput } from "./client";
import { APPOINTMENT_PROPERTY, CALENDAR_ERRORS, WORKSPACE_PROPERTY } from "./client";

/**
 * An in-process calendar with Google's semantics.
 *
 * ── Why this exists rather than a mocked `fetch` ────────────────────────────
 * A stubbed HTTP layer proves that our code sends the right request. It cannot
 * prove that a *sequence* of operations ends in the right state — that a
 * reschedule moves the event the create made, that a cancelled event stays
 * addressable, that a retry does not produce a second booking. Those are the
 * properties this integration is actually about, so the test double is a small
 * calendar rather than a set of canned responses.
 *
 * It is refused in production by `assertProductionConfiguration`, so it can
 * never quietly stand in for a real business calendar.
 *
 * ── Deterministic, including its failures ───────────────────────────────────
 * No randomness anywhere. Event ids come from a counter, and failures are
 * selected by *calendar id* — a calendar named `…missing` always 404s, one named
 * `…denied` always 403s. A test chooses a failure mode by choosing a calendar,
 * and clicking around in development always behaves the same way twice.
 */

interface StoredEvent {
  id: string;
  calendarId: string;
  status: "confirmed" | "cancelled";
  summary: string;
  start: Date;
  end: Date;
  timeZone: string;
  appointmentId: string | null;
  workspaceId: string | null;
  updated: Date;
  transparency: "opaque" | "transparent";
  allDay: boolean;
}

/**
 * The simulated calendars.
 *
 * Two of them differ in timezone from any business in the seed, which is the
 * point: the mismatch case (§11) is the one that hides bugs, so it is the
 * default state rather than something a test has to construct.
 */
const CALENDARS: CalendarSummary[] = [
  { id: "primary", summary: "Business calendar", timeZone: "America/Vancouver", primary: true, accessRole: "owner" },
  { id: "ops@example.test", summary: "Operations", timeZone: "America/Toronto", primary: false, accessRole: "writer" },
  { id: "readonly@example.test", summary: "Shared (read only)", timeZone: "Europe/London", primary: false, accessRole: "reader" },
];

const events = new Map<string, StoredEvent>();
let sequence = 0;
const createCallCounts = new Map<string, number>();

function key(calendarId: string, eventId: string): string {
  return `${calendarId}::${eventId}`;
}

/** Failure injection by calendar id, so an outcome is chosen by configuration. */
function injectedFailure(calendarId: string, now: Date) {
  const id = calendarId.toLowerCase();
  if (id.includes("missing")) return CALENDAR_ERRORS.calendarMissing(now);
  if (id.includes("denied")) return CALENDAR_ERRORS.permissionDenied(now);
  if (id.includes("ratelimited")) return CALENDAR_ERRORS.rateLimited(30, now);
  if (id.includes("timeout")) return CALENDAR_ERRORS.timeout(10_000, now);
  if (id.includes("expired")) return CALENDAR_ERRORS.authExpired(now);
  return null;
}

/**
 * A failure that only affects `createEvent`, and only from the *second* call
 * on a matching calendar id onward — so a test can set up an initial event
 * (call #1, succeeds), then have the replacement create a repair path issues
 * after a cancelled-tombstone PATCH (call #2+) fail. `injectedFailure` alone
 * cannot express this: it would also fail the PATCH, never reaching the
 * tombstone branch this exists to test.
 */
function injectedCreateFailure(calendarId: string, now: Date) {
  const id = calendarId.toLowerCase();
  const count = (createCallCounts.get(id) ?? 0) + 1;
  createCallCounts.set(id, count);
  if (id.includes("createfails") && count > 1) {
    return CALENDAR_ERRORS.unavailable("Simulated: create fails for this calendar id.", now);
  }
  return null;
}

function toEvent(stored: StoredEvent): CalendarEvent {
  return {
    id: stored.id,
    status: stored.status,
    summary: stored.summary,
    start: stored.start,
    end: stored.end,
    allDay: stored.allDay,
    transparency: stored.transparency,
    appointmentId: stored.appointmentId,
    workspaceId: stored.workspaceId,
    updated: stored.updated,
  };
}

export const simulatedCalendar = {
  async listCalendars(): Promise<CalendarResult<CalendarSummary[]>> {
    return { ok: true, value: CALENDARS };
  },

  async getCalendar(calendarId: string, now: Date): Promise<CalendarResult<CalendarSummary>> {
    const failure = injectedFailure(calendarId, now);
    if (failure) return { ok: false, error: failure };

    const found = CALENDARS.find((c) => c.id === calendarId);
    return found ? { ok: true, value: found } : { ok: false, error: CALENDAR_ERRORS.calendarMissing(now) };
  },

  async listEvents(calendarId: string, from: Date, to: Date): Promise<CalendarResult<CalendarEvent[]>> {
    const matching = [...events.values()]
      .filter((e) => e.calendarId === calendarId && e.status !== "cancelled")
      // Overlap, not containment: an event that started before the window and
      // runs into it still occupies time inside it.
      .filter((e) => e.start < to && e.end > from)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return { ok: true, value: matching.map(toEvent) };
  },

  async getEvent(calendarId: string, eventId: string, now: Date): Promise<CalendarResult<CalendarEvent>> {
    const failure = injectedFailure(calendarId, now);
    if (failure) return { ok: false, error: failure };

    const stored = events.get(key(calendarId, eventId));
    return stored ? { ok: true, value: toEvent(stored) } : { ok: false, error: CALENDAR_ERRORS.eventMissing(now) };
  },

  async createEvent(input: CreateEventInput, now: Date): Promise<CalendarResult<CalendarEvent>> {
    const failure = injectedFailure(input.calendarId, now) ?? injectedCreateFailure(input.calendarId, now);
    if (failure) return { ok: false, error: failure };

    // A fresh id every time, exactly as Google would. A retry that reached here
    // twice *would* produce two events — which is why the idempotency that
    // prevents it lives in the operation layer, and why this simulator must not
    // paper over its absence.
    sequence += 1;
    const id = `sim_evt_${sequence}`;
    const stored: StoredEvent = {
      id,
      calendarId: input.calendarId,
      status: "confirmed",
      summary: input.summary,
      start: input.start,
      end: input.end,
      timeZone: input.timeZone,
      appointmentId: input.appointmentId,
      workspaceId: input.workspaceId,
      updated: now,
      transparency: "opaque",
      allDay: false,
    };
    events.set(key(input.calendarId, id), stored);
    return { ok: true, value: toEvent(stored) };
  },

  async patchEventTime(
    input: { calendarId: string; eventId: string; start: Date; end: Date; timeZone: string },
    now: Date
  ): Promise<CalendarResult<CalendarEvent>> {
    const failure = injectedFailure(input.calendarId, now);
    if (failure) return { ok: false, error: failure };

    const stored = events.get(key(input.calendarId, input.eventId));
    if (!stored) return { ok: false, error: CALENDAR_ERRORS.eventMissing(now) };

    stored.start = input.start;
    stored.end = input.end;
    stored.timeZone = input.timeZone;
    stored.updated = now;
    return { ok: true, value: toEvent(stored) };
  },

  async cancelEvent(input: { calendarId: string; eventId: string }, now: Date): Promise<CalendarResult<void>> {
    const failure = injectedFailure(input.calendarId, now);
    if (failure) return { ok: false, error: failure };

    const stored = events.get(key(input.calendarId, input.eventId));
    // Already gone is the outcome we wanted; a retried cancellation is not a
    // fault. Mirrors the real client's handling of a 404 on cancel.
    if (!stored) return { ok: true, value: undefined };

    stored.status = "cancelled";
    stored.updated = now;
    return { ok: true, value: undefined };
  },

  // ── Test affordances ──────────────────────────────────────────────────────
  //
  // Used only by tests and by manual QA: they stand in for someone editing the
  // calendar directly in Google's own interface, which is the situation the
  // inbound synchronisation exists to handle.

  reset(): void {
    events.clear();
    sequence = 0;
    createCallCounts.clear();
  },

  /** Everything currently on a calendar, cancelled events included. */
  all(calendarId?: string): CalendarEvent[] {
    return [...events.values()]
      .filter((e) => !calendarId || e.calendarId === calendarId)
      .map(toEvent);
  },

  /** Someone dragged an event in Google's UI. */
  externallyMove(calendarId: string, eventId: string, start: Date, end: Date, now: Date): CalendarEvent | null {
    const stored = events.get(key(calendarId, eventId));
    if (!stored) return null;
    stored.start = start;
    stored.end = end;
    stored.updated = now;
    return toEvent(stored);
  },

  /** Someone deleted an event in Google's UI. */
  externallyDelete(calendarId: string, eventId: string): boolean {
    return events.delete(key(calendarId, eventId));
  },

  /** A staff meeting typed straight into the calendar — not an appointment. */
  addExternalEvent(input: {
    calendarId: string;
    summary: string;
    start: Date;
    end: Date;
    transparency?: "opaque" | "transparent";
    allDay?: boolean;
  }): CalendarEvent {
    sequence += 1;
    const id = `sim_ext_${sequence}`;
    const stored: StoredEvent = {
      id,
      calendarId: input.calendarId,
      status: "confirmed",
      summary: input.summary,
      start: input.start,
      end: input.end,
      timeZone: "UTC",
      // No appointment reference: that is exactly what makes it external.
      appointmentId: null,
      workspaceId: null,
      updated: input.start,
      transparency: input.transparency ?? "opaque",
      allDay: input.allDay ?? false,
    };
    events.set(key(input.calendarId, id), stored);
    return toEvent(stored);
  },
};

export { APPOINTMENT_PROPERTY, WORKSPACE_PROPERTY };
