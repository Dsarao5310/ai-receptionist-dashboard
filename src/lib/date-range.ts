import type { DateRangeKey } from "@/types";
import { addZonedDays, endOfZonedDay, startOfZonedDay } from "./timezone";

export interface Bounds {
  start: Date;
  end: Date;
}

/**
 * Backward-looking ranges for activity logs, aligned to whole days *in the
 * business timezone*: "7D" is the business's last 7 calendar days including its
 * today, not the last 168 hours and not the viewer's calendar. A manager
 * checking the dashboard from another country must see the same "Today" figures
 * as the person standing in the shop.
 *
 * Ending at end-of-today rather than the current instant matters for more than
 * tidiness — records mutated during the session (cancelling an appointment,
 * say) get an `updatedAt` later than the moment the page loaded, and an
 * instant-based upper bound would silently drop them out of every range.
 */
export function getRangeBounds(key: DateRangeKey, now: Date, timeZone: string, custom?: Bounds): Bounds {
  if (key === "custom" && custom) return custom;
  const daysBack = key === "today" ? 0 : key === "30d" ? 29 : key === "90d" ? 89 : 6;
  return {
    start: startOfZonedDay(addZonedDays(now, timeZone, -daysBack), timeZone),
    end: endOfZonedDay(now, timeZone),
  };
}

/**
 * Same preset keys as getRangeBounds, but centered on `now` instead of ending at it —
 * appointments are scheduled forward as often as they're logged in the past, so a
 * backward-only window (like the activity-log pages use) would hide everything upcoming.
 */
export function getAppointmentRangeBounds(key: DateRangeKey, now: Date, timeZone: string, custom?: Bounds): Bounds {
  if (key === "custom" && custom) return custom;
  const span = (back: number, forward: number): Bounds => ({
    start: startOfZonedDay(addZonedDays(now, timeZone, -back), timeZone),
    end: endOfZonedDay(addZonedDays(now, timeZone, forward), timeZone),
  });
  switch (key) {
    case "today":
      return span(0, 0);
    case "30d":
      return span(15, 14);
    case "90d":
      return span(45, 44);
    default:
      return span(3, 3);
  }
}

/**
 * The equal-length window immediately before this one, used for every
 * "vs. previous period" comparison. Ends 1ms before the current window starts
 * so the two never overlap and a record on the boundary is counted once.
 */
export function getPreviousPeriod({ start, end }: Bounds): Bounds {
  const lengthMs = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - lengthMs - 1), end: new Date(start.getTime() - 1) };
}

export function inBounds(date: Date | string, bounds: Bounds) {
  const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  return t >= bounds.start.getTime() && t <= bounds.end.getTime();
}

export const RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "custom", label: "Custom" },
];

export function bucketCount(bounds: Bounds): number {
  const days = Math.round((bounds.end.getTime() - bounds.start.getTime()) / 86400000) + 1;
  return days > 45 ? Math.ceil(days / 7) : days;
}

export function bucketGranularity(bounds: Bounds): "day" | "week" {
  const days = Math.round((bounds.end.getTime() - bounds.start.getTime()) / 86400000) + 1;
  return days > 45 ? "week" : "day";
}
