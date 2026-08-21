import "server-only";

import type { AppConfiguration, Appointment, NormalizedError } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { instantForProvider } from "@/services/adapters/provider-time";
import {
  CALENDAR_ERRORS,
  cancelEvent,
  createEvent,
  getCalendar,
  getEvent,
  listCalendars,
  listEvents,
  patchEventTime,
  type CalendarEvent,
} from "./client";
import { resolveConnection, type CalendarConnection } from "./connection";
import { currentAccessToken, OAuthError } from "./oauth";

/**
 * Everything this application can do to a business's calendar.
 *
 * ── The list is the security boundary ───────────────────────────────────────
 * Five operations, each taking authoritative server-side arguments and building
 * its own payload. No caller supplies a calendar id, an event body, a URL or a
 * method — the generic request function that could accept those is private to
 * ./client.ts and exported to nobody.
 *
 * ── Where the times come from ───────────────────────────────────────────────
 * Always the appointment's stored wall clock resolved against the *business's*
 * timezone, never the calendar's and never the server's. The duration always
 * comes from the appointment's own snapshot, so a service repriced or
 * relengthened after the booking cannot silently change an event that already
 * exists.
 */

export type CalendarOutcome<T> = { ok: true; value: T } | { ok: false; error: NormalizedError };

/**
 * Resolve the connection and a usable access token in one step.
 *
 * Token refresh happens inside `currentAccessToken`; a refresh that fails
 * because the grant was revoked surfaces here as `calendar_auth_expired`, which
 * is what the client is eventually shown as "Calendar needs attention" rather
 * than anything mentioning OAuth.
 */
async function ready(
  context: AuthContext,
  now: Date
): Promise<
  | { ok: true; connection: CalendarConnection; token: Awaited<ReturnType<typeof currentAccessToken>> }
  | { ok: false; error: NormalizedError }
> {
  const state = await resolveConnection(context);
  if (!state.connected) return { ok: false, error: CALENDAR_ERRORS.notConfigured(now) };

  try {
    const token = await currentAccessToken(context.workspaceId, now);
    return { ok: true, connection: state.connection, token };
  } catch (error) {
    if (error instanceof OAuthError && error.code === "invalid_grant") {
      return { ok: false, error: CALENDAR_ERRORS.authExpired(now) };
    }
    if (error instanceof OAuthError && error.code === "timeout") {
      return { ok: false, error: CALENDAR_ERRORS.timeout(10_000, now) };
    }
    return { ok: false, error: CALENDAR_ERRORS.unavailable("Token refresh failed.", now) };
  }
}

/** What an event for an appointment says. Built from the record, not from input. */
function eventContent(appointment: Appointment, configuration: AppConfiguration) {
  return {
    summary: `${appointment.service.name} — ${appointment.customerName}`,
    description: [
      `Booked through ${configuration.business.name}.`,
      appointment.customerPhone ? `Phone: ${appointment.customerPhone}` : null,
      appointment.notes ? `Notes: ${appointment.notes}` : null,
      // The application's id, so an operator looking at the calendar can find
      // the booking. The machine-readable link is in extended properties.
      `Reference: ${appointment.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * The appointment's slot as a pair of instants.
 *
 * The single conversion point for calendar work, and it takes the business
 * timezone explicitly so that no call site can accidentally resolve a wall
 * clock against the calendar's zone. Duration comes from the snapshot.
 */
function slot(appointment: Appointment, businessTimeZone: string, override?: { date: string; time: string }) {
  const date = override?.date ?? appointment.date;
  const time = override?.time ?? appointment.time;
  const start = instantForProvider(date, time, businessTimeZone);
  return { start, end: new Date(start.getTime() + appointment.service.durationMin * 60_000) };
}

export interface AppointmentEventInput {
  appointment: Appointment;
  configuration: AppConfiguration;
  now: Date;
}

/**
 * Put an appointment on the calendar.
 *
 * Returns the mapping the caller should persist. It does not write to the
 * database itself: the caller owns the transaction, and it is the caller that
 * knows whether the surrounding business change committed.
 */
export async function createAppointmentEvent(
  context: AuthContext,
  input: AppointmentEventInput
): Promise<CalendarOutcome<{ eventId: string; calendarId: string }>> {
  const session = await ready(context, input.now);
  if (!session.ok) return session;

  const { start, end } = slot(input.appointment, input.configuration.business.timezone);
  const content = eventContent(input.appointment, input.configuration);

  const result = await createEvent(
    {
      calendarId: session.connection.calendarId,
      ...content,
      start,
      end,
      // The *business's* zone, deliberately. Google will render and later edit
      // the event in the zone the business operates in, not the one its
      // calendar happens to be configured for.
      timeZone: input.configuration.business.timezone,
      appointmentId: input.appointment.id,
      workspaceId: context.workspaceId,
    },
    session.token,
    input.now
  );

  if (!result.ok) return result;
  return { ok: true, value: { eventId: result.value.id, calendarId: session.connection.calendarId } };
}

/**
 * Move an existing event.
 *
 * If the appointment has no mapped event — booked before the calendar was
 * connected, or created while it was down — this creates one rather than
 * failing. A business that connects a calendar mid-life should not have to
 * re-enter its diary.
 *
 * ── The mapped event can be unusable in two different ways ──────────────────
 * Google can genuinely no longer have it (`calendar_event_not_found`), which
 * is the case this always handled. Live validation against a real account
 * found a second case a mock never would: Google keeps a deleted event as a
 * `status: "cancelled"` tombstone, and PATCHing that tombstone's time returns
 * **HTTP 200** with the tombstone still cancelled in the response body. A
 * caller that only checked `ok` would call that a successful reschedule and
 * mark the appointment synced against an event nobody can see.
 *
 * Both cases get the same repair: the old event is unusable, so a new one is
 * created and its id becomes the mapping going forward. The old (not-found or
 * cancelled) event id comes back as `replacedEventId` purely so callers can
 * put it in an audit trail — it is not needed for correctness, since the
 * caller only ever persists `eventId`.
 */
export async function rescheduleAppointmentEvent(
  context: AuthContext,
  input: AppointmentEventInput & { date: string; time: string; eventId: string | null }
): Promise<CalendarOutcome<{ eventId: string; calendarId: string; replacedEventId?: string }>> {
  const session = await ready(context, input.now);
  if (!session.ok) return session;

  const { start, end } = slot(input.appointment, input.configuration.business.timezone, {
    date: input.date,
    time: input.time,
  });

  if (!input.eventId) {
    return createAppointmentEvent(context, {
      ...input,
      appointment: { ...input.appointment, date: input.date, time: input.time },
    });
  }

  const result = await patchEventTime(
    {
      calendarId: session.connection.calendarId,
      eventId: input.eventId,
      start,
      end,
      timeZone: input.configuration.business.timezone,
    },
    session.token,
    input.now
  );

  const eventIsGone = !result.ok && result.error.code === "calendar_event_not_found";
  // Transport success is not domain success: Google answered 200, but the
  // resource it answered about is a cancelled tombstone, not a live event.
  const eventIsTombstoned = result.ok && result.value.status === "cancelled";

  if (eventIsGone || eventIsTombstoned) {
    const replacement = await createAppointmentEvent(context, {
      ...input,
      appointment: { ...input.appointment, date: input.date, time: input.time },
    });
    if (!replacement.ok) return replacement;
    return { ok: true, value: { ...replacement.value, replacedEventId: input.eventId } };
  }

  if (!result.ok) return result;

  return { ok: true, value: { eventId: result.value.id, calendarId: session.connection.calendarId } };
}

export async function cancelAppointmentEvent(
  context: AuthContext,
  input: AppointmentEventInput & { eventId: string | null }
): Promise<CalendarOutcome<void>> {
  // Nothing on the calendar to cancel is a success, not a failure: the desired
  // end state already holds.
  if (!input.eventId) return { ok: true, value: undefined };

  const session = await ready(context, input.now);
  if (!session.ok) return session;

  return cancelEvent(
    { calendarId: session.connection.calendarId, eventId: input.eventId },
    session.token,
    input.now
  );
}

/**
 * Calendar entries that occupy time without being bookings.
 *
 * Everything that is *not* one of our appointments and *not* marked transparent
 * — a staff meeting, leave, a personal block. These are returned so the caller
 * can fold them into the existing capacity model; they are never turned into
 * customer records.
 */
export async function getBlockingEvents(
  context: AuthContext,
  input: { from: Date; to: Date; now: Date }
): Promise<CalendarOutcome<CalendarEvent[]>> {
  const session = await ready(context, input.now);
  if (!session.ok) return session;

  const result = await listEvents(
    {
      calendarId: session.connection.calendarId,
      calendarTimeZone: session.connection.calendarTimeZone,
      from: input.from,
      to: input.to,
    },
    session.token,
    input.now
  );
  if (!result.ok) return result;

  const blocking = result.value.filter(
    (event) =>
      event.status !== "cancelled" &&
      // "Free" in Google's own terms: shown on the calendar, does not make the
      // owner busy. Treating those as blocking would refuse bookings during
      // every all-day birthday reminder.
      event.transparency !== "transparent" &&
      // Ours are already represented by the appointments they came from;
      // counting them here would double-book against ourselves.
      event.appointmentId === null
  );

  return { ok: true, value: blocking };
}

/** One mapped event's current state in Google, for reconciliation. */
export async function getAppointmentEvent(
  context: AuthContext,
  input: { eventId: string; now: Date }
): Promise<CalendarOutcome<CalendarEvent>> {
  const session = await ready(context, input.now);
  if (!session.ok) return session;

  return getEvent(
    {
      calendarId: session.connection.calendarId,
      calendarTimeZone: session.connection.calendarTimeZone,
      eventId: input.eventId,
    },
    session.token,
    input.now
  );
}

export interface ConnectionCheck {
  calendarId: string;
  calendarLabel: string;
  calendarTimeZone: string;
  latencyMs: number;
}

/**
 * A read-only health probe.
 *
 * Reads the selected calendar's metadata: it proves the token refreshes, the
 * grant is still valid, the calendar still exists and we can still see it —
 * without creating, modifying or deleting anything. A probe that wrote a
 * throwaway event would leave debris in a real business's calendar on every
 * click, and would fail for read-permission problems it was supposed to detect.
 */
export async function testCalendarConnection(
  context: AuthContext,
  now: Date
): Promise<CalendarOutcome<ConnectionCheck>> {
  const session = await ready(context, now);
  if (!session.ok) return session;

  const started = Date.now();
  const result = await getCalendar(session.connection.calendarId, session.token, now);
  if (!result.ok) return result;

  return {
    ok: true,
    value: {
      calendarId: result.value.id,
      calendarLabel: result.value.summary,
      calendarTimeZone: result.value.timeZone,
      latencyMs: Date.now() - started,
    },
  };
}

/**
 * The calendars an administrator may choose between. Admin surfaces only.
 *
 * Deliberately does *not* go through `ready()`: this is the one operation that
 * must work in the "authorised, but no calendar selected yet" state — which is
 * precisely the state an administrator is in when they need this list. It needs
 * a token and nothing else.
 */
export async function listSelectableCalendars(context: AuthContext, now: Date) {
  try {
    const token = await currentAccessToken(context.workspaceId, now);
    return listCalendars(token, now);
  } catch (error) {
    if (error instanceof OAuthError && error.code === "invalid_grant") {
      return { ok: false as const, error: CALENDAR_ERRORS.authExpired(now) };
    }
    return { ok: false as const, error: CALENDAR_ERRORS.notConfigured(now) };
  }
}

export type { CalendarEvent };
