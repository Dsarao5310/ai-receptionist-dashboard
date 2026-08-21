import { describe, expect, it } from "vitest";
import {
  addZonedDays,
  endOfZonedDay,
  formatWallClockTime,
  getZonedParts,
  isSameZonedDay,
  isValidTimeZone,
  startOfZonedDay,
  wallClockToInstant,
  zonedDayKey,
  zonedMinutesOfDay,
  zonedWeekday,
} from "./timezone";

/**
 * The runner's own timezone is UTC (see vitest.config.ts), and every business
 * zone below is deliberately something else — a bug that reads the process
 * timezone instead of the business one will therefore fail rather than pass by
 * coincidence.
 */

const VANCOUVER = "America/Vancouver";
const TOKYO = "Asia/Tokyo";
const LONDON = "Europe/London";

describe("getZonedParts", () => {
  it("reads wall-clock fields in the requested zone, not the process zone", () => {
    const instant = new Date("2026-08-17T18:30:00Z");

    expect(getZonedParts(instant, VANCOUVER)).toMatchObject({ year: 2026, month: 8, day: 17, hour: 11, minute: 30, weekday: "Mon" });
    expect(getZonedParts(instant, TOKYO)).toMatchObject({ year: 2026, month: 8, day: 18, hour: 3, minute: 30, weekday: "Tue" });
    expect(getZonedParts(instant, LONDON)).toMatchObject({ hour: 19, weekday: "Mon" });
  });

  it("represents midnight as hour 0, never 24", () => {
    // 07:00Z is 00:00 in Vancouver during PDT.
    expect(getZonedParts(new Date("2026-08-17T07:00:00Z"), VANCOUVER).hour).toBe(0);
  });
});

describe("zonedDayKey", () => {
  it("assigns the instant to the correct calendar day per zone", () => {
    // 06:00Z on the 18th is still the 17th in Vancouver but already the 18th in Tokyo.
    const instant = new Date("2026-08-18T06:00:00Z");
    expect(zonedDayKey(instant, VANCOUVER)).toBe("2026-08-17");
    expect(zonedDayKey(instant, TOKYO)).toBe("2026-08-18");
  });

  it("does not shift the day for a late-evening local time", () => {
    // 23:30 in Tokyo on the 18th is 14:30Z the same day.
    expect(zonedDayKey(new Date("2026-08-18T14:30:00Z"), TOKYO)).toBe("2026-08-18");
  });
});

describe("zonedWeekday", () => {
  it("returns the weekday as seen in the business zone", () => {
    // Sunday 23:00 in Vancouver is already Monday in UTC.
    const instant = new Date("2026-08-17T06:00:00Z");
    expect(zonedWeekday(instant, VANCOUVER)).toBe("Sun");
    expect(zonedWeekday(instant, "UTC")).toBe("Mon");
  });
});

describe("zonedMinutesOfDay", () => {
  it("counts minutes from local midnight", () => {
    expect(zonedMinutesOfDay(new Date("2026-08-17T18:30:00Z"), VANCOUVER)).toBe(11 * 60 + 30);
    expect(zonedMinutesOfDay(new Date("2026-08-17T18:30:00Z"), TOKYO)).toBe(3 * 60 + 30);
  });
});

describe("wallClockToInstant", () => {
  it("resolves a wall-clock reading to the instant it names", () => {
    // 09:00 in Vancouver during PDT (UTC-7) is 16:00Z.
    expect(wallClockToInstant("2026-08-17", "09:00", VANCOUVER).toISOString()).toBe("2026-08-17T16:00:00.000Z");
    // 09:00 in Tokyo (UTC+9) is 00:00Z the same day.
    expect(wallClockToInstant("2026-08-18", "09:00", TOKYO).toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });

  it("honours the standard/summer-time offset in force on that date", () => {
    // Vancouver is UTC-7 in August (PDT) and UTC-8 in January (PST).
    expect(wallClockToInstant("2026-08-17", "12:00", VANCOUVER).toISOString()).toBe("2026-08-17T19:00:00.000Z");
    expect(wallClockToInstant("2026-01-17", "12:00", VANCOUVER).toISOString()).toBe("2026-01-17T20:00:00.000Z");
  });

  it("round-trips through zonedDayKey for a time near midnight", () => {
    const instant = wallClockToInstant("2026-03-09", "00:30", VANCOUVER);
    expect(zonedDayKey(instant, VANCOUVER)).toBe("2026-03-09");
    expect(zonedMinutesOfDay(instant, VANCOUVER)).toBe(30);
  });

  it("never drifts the calendar day, at any hour of any day of a full year", () => {
    // The strongest guarantee this function owes callers: a stored day+time must
    // read back as that same day. Sweeping a whole year covers both DST
    // transitions without hard-coding when they fall.
    let cursor = new Date(Date.UTC(2026, 0, 1));
    let checked = 0;
    while (cursor.getUTCFullYear() === 2026) {
      const dayKey = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(
        cursor.getUTCDate()
      ).padStart(2, "0")}`;
      for (const hhmm of ["00:00", "00:30", "02:30", "12:00", "23:30"]) {
        expect(zonedDayKey(wallClockToInstant(dayKey, hhmm, VANCOUVER), VANCOUVER)).toBe(dayKey);
        checked++;
      }
      cursor = new Date(cursor.getTime() + 86400000);
    }
    expect(checked).toBeGreaterThan(1800);
  });
});

/**
 * DST rules are tzdata-version specific and genuinely disagree between runtimes:
 * the Node build here encodes permanent summer time for Vancouver from 2026,
 * while the browser still has a November transition. Asserting a fixed
 * transition date would test the tz database rather than this code, so these
 * tests locate whatever transitions the current runtime has and assert the
 * behaviour around them.
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asIfUtc - instant.getTime()) / 60000;
}

/** Instants where the zone's UTC offset changes, found by hourly sweep. */
function findTransitions(timeZone: string, year: number): Date[] {
  const found: Date[] = [];
  let previous = offsetMinutesAt(new Date(Date.UTC(year, 0, 1)), timeZone);
  for (let t = Date.UTC(year, 0, 1) + 3600000; t < Date.UTC(year + 1, 0, 1); t += 3600000) {
    const current = offsetMinutesAt(new Date(t), timeZone);
    if (current !== previous) found.push(new Date(t));
    previous = current;
  }
  return found;
}

describe("daylight-saving transitions", () => {
  // The four business zones the app is tested against, plus a southern-hemisphere
  // zone whose transitions fall the opposite way round. Tokyo has no DST at all,
  // which is the point: the no-transition path must behave too.
  const zones = [VANCOUVER, "America/New_York", LONDON, TOKYO, "Australia/Sydney"];

  it("keeps a stored appointment time on its own day across every transition this runtime has", () => {
    for (const zone of zones) {
      for (const transition of findTransitions(zone, 2026)) {
        const dayKey = zonedDayKey(transition, zone);
        for (const hhmm of ["00:00", "01:30", "02:30", "09:00", "23:00"]) {
          expect(zonedDayKey(wallClockToInstant(dayKey, hhmm, zone), zone), `${zone} ${dayKey} ${hhmm}`).toBe(dayKey);
        }
      }
    }
  });

  it("gives the transition day the length the offset change implies", () => {
    for (const zone of zones) {
      for (const transition of findTransitions(zone, 2026)) {
        const start = startOfZonedDay(transition, zone);
        const end = endOfZonedDay(transition, zone);
        const hours = (end.getTime() - start.getTime() + 1) / 3600000;
        // 23 when clocks go forward, 25 when they go back; never anything else.
        expect([23, 25], `${zone} ${zonedDayKey(transition, zone)} was ${hours}h`).toContain(hours);
      }
    }
  });

  it("holds the wall-clock time steady when stepping across a transition", () => {
    for (const zone of zones) {
      for (const transition of findTransitions(zone, 2026)) {
        const dayBefore = wallClockToInstant(zonedDayKey(addZonedDays(transition, zone, -1), zone), "09:00", zone);
        const dayAfter = addZonedDays(dayBefore, zone, 2);
        expect(zonedMinutesOfDay(dayAfter, zone), `${zone}`).toBe(9 * 60);
      }
    }
  });

  it("finds transitions in at least one zone, so the assertions above are not vacuous", () => {
    const total = zones.reduce((sum, zone) => sum + findTransitions(zone, 2026).length, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("startOfZonedDay / endOfZonedDay", () => {
  it("brackets the business day in its own zone", () => {
    const midday = new Date("2026-08-17T19:00:00Z"); // noon Vancouver
    expect(startOfZonedDay(midday, VANCOUVER).toISOString()).toBe("2026-08-17T07:00:00.000Z");
    expect(endOfZonedDay(midday, VANCOUVER).toISOString()).toBe("2026-08-18T06:59:59.999Z");
  });

  it("brackets a different day for a zone on the other side of the date line", () => {
    const instant = new Date("2026-08-17T19:00:00Z"); // 04:00 on the 18th in Tokyo
    expect(zonedDayKey(startOfZonedDay(instant, TOKYO), TOKYO)).toBe("2026-08-18");
  });

  it("covers exactly the instants belonging to that local day", () => {
    const midday = new Date("2026-08-17T19:00:00Z");
    const start = startOfZonedDay(midday, VANCOUVER);
    const end = endOfZonedDay(midday, VANCOUVER);
    expect(zonedDayKey(start, VANCOUVER)).toBe("2026-08-17");
    expect(zonedDayKey(end, VANCOUVER)).toBe("2026-08-17");
    expect(zonedDayKey(new Date(start.getTime() - 1), VANCOUVER)).toBe("2026-08-16");
    expect(zonedDayKey(new Date(end.getTime() + 1), VANCOUVER)).toBe("2026-08-18");
  });
});

describe("addZonedDays", () => {
  it("rolls over month and year boundaries", () => {
    const nye = wallClockToInstant("2026-12-31", "10:00", TOKYO);
    expect(zonedDayKey(addZonedDays(nye, TOKYO, 1), TOKYO)).toBe("2027-01-01");
  });

  it("steps backwards", () => {
    const instant = wallClockToInstant("2026-03-01", "10:00", VANCOUVER);
    expect(zonedDayKey(addZonedDays(instant, VANCOUVER, -1), VANCOUVER)).toBe("2026-02-28");
  });
});

describe("isSameZonedDay", () => {
  it("compares by the business zone's calendar", () => {
    const a = new Date("2026-08-18T02:00:00Z"); // 19:00 on the 17th in Vancouver
    const b = new Date("2026-08-17T20:00:00Z"); // 13:00 on the 17th in Vancouver
    expect(isSameZonedDay(a, b, VANCOUVER)).toBe(true);
    expect(isSameZonedDay(a, b, "UTC")).toBe(false);
  });
});

describe("formatWallClockTime", () => {
  it("renders stored 24-hour values for display", () => {
    expect(formatWallClockTime("09:00")).toBe("9:00 AM");
    expect(formatWallClockTime("13:05")).toBe("1:05 PM");
    expect(formatWallClockTime("00:00")).toBe("12:00 AM");
    expect(formatWallClockTime("12:00")).toBe("12:00 PM");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real zones and rejects nonsense", () => {
    expect(isValidTimeZone(VANCOUVER)).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});
