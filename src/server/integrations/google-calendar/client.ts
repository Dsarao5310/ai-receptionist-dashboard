import "server-only";

import type { NormalizedError } from "@/types";
import { serverEnv } from "@/server/env";
import type { Secret } from "@/server/integrations/credential-store";
import { instantFromProvider } from "@/services/adapters/provider-time";
import { OAuthError } from "./oauth";
import { simulatedCalendar } from "./simulator";

/**
 * The Google Calendar API, behind one door.
 *
 * ── No generic request function escapes this module ─────────────────────────
 * `request()` is private. What the rest of the application can call are named
 * domain operations — get a calendar, list events in a window, create an event
 * for an appointment — each with a fixed shape the server controls. There is
 * deliberately no `calendarRequest(method, path, body)` for a component, an
 * action, or a future contributor to reach for: that would hand every caller
 * the full API surface of a business's calendar.
 *
 * ── Everything is normalized on the way out ─────────────────────────────────
 * A caller never sees an HTTP status, a Google error body, or a raw timestamp.
 * Failures leave here as `NormalizedError` with a message written for a business
 * audience and admin detail that carries no token, header or payload. Times
 * leave as canonical instants, having gone through `provider-time.ts` — Google
 * sends both `dateTime` with an offset and all-day `date` values with none, and
 * the second kind is exactly what silently adopts the server's zone if anyone
 * parses it locally.
 *
 * ── Modes ───────────────────────────────────────────────────────────────────
 * `simulated` runs an in-process calendar with the same semantics (see
 * ./simulator.ts) so the whole path is exercised without a Google project.
 * Production refuses to start in that mode, so it cannot quietly stand in for a
 * real calendar.
 */

const API_BASE = "https://www.googleapis.com/calendar/v3/";

/** Our marker on events we created. Matching by title would be guesswork. */
export const APPOINTMENT_PROPERTY = "receptionistAppointmentId";
export const WORKSPACE_PROPERTY = "receptionistWorkspaceId";

export interface CalendarSummary {
  id: string;
  /** The calendar's display name. Admin surfaces only. */
  summary: string;
  /** The calendar's own timezone, which need not be the business's. */
  timeZone: string;
  primary: boolean;
  accessRole: string;
}

export interface CalendarEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary: string | null;
  /** Canonical instants. All-day events are resolved against the calendar zone. */
  start: Date;
  end: Date;
  allDay: boolean;
  transparency: "opaque" | "transparent";
  /** Our appointment id, when this event is one we created. */
  appointmentId: string | null;
  workspaceId: string | null;
  updated: Date | null;
}

export interface CreateEventInput {
  calendarId: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  /** Sent so Google renders the event in the business's zone, not the calendar's. */
  timeZone: string;
  appointmentId: string;
  workspaceId: string;
}

export type CalendarResult<T> = { ok: true; value: T } | { ok: false; error: NormalizedError };

function calendarError(
  partial: Omit<NormalizedError, "provider" | "timestamp">,
  now: Date
): NormalizedError {
  return { ...partial, provider: "google_calendar", timestamp: now.toISOString() };
}

/**
 * Provider failures, in the vocabulary the product already speaks.
 *
 * Each says two different things: `message` is what a business owner is shown —
 * no vendor, no status code — and `adminDetail` is what an operator needs, still
 * with nothing sensitive in it.
 */
export const CALENDAR_ERRORS = {
  notConfigured: (now: Date) =>
    calendarError(
      {
        code: "calendar_not_configured",
        category: "configuration",
        severity: "warning",
        message: "No calendar is connected yet.",
        adminDetail: "GOOGLE_CALENDAR_MODE is live but the OAuth client or connection is missing.",
        retryable: false,
      },
      now
    ),

  authExpired: (now: Date) =>
    calendarError(
      {
        code: "calendar_auth_expired",
        category: "auth",
        severity: "critical",
        message: "The calendar connection needs to be authorised again.",
        adminDetail: "The stored refresh token was rejected. Reconnect the calendar.",
        // A rejected grant will be rejected again. Retrying only delays the fix.
        retryable: false,
      },
      now
    ),

  permissionDenied: (now: Date) =>
    calendarError(
      {
        code: "calendar_permission_denied",
        category: "permission",
        severity: "critical",
        message: "The connected calendar is missing a permission it needs.",
        adminDetail: "Google returned 403. The account may lack write access to the selected calendar.",
        retryable: false,
      },
      now
    ),

  calendarMissing: (now: Date) =>
    calendarError(
      {
        code: "calendar_not_found",
        category: "configuration",
        severity: "critical",
        message: "The selected calendar could not be found.",
        adminDetail: "Google returned 404 for the configured calendar id. It may have been deleted or unshared.",
        retryable: false,
      },
      now
    ),

  eventMissing: (now: Date) =>
    calendarError(
      {
        code: "calendar_event_not_found",
        category: "provider",
        severity: "warning",
        message: "That booking is no longer on the calendar.",
        adminDetail: "Google returned 404 for the mapped event id. It may have been deleted externally.",
        retryable: false,
      },
      now
    ),

  rateLimited: (retryAfterSeconds: number | null, now: Date) =>
    calendarError(
      {
        code: "calendar_rate_limited",
        category: "rate_limit",
        severity: "warning",
        message: "The calendar is busy. This will be retried shortly.",
        adminDetail: retryAfterSeconds
          ? `Google asked us to wait ${retryAfterSeconds}s.`
          : "Google returned a rate-limit response.",
        retryable: true,
      },
      now
    ),

  timeout: (ms: number, now: Date) =>
    calendarError(
      {
        code: "calendar_timeout",
        category: "network",
        severity: "warning",
        message: "The calendar did not respond in time. Please try again.",
        adminDetail: `No response within ${ms}ms.`,
        retryable: true,
      },
      now
    ),

  unavailable: (detail: string, now: Date) =>
    calendarError(
      {
        code: "calendar_unavailable",
        category: "provider",
        severity: "critical",
        message: "The calendar service is unavailable right now.",
        adminDetail: detail,
        retryable: true,
      },
      now
    ),

  malformed: (detail: string, now: Date) =>
    calendarError(
      {
        code: "calendar_malformed_response",
        category: "provider",
        severity: "critical",
        message: "The calendar returned something unexpected.",
        adminDetail: `Response failed validation: ${detail}`,
        retryable: false,
      },
      now
    ),
} as const;

interface RequestOptions {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  token: Secret;
  now: Date;
}

/**
 * One HTTP call to Google. Private on purpose — see the module note.
 *
 * The token goes in the Authorization header and is read through `.expose()`
 * exactly here. It is never placed in a query string, where it would be written
 * to access logs and browser histories on the way.
 */
async function request<T>(options: RequestOptions): Promise<CalendarResult<T>> {
  const url = new URL(options.path, API_BASE);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timeoutMs = serverEnv.googleTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${options.token.expose()}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 401) return { ok: false, error: CALENDAR_ERRORS.authExpired(options.now) };
    if (response.status === 403) {
      // Google overloads 403 for both "no permission" and "quota exceeded", and
      // the two need opposite handling: one is permanent, one is a retry.
      const body = await response.text();
      const rateLimited = /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(body);
      return {
        ok: false,
        error: rateLimited
          ? CALENDAR_ERRORS.rateLimited(readRetryAfter(response), options.now)
          : CALENDAR_ERRORS.permissionDenied(options.now),
      };
    }
    if (response.status === 404) return { ok: false, error: CALENDAR_ERRORS.calendarMissing(options.now) };
    if (response.status === 429) {
      return { ok: false, error: CALENDAR_ERRORS.rateLimited(readRetryAfter(response), options.now) };
    }
    if (!response.ok) {
      return { ok: false, error: CALENDAR_ERRORS.unavailable(`Google returned HTTP ${response.status}.`, options.now) };
    }

    // DELETE answers 204 with no body; parsing it would throw.
    if (response.status === 204) return { ok: true, value: undefined as T };

    try {
      return { ok: true, value: (await response.json()) as T };
    } catch {
      return { ok: false, error: CALENDAR_ERRORS.malformed("body was not JSON", options.now) };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: CALENDAR_ERRORS.timeout(timeoutMs, options.now) };
    }
    // Only the error's class name: a fetch failure's message can contain the
    // full request URL, and that URL identifies a business's calendar.
    const detail = error instanceof Error ? error.constructor.name : "unknown transport failure";
    return { ok: false, error: CALENDAR_ERRORS.unavailable(detail, options.now) };
  } finally {
    clearTimeout(timer);
  }
}

function readRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  const parsed = header ? Number(header) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

// ── Shape parsing ───────────────────────────────────────────────────────────

interface RawEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: string;
  updated?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/**
 * A Google event as a canonical instant pair.
 *
 * The two shapes Google uses are genuinely different kinds of value:
 * `dateTime` carries an offset and is a moment; `date` is a bare calendar day
 * for an all-day event and means nothing until resolved against a zone. Both go
 * through `instantFromProvider`, which refuses an offsetless value unless the
 * zone is supplied — so the all-day case must state the calendar's timezone,
 * and cannot silently inherit the server's.
 */
export function toCalendarEvent(raw: RawEvent, calendarTimeZone: string): CalendarEvent | null {
  if (!raw.id || !raw.start || !raw.end) return null;

  const resolve = (part: { dateTime?: string; date?: string; timeZone?: string }): Date | null => {
    if (part.dateTime) return instantFromProvider({ value: part.dateTime, timeZone: part.timeZone ?? calendarTimeZone });
    if (part.date) return instantFromProvider({ value: `${part.date}T00:00:00`, timeZone: part.timeZone ?? calendarTimeZone });
    return null;
  };

  const start = resolve(raw.start);
  const end = resolve(raw.end);
  if (!start || !end) return null;

  const properties = raw.extendedProperties?.private ?? {};

  return {
    id: raw.id,
    status: raw.status === "cancelled" ? "cancelled" : raw.status === "tentative" ? "tentative" : "confirmed",
    summary: raw.summary ?? null,
    start,
    end,
    allDay: Boolean(raw.start.date),
    transparency: raw.transparency === "transparent" ? "transparent" : "opaque",
    appointmentId: properties[APPOINTMENT_PROPERTY] ?? null,
    workspaceId: properties[WORKSPACE_PROPERTY] ?? null,
    updated: raw.updated ? instantFromProvider({ value: raw.updated }) : null,
  };
}

// ── Domain operations ───────────────────────────────────────────────────────
//
// The complete list of things this application can do to a Google Calendar.
// Adding to it is a deliberate act; there is no escape hatch below them.

export async function listCalendars(token: Secret, now: Date): Promise<CalendarResult<CalendarSummary[]>> {
  if (serverEnv.googleCalendarMode === "simulated") return simulatedCalendar.listCalendars();

  const result = await request<{ items?: { id?: string; summary?: string; timeZone?: string; primary?: boolean; accessRole?: string }[] }>(
    { path: "users/me/calendarList", token, now }
  );
  if (!result.ok) return result;

  const items = (result.value.items ?? [])
    .filter((item): item is { id: string; summary?: string; timeZone?: string; primary?: boolean; accessRole?: string } =>
      Boolean(item.id)
    )
    .map((item) => ({
      id: item.id,
      summary: item.summary ?? item.id,
      timeZone: item.timeZone ?? "UTC",
      primary: Boolean(item.primary),
      accessRole: item.accessRole ?? "reader",
    }));

  return { ok: true, value: items };
}

/**
 * Read one calendar's metadata.
 *
 * This is the health probe: a `GET` that creates nothing, deletes nothing and
 * notifies nobody. Testing a calendar connection by writing a throwaway event
 * would leave litter in a real business's calendar every time an administrator
 * clicked a button — and would fail for exactly the read-only permission
 * problems the test is meant to detect.
 */
export async function getCalendar(
  calendarId: string,
  token: Secret,
  now: Date
): Promise<CalendarResult<CalendarSummary>> {
  if (serverEnv.googleCalendarMode === "simulated") return simulatedCalendar.getCalendar(calendarId, now);

  const result = await request<{ id?: string; summary?: string; timeZone?: string }>({
    path: `calendars/${encodeURIComponent(calendarId)}`,
    token,
    now,
  });
  if (!result.ok) return result;
  if (!result.value.id) return { ok: false, error: CALENDAR_ERRORS.malformed("calendar had no id", now) };

  return {
    ok: true,
    value: {
      id: result.value.id,
      summary: result.value.summary ?? result.value.id,
      timeZone: result.value.timeZone ?? "UTC",
      primary: false,
      accessRole: "owner",
    },
  };
}

export async function listEvents(
  input: { calendarId: string; calendarTimeZone: string; from: Date; to: Date },
  token: Secret,
  now: Date
): Promise<CalendarResult<CalendarEvent[]>> {
  if (serverEnv.googleCalendarMode === "simulated") {
    return simulatedCalendar.listEvents(input.calendarId, input.from, input.to);
  }

  const result = await request<{ items?: RawEvent[] }>({
    path: `calendars/${encodeURIComponent(input.calendarId)}/events`,
    query: {
      timeMin: input.from.toISOString(),
      timeMax: input.to.toISOString(),
      // Recurring events are expanded, so a weekly meeting blocks each of its
      // occurrences rather than appearing once as an abstract rule.
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    },
    token,
    now,
  });
  if (!result.ok) return result;

  const events = (result.value.items ?? [])
    .map((item) => toCalendarEvent(item, input.calendarTimeZone))
    .filter((event): event is CalendarEvent => event !== null);

  return { ok: true, value: events };
}

export async function getEvent(
  input: { calendarId: string; calendarTimeZone: string; eventId: string },
  token: Secret,
  now: Date
): Promise<CalendarResult<CalendarEvent>> {
  if (serverEnv.googleCalendarMode === "simulated") {
    return simulatedCalendar.getEvent(input.calendarId, input.eventId, now);
  }

  const result = await request<RawEvent>({
    path: `calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    token,
    now,
  });
  if (!result.ok) {
    // A 404 here means the *event* is gone, not the calendar — a different
    // situation with a different remedy.
    return result.error.code === "calendar_not_found"
      ? { ok: false, error: CALENDAR_ERRORS.eventMissing(now) }
      : result;
  }

  const event = toCalendarEvent(result.value, input.calendarTimeZone);
  return event ? { ok: true, value: event } : { ok: false, error: CALENDAR_ERRORS.malformed("event was unreadable", now) };
}

/**
 * Create an event for an appointment.
 *
 * The payload is built entirely from server-side arguments. Nothing a browser
 * sent reaches Google, and the extended properties carry the appointment and
 * workspace ids so an inbound change can be attributed by identity rather than
 * by matching a customer's name against an event title.
 */
export async function createEvent(input: CreateEventInput, token: Secret, now: Date): Promise<CalendarResult<CalendarEvent>> {
  const body = {
    summary: input.summary,
    description: input.description,
    // Both the instant and the zone: Google needs the offset to place the
    // event, and the zone so that a later edit in its UI behaves like a
    // business-local booking rather than a fixed offset.
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    extendedProperties: {
      private: {
        [APPOINTMENT_PROPERTY]: input.appointmentId,
        [WORKSPACE_PROPERTY]: input.workspaceId,
      },
    },
  };

  if (serverEnv.googleCalendarMode === "simulated") return simulatedCalendar.createEvent(input, now);

  const result = await request<RawEvent>({
    path: `calendars/${encodeURIComponent(input.calendarId)}/events`,
    method: "POST",
    body,
    token,
    now,
  });
  if (!result.ok) return result;

  const event = toCalendarEvent(result.value, input.timeZone);
  return event ? { ok: true, value: event } : { ok: false, error: CALENDAR_ERRORS.malformed("event was unreadable", now) };
}

export async function patchEventTime(
  input: { calendarId: string; eventId: string; start: Date; end: Date; timeZone: string },
  token: Secret,
  now: Date
): Promise<CalendarResult<CalendarEvent>> {
  if (serverEnv.googleCalendarMode === "simulated") return simulatedCalendar.patchEventTime(input, now);

  const result = await request<RawEvent>({
    path: `calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    method: "PATCH",
    body: {
      start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    },
    token,
    now,
  });
  if (!result.ok) {
    return result.error.code === "calendar_not_found"
      ? { ok: false, error: CALENDAR_ERRORS.eventMissing(now) }
      : result;
  }

  const event = toCalendarEvent(result.value, input.timeZone);
  return event ? { ok: true, value: event } : { ok: false, error: CALENDAR_ERRORS.malformed("event was unreadable", now) };
}

/**
 * Cancel an event rather than delete it.
 *
 * `status: cancelled` keeps the event addressable: the id still resolves, the
 * history stays visible to the calendar's owner, and a later reconciliation can
 * still ask Google what happened to it. A hard delete makes the id return 404
 * forever, which turns every subsequent check into "the event is missing" —
 * indistinguishable from someone having removed it by hand.
 */
export async function cancelEvent(
  input: { calendarId: string; eventId: string },
  token: Secret,
  now: Date
): Promise<CalendarResult<void>> {
  if (serverEnv.googleCalendarMode === "simulated") return simulatedCalendar.cancelEvent(input, now);

  const result = await request<RawEvent>({
    path: `calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    method: "PATCH",
    body: { status: "cancelled" },
    token,
    now,
  });

  if (!result.ok) {
    // Already gone is the outcome we wanted. Reporting failure would make a
    // retried cancellation look like a fault.
    if (result.error.code === "calendar_not_found") return { ok: true, value: undefined };
    return result;
  }
  return { ok: true, value: undefined };
}

export { OAuthError };
