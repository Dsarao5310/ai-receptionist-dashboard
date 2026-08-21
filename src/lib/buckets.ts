import { addZonedDays, formatInZone, startOfZonedDay, zonedDayKey } from "./timezone";
import { bucketGranularity, inBounds, type Bounds } from "./date-range";

export interface Bucket {
  start: Date;
  end: Date;
  label: string;
  dateKey: string;
}

/**
 * Splits a range into day- or week-sized buckets (weeks once the range exceeds
 * ~6 weeks, so long ranges stay legible). Shared by every time-series selector
 * so the Overview and Analytics charts always bucket identically.
 *
 * Bucket edges follow the business's calendar days. Bucketing on the viewer's
 * midnight would slide activity between adjacent columns for anyone in a
 * different timezone, so two people could read different daily totals from the
 * same data.
 */
export function buildBuckets(bounds: Bounds, timeZone: string): Bucket[] {
  const stepDays = bucketGranularity(bounds) === "day" ? 1 : 7;
  const buckets: Bucket[] = [];

  let cursor = startOfZonedDay(bounds.start, timeZone);
  while (cursor <= bounds.end) {
    const next = startOfZonedDay(addZonedDays(cursor, timeZone, stepDays), timeZone);
    buckets.push({
      start: cursor,
      end: new Date(Math.min(next.getTime() - 1, bounds.end.getTime())),
      label: formatInZone(cursor, timeZone, { month: "short", day: "numeric" }),
      dateKey: zonedDayKey(cursor, timeZone),
    });
    cursor = next;
  }
  return buckets;
}

export function countInBucket<T>(items: T[], getDate: (item: T) => string, bucket: Bucket) {
  return items.filter((item) => inBounds(getDate(item), bucket)).length;
}
