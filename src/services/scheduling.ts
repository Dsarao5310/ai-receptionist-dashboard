import type { AppConfiguration, Appointment, TimeInterval } from "@/types";
import { formatWallClockTime, wallClockToInstant } from "@/lib/timezone";
import { businessZone, getEffectiveHoursForDay, toMinutes } from "./business";

/**
 * Whether a proposed wall-clock slot can be booked.
 *
 * ── Three separate questions ────────────────────────────────────────────────
 * They are kept apart deliberately, because they fail for different reasons and
 * are answered by different authorities:
 *
 *   1. **Business-time validity** — is this inside the hours the business keeps?
 *      `checkBusinessTime`. Depends only on the configuration; no clock.
 *   2. **Temporal validity** — is this actually still in the future?
 *      `checkTemporal`. Depends only on the clock; no hours.
 *   3. **Real availability** — is the slot free, given other bookings, staff and
 *      capacity? Not answered here at all. It needs the authoritative backend
 *      and atomic reservation, and arrives with the integrations phase.
 *
 * Yesterday at 10am passes (1) and fails (2). Tomorrow at 3am passes (2) and
 * fails (1). Rescheduling requires both, which is what `checkRescheduleSlot`
 * composes. Neither implies (3): a slot that passes both may still be
 * double-booked, which is why the UI says "valid business time" and never
 * "available".
 *
 * ── How it decides ──────────────────────────────────────────────────────────
 * Everything is computed in wall-clock minutes on the business's own calendar
 * day, which is the form opening hours are actually expressed in. Special hours
 * override the weekly schedule (via `getEffectiveHoursForDay`), split shifts
 * stay split, and the *whole* appointment — start plus its duration — has to
 * fit inside a single open interval.
 *
 * The viewer's timezone has no influence whatsoever: no instant is constructed
 * from the browser clock anywhere in this file.
 *
 * ── The clock ───────────────────────────────────────────────────────────────
 * Nothing in this module reads the ambient clock. Anything time-dependent takes
 * `now` as an argument, so tests are deterministic and the eventual backend can
 * pass its own trusted clock rather than trusting whatever the browser claimed.
 *
 * ── Future shape ────────────────────────────────────────────────────────────
 * These are pure functions over the configuration, so the eventual flow —
 * local UX validation, then an authenticated backend that is authoritative —
 * can call the same rules on both sides without either drifting. Local checks
 * exist to give immediate feedback, never to be the last word.
 */

/** Why a proposed slot cannot be booked. */
export type SlotRejection =
  | "closed_day"
  | "before_opening"
  | "after_closing"
  | "between_intervals"
  | "overruns_closing"
  | "in_past";

export interface SlotCheck {
  valid: boolean;
  reason: SlotRejection | null;
  /** Plain language for the customer-facing UI — no timezone maths, no internals. */
  message: string;
}

const VALID: SlotCheck = { valid: true, reason: null, message: "" };

/** Granularity offered when suggesting start times. Quarter-hours match how the seeded data books. */
const SUGGESTION_STEP_MIN = 15;

function reject(reason: SlotRejection, message: string): SlotCheck {
  return { valid: false, reason, message };
}

/** Sorted copy, so a configuration with out-of-order intervals still reasons correctly. */
function orderedIntervals(intervals: TimeInterval[]): TimeInterval[] {
  return [...intervals].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
}

/**
 * Checks a proposed start time and duration against the business's hours for
 * that day.
 *
 * `durationMin` must come from the appointment's own booking snapshot
 * (`appointment.service.durationMin`) when rescheduling an existing booking —
 * see `checkRescheduleSlot`.
 */
export function checkBusinessTime(
  config: AppConfiguration,
  dayKey: string,
  time: string,
  durationMin: number
): SlotCheck {
  const hours = getEffectiveHoursForDay(config, dayKey);

  if (!hours.isOpen || hours.intervals.length === 0) {
    return reject(
      "closed_day",
      hours.exception?.label
        ? `The business is closed on this date (${hours.exception.label}).`
        : "The business is closed on this date."
    );
  }

  const intervals = orderedIntervals(hours.intervals);
  const start = toMinutes(time);
  const end = start + durationMin;

  // The whole appointment has to sit inside one interval — a booking that
  // starts before closing but runs past it is not a bookable slot.
  if (intervals.some((i) => start >= toMinutes(i.open) && end <= toMinutes(i.close))) return VALID;

  const firstOpen = toMinutes(intervals[0].open);
  const lastClose = toMinutes(intervals[intervals.length - 1].close);

  if (start < firstOpen) {
    return reject("before_opening", `The business opens at ${formatWallClockTime(intervals[0].open)} on this date.`);
  }
  if (start >= lastClose) {
    return reject("after_closing", `The business closes at ${formatWallClockTime(intervals[intervals.length - 1].close)} on this date.`);
  }

  // Inside the working day but not inside a single interval: either it starts
  // in a gap between shifts, or it starts in a shift and overruns the end of it.
  const containing = intervals.find((i) => start >= toMinutes(i.open) && start < toMinutes(i.close));
  if (containing) {
    return reject(
      "overruns_closing",
      `This appointment would end after ${formatWallClockTime(containing.close)}. It needs ${formatDurationForMessage(durationMin)}.`
    );
  }
  return reject("between_intervals", "This time falls between the business's opening periods.");
}

/**
 * Whether a proposed wall-clock slot is still in the future.
 *
 * The stored day and time mean nothing until resolved against the business
 * timezone, so that conversion happens first and the comparison is then made
 * between two absolute instants. Comparing formatted strings, or building a
 * date with `new Date(year, month, day)`, would answer the question on the
 * viewer's clock — a shop in Vancouver would consider Tuesday 2pm "past" or
 * "future" depending on where the person looking at the screen is sitting.
 *
 * The boundary is strict: an instant equal to `now` is already gone by the time
 * the write completes, so only `requested > now` counts as future.
 *
 * This does not apply any minimum booking notice. `ai.booking.minNoticeMin`
 * governs what the receptionist offers callers, and is a separate, later
 * boundary that reschedule does not currently enforce.
 */
export function checkTemporal(config: AppConfiguration, dayKey: string, time: string, now: Date): SlotCheck {
  const requested = wallClockToInstant(dayKey, time, businessZone(config));
  if (requested.getTime() > now.getTime()) return VALID;
  return reject("in_past", "Appointments cannot be rescheduled to a time that has already passed.");
}

/**
 * The reschedule rule, stated once.
 *
 * A slot has to be both still ahead of us *and* inside opening hours — neither
 * implies the other. Temporal validity is checked first, because "that time has
 * already passed" explains a past date far better than "we open at 9:00 AM"
 * would.
 *
 * Rescheduling changes *when* an appointment happens and nothing else. The
 * duration comes from the booking's own immutable snapshot, never from the
 * catalogue as it stands today: a customer who booked a 30-minute haircut keeps
 * a 30-minute appointment even after the salon lengthens that service to 45.
 * Changing what was agreed would need an explicit change-of-service action that
 * writes a new snapshot — a separate workflow that does not exist yet.
 *
 * This also means an appointment whose service has since been deleted from the
 * catalogue can still be rescheduled: its snapshot carries everything needed.
 *
 * An appointment that already happened may still be rescheduled — the
 * restriction is on the *requested* time, not on the record being edited.
 * Correcting a historical appointment to another historical time is a separate
 * administrative capability that does not exist yet, and must not be smuggled
 * in by relaxing this rule.
 */
export function checkRescheduleSlot(
  config: AppConfiguration,
  appointment: Pick<Appointment, "service">,
  dayKey: string,
  time: string,
  now: Date
): SlotCheck {
  const temporal = checkTemporal(config, dayKey, time, now);
  if (!temporal.valid) return temporal;
  return checkBusinessTime(config, dayKey, time, appointment.service.durationMin);
}

export interface StartTimeOptions {
  /**
   * When supplied, slots that have already passed are dropped. Omit only when
   * listing a day's hours in the abstract — anything offered to a user as a
   * choice must pass a clock, or it will suggest times from this morning.
   */
  now?: Date;
  stepMin?: number;
}

/**
 * Every start time on a day that a booking of this length fits into, on a
 * quarter-hour grid aligned to each interval's opening time.
 *
 * Empty when the business is closed, when no shift is long enough, or when
 * `now` is given and the whole day has gone.
 */
export function getValidStartTimes(
  config: AppConfiguration,
  dayKey: string,
  durationMin: number,
  options: StartTimeOptions = {}
): string[] {
  const { now, stepMin = SUGGESTION_STEP_MIN } = options;
  const hours = getEffectiveHoursForDay(config, dayKey);
  if (!hours.isOpen) return [];

  const times: string[] = [];
  for (const interval of orderedIntervals(hours.intervals)) {
    const open = toMinutes(interval.open);
    const close = toMinutes(interval.close);
    for (let start = open; start + durationMin <= close; start += stepMin) {
      const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      if (now && !checkTemporal(config, dayKey, time, now).valid) continue;
      times.push(time);
    }
  }
  return times;
}

/**
 * A few bookable start times nearest the one the user asked for, so an invalid
 * choice can be answered with something useful rather than only a refusal.
 * Returned in chronological order.
 *
 * Pass `now` — a suggestion the user cannot act on is worse than no suggestion.
 */
export function getNearbyStartTimes(
  config: AppConfiguration,
  dayKey: string,
  time: string,
  durationMin: number,
  options: StartTimeOptions & { limit?: number } = {}
): string[] {
  const { limit = 3, ...startOptions } = options;
  const all = getValidStartTimes(config, dayKey, durationMin, startOptions);
  if (all.length <= limit) return all;

  const target = toMinutes(time);
  return [...all]
    .sort((a, b) => Math.abs(toMinutes(a) - target) - Math.abs(toMinutes(b) - target))
    .slice(0, limit)
    .sort((a, b) => toMinutes(a) - toMinutes(b));
}

/** True when the business has any opening hours at all on this date. */
export function isOpenOnDay(config: AppConfiguration, dayKey: string): boolean {
  const hours = getEffectiveHoursForDay(config, dayKey);
  return hours.isOpen && hours.intervals.length > 0;
}

function formatDurationForMessage(durationMin: number): string {
  if (durationMin < 60) return `${durationMin} minutes`;
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return m === 0 ? hours : `${hours} ${m} minutes`;
}
