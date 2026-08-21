import { describe, expect, it } from "vitest";
import { getAppointmentRangeBounds, getPreviousPeriod, getRangeBounds, inBounds } from "./date-range";
import { buildBuckets } from "./buckets";
import { zonedDayKey } from "./timezone";

const VANCOUVER = "America/Vancouver";
const TOKYO = "Asia/Tokyo";

/** Process timezone is UTC, so any range that silently used it would fail here. */

describe("getRangeBounds", () => {
  it("brackets the business's today, not the viewer's", () => {
    // 2026-08-18T04:00Z is the 17th in Vancouver but already the 18th in Tokyo.
    const now = new Date("2026-08-18T04:00:00Z");

    const vanc = getRangeBounds("today", now, VANCOUVER);
    expect(zonedDayKey(vanc.start, VANCOUVER)).toBe("2026-08-17");
    expect(zonedDayKey(vanc.end, VANCOUVER)).toBe("2026-08-17");

    const tokyo = getRangeBounds("today", now, TOKYO);
    expect(zonedDayKey(tokyo.start, TOKYO)).toBe("2026-08-18");
  });

  it("spans exactly N business days for each preset", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    for (const [key, days] of [["today", 1], ["7d", 7], ["30d", 30], ["90d", 90]] as const) {
      const bounds = getRangeBounds(key, now, VANCOUVER);
      const spanDays = (bounds.end.getTime() - bounds.start.getTime() + 1) / 86400000;
      // Whole days, allowing an hour either way for a DST change inside the window.
      expect(Math.round(spanDays), key).toBe(days);
    }
  });

  it("includes an event later today, so same-session edits stay in range", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    const bounds = getRangeBounds("today", now, VANCOUVER);
    const laterToday = new Date("2026-08-18T04:00:00Z"); // 21:00 the same Vancouver day
    expect(inBounds(laterToday, bounds)).toBe(true);
  });

  it("honours an explicit custom range untouched", () => {
    const custom = { start: new Date("2026-01-01T00:00:00Z"), end: new Date("2026-01-31T23:59:59Z") };
    expect(getRangeBounds("custom", new Date(), VANCOUVER, custom)).toBe(custom);
  });
});

describe("getPreviousPeriod", () => {
  it("is the same length and does not overlap", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    const current = getRangeBounds("7d", now, VANCOUVER);
    const previous = getPreviousPeriod(current);

    expect(previous.end.getTime()).toBe(current.start.getTime() - 1);
    expect(previous.end.getTime() - previous.start.getTime()).toBe(current.end.getTime() - current.start.getTime());
    expect(inBounds(previous.end, current)).toBe(false);
  });
});

describe("getAppointmentRangeBounds", () => {
  it("centres on the business's today so upcoming appointments are visible", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    const bounds = getAppointmentRangeBounds("7d", now, VANCOUVER);
    expect(zonedDayKey(bounds.start, VANCOUVER)).toBe("2026-08-14");
    expect(zonedDayKey(bounds.end, VANCOUVER)).toBe("2026-08-20");
  });

  it("covers only the business's today for the Today preset", () => {
    const now = new Date("2026-08-18T04:00:00Z"); // still the 17th in Vancouver
    const bounds = getAppointmentRangeBounds("today", now, VANCOUVER);
    expect(zonedDayKey(bounds.start, VANCOUVER)).toBe("2026-08-17");
    expect(zonedDayKey(bounds.end, VANCOUVER)).toBe("2026-08-17");
  });
});

describe("buildBuckets", () => {
  it("creates one bucket per business day and labels it in that zone", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    const bounds = getRangeBounds("7d", now, VANCOUVER);
    const buckets = buildBuckets(bounds, VANCOUVER);

    expect(buckets).toHaveLength(7);
    expect(buckets[0].dateKey).toBe("2026-08-11");
    expect(buckets[6].dateKey).toBe("2026-08-17");
    // Buckets tile the range without gaps or overlaps.
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].start.getTime()).toBe(buckets[i - 1].end.getTime() + 1);
    }
  });

  it("puts an event into the bucket for its business day", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    const buckets = buildBuckets(getRangeBounds("7d", now, VANCOUVER), VANCOUVER);
    // 2026-08-18T04:00Z is 21:00 on the 17th in Vancouver — the final bucket.
    const evening = new Date("2026-08-18T04:00:00Z");
    const owning = buckets.filter((b) => inBounds(evening, b));
    expect(owning).toHaveLength(1);
    expect(owning[0].dateKey).toBe("2026-08-17");
  });

  it("switches to weekly buckets for long ranges", () => {
    const now = new Date("2026-08-17T19:00:00Z");
    const buckets = buildBuckets(getRangeBounds("90d", now, VANCOUVER), VANCOUVER);
    expect(buckets.length).toBeLessThan(20);
    expect(buckets.length).toBeGreaterThan(10);
  });
});
