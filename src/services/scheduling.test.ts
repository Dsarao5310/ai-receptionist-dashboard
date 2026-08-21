import { describe, expect, it } from "vitest";
import type { AppConfiguration, Appointment, SpecialHours } from "@/types";
import { DEFAULT_CONFIGURATION } from "@/data/default-config";
import { getZonedParts, wallClockToInstant, zonedDayKey } from "@/lib/timezone";
import { appointmentInstant, getServiceDrift } from "./business";
import {
  checkBusinessTime,
  checkRescheduleSlot,
  checkTemporal,
  getNearbyStartTimes,
  getValidStartTimes,
  isOpenOnDay,
} from "./scheduling";

/**
 * Daylight-saving rules are tzdata-version specific and genuinely disagree
 * between runtimes, so transitions are discovered rather than assumed.
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime()) / 60000;
}

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

/**
 * Seeded weekly hours, which every case below is written against:
 *   Mon–Wed & Fri 09:00–18:00 · Thu 09:00–19:00 · Sat 10:00–16:00 · Sun closed
 *
 * 2026-08-17 is a Monday. The process timezone is UTC (vitest.config.ts) and
 * none of the business zones used here are, so a check that leaked into the
 * process clock would fail rather than pass by coincidence.
 */
const MONDAY = "2026-08-17";
const THURSDAY = "2026-08-20";
const FRIDAY = "2026-08-21";
const SATURDAY = "2026-08-22";
const SUNDAY = "2026-08-23";

const ZONES = ["America/Vancouver", "America/New_York", "Europe/London", "Asia/Tokyo"];

/**
 * A fixed clock, well before every date used above, so business-hours cases are
 * never accidentally decided by temporal validity. Tests that care about "now"
 * derive their own instant from `wallClockToInstant` in the business zone.
 */
const BEFORE_EVERYTHING = new Date("2026-08-01T00:00:00Z");

function configIn(timezone: string, overrides: Partial<AppConfiguration> = {}): AppConfiguration {
  return { ...DEFAULT_CONFIGURATION, business: { ...DEFAULT_CONFIGURATION.business, timezone }, ...overrides };
}

function withSpecial(timezone: string, special: SpecialHours): AppConfiguration {
  return configIn(timezone, { specialHours: [special] });
}

function appointmentOf(durationMin: number, over: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt_test",
    customerId: "cust_1",
    customerName: "Test Customer",
    customerPhone: "(604) 555-0000",
    customerEmail: "test@example.com",
    serviceId: "svc_haircut",
    service: { name: "Haircut", priceModel: "fixed", price: 65, durationMin },
    date: MONDAY,
    time: "10:00",
    source: "voice",
    status: "confirmed",
    notes: "",
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
    ...over,
  };
}

const vancouver = configIn("America/Vancouver");

describe("a normal open day", () => {
  it("accepts a booking that sits inside opening hours", () => {
    expect(checkBusinessTime(vancouver, MONDAY, "10:00", 45)).toMatchObject({ valid: true, reason: null });
  });

  it("accepts a booking starting exactly at opening time", () => {
    expect(checkBusinessTime(vancouver, MONDAY, "09:00", 45).valid).toBe(true);
  });

  it("rejects a booking before opening", () => {
    const check = checkBusinessTime(vancouver, MONDAY, "08:00", 45);
    expect(check).toMatchObject({ valid: false, reason: "before_opening" });
    expect(check.message).toBe("The business opens at 9:00 AM on this date.");
  });

  it("rejects a booking at or after closing", () => {
    expect(checkBusinessTime(vancouver, MONDAY, "18:00", 45).reason).toBe("after_closing");
    expect(checkBusinessTime(vancouver, MONDAY, "19:30", 45).reason).toBe("after_closing");
    expect(checkBusinessTime(vancouver, MONDAY, "18:00", 45).message).toBe("The business closes at 6:00 PM on this date.");
  });

  it("rejects a booking that would end after closing", () => {
    // Starts inside hours, but 17:30 + 45 min runs to 18:15.
    const check = checkBusinessTime(vancouver, MONDAY, "17:30", 45);
    expect(check).toMatchObject({ valid: false, reason: "overruns_closing" });
    expect(check.message).toContain("end after 6:00 PM");
    expect(check.message).toContain("45 minutes");
  });

  it("treats the closing boundary as exact, judged by duration", () => {
    // 17:15 + 45 min ends precisely at 18:00 — the last bookable slot.
    expect(checkBusinessTime(vancouver, MONDAY, "17:15", 45).valid).toBe(true);
    expect(checkBusinessTime(vancouver, MONDAY, "17:16", 45).valid).toBe(false);
    // The user's example: closes 7pm, 30-minute appointment.
    expect(checkBusinessTime(vancouver, THURSDAY, "18:30", 30).valid).toBe(true);
    expect(checkBusinessTime(vancouver, THURSDAY, "18:45", 30).valid).toBe(false);
  });

  it("rejects every time on a closed day", () => {
    expect(isOpenOnDay(vancouver, SUNDAY)).toBe(false);
    for (const time of ["09:00", "12:00", "17:00"]) {
      expect(checkBusinessTime(vancouver, SUNDAY, time, 30), time).toMatchObject({ valid: false, reason: "closed_day" });
    }
    expect(checkBusinessTime(vancouver, SUNDAY, "12:00", 30).message).toBe("The business is closed on this date.");
  });

  it("uses the day's own hours, not another day's", () => {
    // Saturday opens at 10:00 and closes at 16:00.
    expect(checkBusinessTime(vancouver, SATURDAY, "09:30", 30).reason).toBe("before_opening");
    expect(checkBusinessTime(vancouver, SATURDAY, "15:30", 30).valid).toBe(true);
    expect(checkBusinessTime(vancouver, SATURDAY, "15:45", 30).reason).toBe("overruns_closing");
  });
});

describe("split shifts", () => {
  const split = withSpecial("America/Vancouver", {
    id: "sh_split",
    date: MONDAY,
    label: "Split shift",
    isClosed: false,
    intervals: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "18:00" }],
  });

  it("accepts a booking inside the morning shift", () => {
    expect(checkBusinessTime(split, MONDAY, "11:00", 30).valid).toBe(true);
  });

  it("rejects a booking in the break between shifts", () => {
    const check = checkBusinessTime(split, MONDAY, "12:30", 30);
    expect(check).toMatchObject({ valid: false, reason: "between_intervals" });
    expect(check.message).toBe("This time falls between the business's opening periods.");
  });

  it("accepts a booking inside the afternoon shift", () => {
    expect(checkBusinessTime(split, MONDAY, "13:00", 30).valid).toBe(true);
    expect(checkBusinessTime(split, MONDAY, "17:30", 30).valid).toBe(true);
  });

  it("will not let a morning booking run through the break", () => {
    // 11:45 + 30 min would end at 12:15, after the morning shift closes.
    expect(checkBusinessTime(split, MONDAY, "11:45", 30)).toMatchObject({ valid: false, reason: "overruns_closing" });
  });

  it("never merges the two shifts into one long interval", () => {
    const times = getValidStartTimes(split, MONDAY, 30);
    expect(times).toContain("11:30");
    expect(times).toContain("13:00");
    // Nothing in the 12:00–13:00 break, and nothing that would run into it.
    expect(times.filter((t) => t >= "11:31" && t < "13:00")).toEqual([]);
  });

  it("reads intervals in order even when the configuration lists them backwards", () => {
    const reversed = withSpecial("America/Vancouver", {
      id: "sh_rev",
      date: MONDAY,
      label: "Split shift",
      isClosed: false,
      intervals: [{ open: "13:00", close: "18:00" }, { open: "09:00", close: "12:00" }],
    });
    expect(checkBusinessTime(reversed, MONDAY, "08:00", 30).reason).toBe("before_opening");
    expect(checkBusinessTime(reversed, MONDAY, "19:00", 30).reason).toBe("after_closing");
    expect(checkBusinessTime(reversed, MONDAY, "12:30", 30).reason).toBe("between_intervals");
  });
});

describe("special hours beat the weekly schedule", () => {
  it("blocks a special closure on a normally-open day", () => {
    const closed = withSpecial("America/Vancouver", {
      id: "sh_closed",
      date: FRIDAY,
      label: "Staff training",
      isClosed: true,
      intervals: [],
    });
    // The weekly schedule would happily accept this.
    expect(checkBusinessTime(vancouver, FRIDAY, "11:00", 30).valid).toBe(true);

    const check = checkBusinessTime(closed, FRIDAY, "11:00", 30);
    expect(check).toMatchObject({ valid: false, reason: "closed_day" });
    expect(check.message).toBe("The business is closed on this date (Staff training).");
    expect(getValidStartTimes(closed, FRIDAY, 30)).toEqual([]);
    expect(getNearbyStartTimes(closed, FRIDAY, "11:00", 30)).toEqual([]);
  });

  it("uses a shortened day's closing time, not the weekly one", () => {
    const shortened = withSpecial("America/Vancouver", {
      id: "sh_short",
      date: FRIDAY,
      label: "Half day",
      isClosed: false,
      intervals: [{ open: "09:00", close: "14:00" }],
    });

    expect(checkBusinessTime(shortened, FRIDAY, "13:00", 30).valid).toBe(true);
    expect(checkBusinessTime(shortened, FRIDAY, "13:30", 30).valid).toBe(true); // ends exactly at 14:00
    expect(checkBusinessTime(shortened, FRIDAY, "13:45", 30).reason).toBe("overruns_closing");
    expect(checkBusinessTime(shortened, FRIDAY, "16:00", 30).reason).toBe("after_closing");
    // The weekly schedule would have allowed 16:00 on a Friday.
    expect(checkBusinessTime(vancouver, FRIDAY, "16:00", 30).valid).toBe(true);
  });

  it("can open a day the weekly schedule has closed", () => {
    const sundayOpen = withSpecial("America/Vancouver", {
      id: "sh_sun",
      date: SUNDAY,
      label: "Market day",
      isClosed: false,
      intervals: [{ open: "11:00", close: "15:00" }],
    });
    expect(isOpenOnDay(sundayOpen, SUNDAY)).toBe(true);
    expect(checkBusinessTime(sundayOpen, SUNDAY, "11:30", 30).valid).toBe(true);
    expect(checkBusinessTime(sundayOpen, SUNDAY, "10:00", 30).reason).toBe("before_opening");
  });
});

describe("rescheduling uses the booked snapshot, not the catalogue", () => {
  it("keeps the originally booked duration after the catalogue lengthens the service", () => {
    // Booked as 30 minutes; the salon has since made Haircut 45 minutes.
    const appointment = appointmentOf(30);
    const lengthened = configIn("America/Vancouver", {
      services: DEFAULT_CONFIGURATION.services.map((s) => (s.id === "svc_haircut" ? { ...s, durationMin: 45 } : s)),
    });

    // 17:30 + the booked 30 min ends exactly at closing, so it stands.
    expect(checkRescheduleSlot(lengthened, appointment, MONDAY, "17:30", BEFORE_EVERYTHING).valid).toBe(true);
    // The catalogue's current 45 min would have overrun — proof the snapshot won.
    expect(checkBusinessTime(lengthened, MONDAY, "17:30", 45).reason).toBe("overruns_closing");
    // And the drift is real, so this is not a case of the catalogue being unchanged.
    expect(getServiceDrift(lengthened, appointment)).toContain("reduration");
  });

  it("keeps the booked duration after the catalogue shortens the service", () => {
    const appointment = appointmentOf(45);
    const shortened = configIn("America/Vancouver", {
      services: DEFAULT_CONFIGURATION.services.map((s) => (s.id === "svc_haircut" ? { ...s, durationMin: 15 } : s)),
    });
    // The booked 45 min still overruns even though 15 would fit.
    expect(checkRescheduleSlot(shortened, appointment, MONDAY, "17:30", BEFORE_EVERYTHING).reason).toBe("overruns_closing");
    expect(checkBusinessTime(shortened, MONDAY, "17:30", 15).valid).toBe(true);
  });

  it("still reschedules an appointment whose service has been deleted", () => {
    const appointment = appointmentOf(30);
    const deleted = configIn("America/Vancouver", {
      services: DEFAULT_CONFIGURATION.services.filter((s) => s.id !== "svc_haircut"),
    });
    expect(getServiceDrift(deleted, appointment)).toEqual(["deleted"]);
    // The snapshot carries everything the check needs.
    expect(checkRescheduleSlot(deleted, appointment, MONDAY, "14:00", BEFORE_EVERYTHING).valid).toBe(true);
    expect(checkRescheduleSlot(deleted, appointment, SUNDAY, "14:00", BEFORE_EVERYTHING).reason).toBe("closed_day");
  });

  it("still reschedules an appointment whose service was merely deactivated", () => {
    // Snapshot matches the catalogue exactly, so deactivation is the only change.
    const appointment = appointmentOf(45);
    const deactivated = configIn("America/Vancouver", {
      services: DEFAULT_CONFIGURATION.services.map((s) => (s.id === "svc_haircut" ? { ...s, active: false } : s)),
    });
    // Inactive is not drift — it is the same service, just no longer offered.
    expect(getServiceDrift(deactivated, appointment)).toEqual([]);
    expect(checkRescheduleSlot(deactivated, appointment, MONDAY, "14:00", BEFORE_EVERYTHING).valid).toBe(true);
  });
});

describe("the viewer's timezone cannot change the verdict", () => {
  it("gives the same answer for the same wall-clock slot in every business zone", () => {
    const cases: [string, string, number][] = [
      [MONDAY, "08:00", 45],
      [MONDAY, "10:00", 45],
      [MONDAY, "17:15", 45],
      [MONDAY, "17:30", 45],
      [MONDAY, "18:00", 45],
      [SUNDAY, "12:00", 45],
      [SATURDAY, "15:45", 30],
    ];

    for (const [day, time, duration] of cases) {
      const verdicts = ZONES.map((zone) => checkBusinessTime(configIn(zone), day, time, duration).reason);
      expect(new Set(verdicts).size, `${day} ${time} disagreed across zones: ${verdicts.join(", ")}`).toBe(1);
    }
  });

  it("resolves the same wall-clock slot to a different instant per zone, while the verdict holds", () => {
    const appointment = appointmentOf(45, { date: MONDAY, time: "10:00" });
    const instants = ZONES.map((zone) => appointmentInstant(configIn(zone), appointment).toISOString());

    // The zones really are distinct — this is not a vacuous comparison.
    expect(new Set(instants).size).toBe(ZONES.length);
    for (const zone of ZONES) {
      const config = configIn(zone);
      expect(checkRescheduleSlot(config, appointment, MONDAY, "10:00", BEFORE_EVERYTHING).valid, zone).toBe(true);
      // And the stored day survives the round trip in that zone.
      expect(zonedDayKey(appointmentInstant(config, appointment), zone), zone).toBe(MONDAY);
    }
  });

  it("applies special hours on the business's calendar date in every zone", () => {
    for (const zone of ZONES) {
      const closed = withSpecial(zone, { id: "sh_x", date: MONDAY, label: "Closed", isClosed: true, intervals: [] });
      expect(checkBusinessTime(closed, MONDAY, "10:00", 30).reason, zone).toBe("closed_day");
      // The neighbouring days are untouched.
      expect(checkBusinessTime(closed, "2026-08-18", "10:00", 30).valid, zone).toBe(true);
    }
  });
});

describe("temporal validity: the requested time must still be ahead", () => {
  /** "Now" as a wall-clock reading on the business's own calendar. */
  const nowIn = (zone: string, dayKey: string, time: string) => wallClockToInstant(dayKey, time, zone);

  it("rejects a previous day", () => {
    const now = nowIn("America/Vancouver", MONDAY, "14:30");
    const check = checkTemporal(vancouver, "2026-08-16", "10:00", now);
    expect(check).toMatchObject({ valid: false, reason: "in_past" });
    expect(check.message).toBe("Appointments cannot be rescheduled to a time that has already passed.");
  });

  it("rejects an earlier time on the current business day", () => {
    const now = nowIn("America/Vancouver", MONDAY, "14:30");
    expect(checkTemporal(vancouver, MONDAY, "10:00", now).reason).toBe("in_past");
    expect(checkTemporal(vancouver, MONDAY, "14:29", now).reason).toBe("in_past");
  });

  it("rejects the exact current instant, since it is gone by the time the write lands", () => {
    const now = nowIn("America/Vancouver", MONDAY, "14:30");
    expect(checkTemporal(vancouver, MONDAY, "14:30", now).reason).toBe("in_past");
    // One minute later is fine — the boundary is strict, not sloppy.
    expect(checkTemporal(vancouver, MONDAY, "14:31", now).valid).toBe(true);
  });

  it("accepts later today and tomorrow", () => {
    const now = nowIn("America/Vancouver", MONDAY, "14:30");
    expect(checkTemporal(vancouver, MONDAY, "15:00", now).valid).toBe(true);
    expect(checkTemporal(vancouver, "2026-08-18", "09:00", now).valid).toBe(true);
  });

  it("judges 'already passed' on the business clock, not the viewer's", () => {
    // 2026-08-17T21:30Z is 14:30 Monday in Vancouver but 06:30 Tuesday in Tokyo.
    const instant = new Date("2026-08-17T21:30:00Z");
    // Monday 16:00 is still to come in Vancouver...
    expect(checkTemporal(configIn("America/Vancouver"), MONDAY, "16:00", instant).valid).toBe(true);
    // ...but in Tokyo that Monday afternoon is long gone.
    expect(checkTemporal(configIn("Asia/Tokyo"), MONDAY, "16:00", instant).reason).toBe("in_past");
    // And Tokyo's own Tuesday morning is still ahead.
    expect(checkTemporal(configIn("Asia/Tokyo"), "2026-08-18", "09:00", instant).valid).toBe(true);
  });

  it("gives the same verdict in every zone for a slot measured on that zone's clock", () => {
    for (const zone of ZONES) {
      const config = configIn(zone);
      const now = nowIn(zone, MONDAY, "14:30");
      expect(checkTemporal(config, MONDAY, "10:00", now).reason, zone).toBe("in_past");
      expect(checkTemporal(config, MONDAY, "14:30", now).reason, zone).toBe("in_past");
      expect(checkTemporal(config, MONDAY, "15:00", now).valid, zone).toBe(true);
    }
  });

  it("holds across whatever daylight-saving transitions the runtime has", () => {
    // Property, not a hard-coded date: an hour before a transition is past and
    // an hour after it is future, however the offset moves.
    for (const zone of ["America/Vancouver", "Europe/London", "Australia/Sydney"]) {
      for (const transition of findTransitions(zone, 2026)) {
        const config = configIn(zone);
        const before = new Date(transition.getTime() - 3600_000);
        const after = new Date(transition.getTime() + 3600_000);
        const dayKey = zonedDayKey(before, zone);
        const beforeTime = `${String(getZonedParts(before, zone).hour).padStart(2, "0")}:${String(getZonedParts(before, zone).minute).padStart(2, "0")}`;

        // Standing at `after`, the reading taken at `before` has passed.
        expect(checkTemporal(config, dayKey, beforeTime, after).reason, `${zone} ${dayKey} ${beforeTime}`).toBe("in_past");
        // Standing at `before`, it has not.
        expect(checkTemporal(config, dayKey, beforeTime, new Date(before.getTime() - 60_000)).valid, zone).toBe(true);
      }
    }
  });
});

describe("rescheduling requires both future and open", () => {
  const now = wallClockToInstant(MONDAY, "14:30", "America/Vancouver");
  const appointment = appointmentOf(45);

  it("rejects yesterday even though its hours were fine", () => {
    expect(checkBusinessTime(vancouver, "2026-08-14", "10:00", 45).valid).toBe(true); // that Friday was open
    expect(checkRescheduleSlot(vancouver, appointment, "2026-08-14", "10:00", now).reason).toBe("in_past");
  });

  it("rejects a future time that falls outside opening hours", () => {
    expect(checkTemporal(vancouver, "2026-08-18", "03:00", now).valid).toBe(true);
    expect(checkRescheduleSlot(vancouver, appointment, "2026-08-18", "03:00", now).reason).toBe("before_opening");
  });

  it("accepts a future time inside opening hours", () => {
    expect(checkRescheduleSlot(vancouver, appointment, MONDAY, "15:00", now).valid).toBe(true);
    expect(checkRescheduleSlot(vancouver, appointment, "2026-08-18", "09:00", now).valid).toBe(true);
  });

  it("still applies closures, split shifts and duration limits to future slots", () => {
    expect(checkRescheduleSlot(vancouver, appointment, SUNDAY, "12:00", now).reason).toBe("closed_day");
    expect(checkRescheduleSlot(vancouver, appointment, MONDAY, "17:30", now).reason).toBe("overruns_closing");

    const split = withSpecial("America/Vancouver", {
      id: "sh_split",
      date: "2026-08-18",
      label: "Split shift",
      isClosed: false,
      intervals: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "18:00" }],
    });
    expect(checkRescheduleSlot(split, appointment, "2026-08-18", "12:30", now).reason).toBe("between_intervals");
  });

  it("reports the past before the hours, because that is the more useful reason", () => {
    // 03:00 yesterday fails both. The message should be about the past.
    expect(checkRescheduleSlot(vancouver, appointment, "2026-08-16", "03:00", now).reason).toBe("in_past");
  });

  it("lets a historical appointment be rescheduled to a future slot", () => {
    // The restriction is on the requested time, not on the record being edited.
    const past = appointmentOf(45, { date: "2026-07-01", time: "10:00", status: "completed" });
    expect(checkRescheduleSlot(vancouver, past, "2026-08-18", "10:00", now).valid).toBe(true);
    expect(checkRescheduleSlot(vancouver, past, "2026-07-02", "10:00", now).reason).toBe("in_past");
    // And its snapshot is untouched by any of this.
    expect(past.service).toEqual({ name: "Haircut", priceModel: "fixed", price: 65, durationMin: 45 });
  });

  it("uses the snapshot duration when deciding a future slot", () => {
    const short = appointmentOf(30);
    const lengthened = configIn("America/Vancouver", {
      services: DEFAULT_CONFIGURATION.services.map((s) => (s.id === "svc_haircut" ? { ...s, durationMin: 45 } : s)),
    });
    expect(checkRescheduleSlot(lengthened, short, MONDAY, "17:30", now).valid).toBe(true);
  });
});

describe("suggesting valid start times", () => {
  it("offers every slot a booking of that length fits into", () => {
    const times = getValidStartTimes(vancouver, MONDAY, 45);
    expect(times[0]).toBe("09:00");
    expect(times[times.length - 1]).toBe("17:15"); // 17:15 + 45 min = 18:00
    expect(times).toHaveLength(34);
  });

  it("offers fewer slots as the booking gets longer, and none if it cannot fit", () => {
    expect(getValidStartTimes(vancouver, SATURDAY, 30).length).toBeGreaterThan(getValidStartTimes(vancouver, SATURDAY, 240).length);
    // Saturday is a six-hour day; a seven-hour appointment cannot fit at all.
    expect(getValidStartTimes(vancouver, SATURDAY, 7 * 60)).toEqual([]);
  });

  it("suggests the nearest valid times to the one that was refused", () => {
    // Thursday closes at 19:00; a 30-minute booking at 18:45 would overrun.
    // Slots sit on a quarter-hour grid, so 18:30 is the last one that fits.
    expect(checkBusinessTime(vancouver, THURSDAY, "18:45", 30).reason).toBe("overruns_closing");
    expect(getNearbyStartTimes(vancouver, THURSDAY, "18:45", 30)).toEqual(["18:00", "18:15", "18:30"]);
    expect(checkBusinessTime(vancouver, THURSDAY, "18:30", 30).valid).toBe(true);
  });

  it("returns suggestions in chronological order, not by distance", () => {
    const nearby = getNearbyStartTimes(vancouver, MONDAY, "12:00", 30);
    expect(nearby).toEqual([...nearby].sort());
    expect(nearby).toHaveLength(3);
  });

  it("never suggests a time that has already passed", () => {
    const now = wallClockToInstant(MONDAY, "14:30", "America/Vancouver");
    const suggestions = getNearbyStartTimes(vancouver, MONDAY, "10:00", 45, { now });

    expect(suggestions.length).toBeGreaterThan(0);
    for (const t of suggestions) {
      expect(checkTemporal(vancouver, MONDAY, t, now).valid, t).toBe(true);
    }
    // The morning slots that were valid business times earlier are gone.
    for (const gone of ["09:00", "13:30", "14:00", "14:15", "14:30"]) {
      expect(suggestions, gone).not.toContain(gone);
    }
  });

  it("drops past slots from the full listing too, without touching the hours", () => {
    const now = wallClockToInstant(MONDAY, "14:30", "America/Vancouver");
    const all = getValidStartTimes(vancouver, MONDAY, 45);
    const remaining = getValidStartTimes(vancouver, MONDAY, 45, { now });

    expect(all).toContain("09:00");
    expect(remaining).not.toContain("09:00");
    expect(remaining[0]).toBe("14:45");
    expect(remaining[remaining.length - 1]).toBe("17:15"); // closing boundary still applies
    expect(remaining.length).toBeLessThan(all.length);
  });

  it("offers nothing once the day is over, rather than yesterday's slots", () => {
    const now = wallClockToInstant(MONDAY, "23:00", "America/Vancouver");
    expect(getValidStartTimes(vancouver, MONDAY, 45, { now })).toEqual([]);
    expect(getNearbyStartTimes(vancouver, MONDAY, "10:00", 45, { now })).toEqual([]);
    // Tomorrow is untouched.
    expect(getValidStartTimes(vancouver, "2026-08-18", 45, { now }).length).toBeGreaterThan(0);
  });

  it("filters on the business clock, so the viewer's zone cannot change the list", () => {
    // 2026-08-17T21:30Z: 14:30 Monday in Vancouver, 06:30 Tuesday in Tokyo.
    const instant = new Date("2026-08-17T21:30:00Z");
    const vanRemaining = getValidStartTimes(configIn("America/Vancouver"), MONDAY, 45, { now: instant });
    const tokyoRemaining = getValidStartTimes(configIn("Asia/Tokyo"), MONDAY, 45, { now: instant });

    expect(vanRemaining[0]).toBe("14:45");
    // That Monday is entirely behind Tokyo.
    expect(tokyoRemaining).toEqual([]);
  });

  it("suggests times from the correct shift on a split day", () => {
    const split = withSpecial("America/Vancouver", {
      id: "sh_split",
      date: MONDAY,
      label: "Split shift",
      isClosed: false,
      intervals: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "18:00" }],
    });
    // Asked for 12:30, in the break: the nearest valid times straddle it.
    const nearby = getNearbyStartTimes(split, MONDAY, "12:30", 30);
    expect(nearby.every((t) => t <= "11:30" || t >= "13:00")).toBe(true);
    expect(nearby).toContain("13:00");
  });
});
