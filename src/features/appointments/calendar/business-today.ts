import { parseDayKey, zonedDayKey } from "@/lib/timezone";

/**
 * Which grid cell should be highlighted as "today".
 *
 * The calendar grid is built from plain calendar dates constructed and read in
 * local time, which is self-consistent and produces the right day-key strings.
 * What must not come from the browser is *which day is today* — that is a fact
 * about the business's clock. So it is resolved in the business timezone and
 * then expressed as a local calendar date for the grid to work with.
 */
export function businessTodayAsCalendarDate(now: Date, timeZone: string): Date {
  const { year, month, day } = parseDayKey(zonedDayKey(now, timeZone));
  return new Date(year, month - 1, day);
}
