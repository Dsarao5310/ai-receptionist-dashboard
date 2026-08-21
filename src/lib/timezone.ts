import type { Weekday } from "@/types/config";

/**
 * Timezone-aware date maths.
 *
 * A `Date` is an instant, not a wall-clock reading. Everything the business
 * cares about — "are we open?", "which day is this appointment on?", "when do
 * customers call?" — is a *wall-clock* question, and the answer must come from
 * the business's own timezone rather than whatever timezone the browser happens
 * to be in. Native `getHours()` / `getDay()` / `setHours()` always read the
 * browser's zone, so they are wrong for those questions and are deliberately not
 * used anywhere below.
 *
 * Note on this codebase's Intl caveat: some ICU builds mis-render
 * `DateTimeFormat` options that request `day`/`year` while omitting `month`.
 * Every formatter here requests a full, explicit field set, which avoids it.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: Weekday;
}

const WEEKDAY_FROM_SHORT: Record<string, Weekday> = {
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

/** Formatters are expensive to construct; reuse one per timezone. */
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Reads the wall-clock fields an observer in `timeZone` would see at this instant. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some ICU builds render midnight as "24" under hour12:false.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_FROM_SHORT[map.weekday] ?? "Mon",
  };
}

/** How far `timeZone` is ahead of UTC at this instant, in milliseconds. */
function getZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Millisecond precision is lost by the formatter; add it back so the offset is exact.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

export function zonedDayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = getZonedParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function zonedWeekday(instant: Date, timeZone: string): Weekday {
  return getZonedParts(instant, timeZone).weekday;
}

/** Minutes since midnight in the business's zone — the value that hours comparisons need. */
export function zonedMinutesOfDay(instant: Date, timeZone: string): number {
  const { hour, minute } = getZonedParts(instant, timeZone);
  return hour * 60 + minute;
}

export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split("-").map(Number);
  return { year, month, day };
}

export function parseTimeOfDay(hhmm: string): { hour: number; minute: number } {
  const [hour, minute] = hhmm.split(":").map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

/**
 * Turns a wall-clock reading in `timeZone` into the instant it refers to.
 *
 * Resolved in two passes: the first guess uses the offset at the *approximate*
 * instant, the second re-reads the offset at that corrected instant. Without the
 * second pass, times near a DST transition land an hour out. Where a wall-clock
 * time is ambiguous (the repeated hour when clocks go back) this settles on the
 * earlier of the two, and where it does not exist (the skipped hour when clocks
 * go forward) it settles just after the jump — both are the conventional choices.
 */
export function wallClockToInstant(dayKey: string, hhmm: string, timeZone: string): Date {
  const { year, month, day } = parseDayKey(dayKey);
  const { hour, minute } = parseTimeOfDay(hhmm);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let offset = getZoneOffsetMs(new Date(naiveUtc), timeZone);
  let instant = new Date(naiveUtc - offset);
  offset = getZoneOffsetMs(instant, timeZone);
  instant = new Date(naiveUtc - offset);
  return instant;
}

export function startOfZonedDay(instant: Date, timeZone: string): Date {
  return wallClockToInstant(zonedDayKey(instant, timeZone), "00:00", timeZone);
}

export function endOfZonedDay(instant: Date, timeZone: string): Date {
  const nextDay = addZonedDays(startOfZonedDay(instant, timeZone), timeZone, 1);
  return new Date(nextDay.getTime() - 1);
}

/**
 * Adds calendar days while holding the wall-clock time steady, so "tomorrow at
 * 9am" stays 9am across a DST change instead of drifting to 8 or 10.
 */
export function addZonedDays(instant: Date, timeZone: string, days: number): Date {
  const p = getZonedParts(instant, timeZone);
  // Date.UTC normalises overflow (e.g. Jan 32 -> Feb 1) for us.
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  const dayKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}`;
  return wallClockToInstant(dayKey, `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, timeZone);
}

/** Start of the day `days` away, in the business's zone. */
export function startOfZonedDayOffset(instant: Date, timeZone: string, days: number): Date {
  return startOfZonedDay(addZonedDays(startOfZonedDay(instant, timeZone), timeZone, days), timeZone);
}

export function isSameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  return zonedDayKey(a, timeZone) === zonedDayKey(b, timeZone);
}

/**
 * Formats an instant as seen in `timeZone`. Callers that ask for `day` should
 * also ask for `month` — see the Intl note at the top of this file.
 */
export function formatInZone(instant: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(instant);
}

/** Formats a stored wall-clock day (`YYYY-MM-DD`) without letting UTC parsing shift it. */
export function formatDayKey(dayKey: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return formatInZone(wallClockToInstant(dayKey, "12:00", timeZone), timeZone, options);
}

/** "09:00" -> "9:00 AM", independent of any timezone since it is already a wall-clock value. */
export function formatWallClockTime(hhmm: string): string {
  const { hour, minute } = parseTimeOfDay(hhmm);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return hhmm;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** True when the IANA zone is one this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
