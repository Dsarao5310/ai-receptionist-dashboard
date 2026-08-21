import { describe, expect, it } from "vitest";
import type { AppConfiguration, Conversation, Dataset } from "@/types";
import { DEFAULT_CONFIGURATION } from "@/data/default-config";
import { getRangeBounds, inBounds } from "@/lib/date-range";
import { buildBuckets } from "@/lib/buckets";
import { addZonedDays, zonedDayKey } from "@/lib/timezone";
import { businessTodayAsCalendarDate } from "@/features/appointments/calendar/business-today";
import { isoDay } from "@/data/generator";
import { getEffectiveHours, getNextOpenDay, isOutsideBusinessHours } from "./business";
import { getReceptionistActivity } from "./ai-receptionist";
import { simulateReply } from "./receptionist-simulator";

/**
 * The same instant, seen by four businesses in four zones.
 *
 * The process timezone is pinned to UTC (vitest.config.ts) and none of these
 * four is UTC, so anything reading the process clock instead of the configured
 * business clock fails here rather than passing by coincidence.
 *
 * 2026-08-17T20:00Z is:
 *   Vancouver  13:00 Mon 17th   — inside 09:00-18:00
 *   New York   16:00 Mon 17th   — inside 09:00-18:00
 *   London     21:00 Mon 17th   — after closing, same day
 *   Tokyo      05:00 Tue 18th   — before opening, and already the next day
 */
const NOW = new Date("2026-08-17T20:00:00Z");

const VANCOUVER = "America/Vancouver";
const NEW_YORK = "America/New_York";
const LONDON = "Europe/London";
const TOKYO = "Asia/Tokyo";
const ZONES = [VANCOUVER, NEW_YORK, LONDON, TOKYO];

/** What each zone calls the day containing NOW. */
const TODAY: Record<string, string> = {
  [VANCOUVER]: "2026-08-17",
  [NEW_YORK]: "2026-08-17",
  [LONDON]: "2026-08-17",
  [TOKYO]: "2026-08-18",
};

function configIn(timezone: string, overrides: Partial<AppConfiguration> = {}): AppConfiguration {
  return {
    ...DEFAULT_CONFIGURATION,
    business: { ...DEFAULT_CONFIGURATION.business, timezone },
    ...overrides,
  };
}

function conversationAt(id: string, iso: string): Conversation {
  return {
    id,
    customerId: "cust_1",
    customerName: "Test Customer",
    channel: "voice",
    timestamp: iso,
    intent: "booking",
    outcome: "booked",
    summary: "",
    transcriptPreview: "",
    transcript: [],
    actions: [],
  };
}

function datasetWith(conversations: Conversation[]): Dataset {
  return { generatedAt: NOW.toISOString(), customers: [], conversations, calls: [], appointments: [], activityEvents: [] };
}

describe("the business day, in four zones", () => {
  it("assigns the same instant to the day its own calendar is on", () => {
    for (const zone of ZONES) {
      expect(zonedDayKey(NOW, zone), zone).toBe(TODAY[zone]);
    }
    // Not a vacuous check: the zones genuinely disagree about the date.
    expect(new Set(ZONES.map((z) => TODAY[z])).size).toBe(2);
  });

  it("puts yesterday and tomorrow either side of that day", () => {
    for (const zone of ZONES) {
      const yesterday = zonedDayKey(addZonedDays(NOW, zone, -1), zone);
      const tomorrow = zonedDayKey(addZonedDays(NOW, zone, 1), zone);
      expect([yesterday, TODAY[zone], tomorrow].sort(), zone).toEqual([yesterday, TODAY[zone], tomorrow]);
      expect(yesterday < TODAY[zone], zone).toBe(true);
      expect(tomorrow > TODAY[zone], zone).toBe(true);
    }
    // Tokyo's "yesterday" is the day Vancouver is still living in.
    expect(zonedDayKey(addZonedDays(NOW, TOKYO, -1), TOKYO)).toBe(TODAY[VANCOUVER]);
  });

  it("brackets Today around that zone's day and still contains now", () => {
    for (const zone of ZONES) {
      const bounds = getRangeBounds("today", NOW, zone);
      expect(zonedDayKey(bounds.start, zone), zone).toBe(TODAY[zone]);
      expect(zonedDayKey(bounds.end, zone), zone).toBe(TODAY[zone]);
      expect(inBounds(NOW, bounds), zone).toBe(true);
    }
  });

  it("ends the daily chart buckets on that zone's today", () => {
    for (const zone of ZONES) {
      const buckets = buildBuckets(getRangeBounds("7d", NOW, zone), zone);
      expect(buckets, zone).toHaveLength(7);
      expect(buckets[buckets.length - 1].dateKey, zone).toBe(TODAY[zone]);
      // Buckets tile the range with no gap and no overlap.
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i].start.getTime(), zone).toBe(buckets[i - 1].end.getTime() + 1);
      }
    }
  });

  it("highlights that zone's today in the calendar grid", () => {
    for (const zone of ZONES) {
      expect(isoDay(businessTodayAsCalendarDate(NOW, zone)), zone).toBe(TODAY[zone]);
    }
  });
});

describe("business hours, in four zones", () => {
  // Seeded weekly hours: Mon-Wed & Fri 09:00-18:00, Thu 09:00-19:00,
  // Sat 10:00-16:00, Sun closed.
  it("decides open/closed on the business's own clock", () => {
    const openNow: Record<string, boolean> = {
      [VANCOUVER]: true, // 13:00 Mon
      [NEW_YORK]: true, // 16:00 Mon
      [LONDON]: false, // 21:00 Mon, shut at 18:00
      [TOKYO]: false, // 05:00 Tue, opens at 09:00
    };
    for (const zone of ZONES) {
      expect(isOutsideBusinessHours(configIn(zone), NOW), zone).toBe(!openNow[zone]);
    }
  });

  it("counts an interaction as after-hours per the business, not the viewer", () => {
    const dataset = datasetWith([conversationAt("conv_1", NOW.toISOString())]);
    for (const zone of ZONES) {
      const activity = getReceptionistActivity(configIn(zone), dataset, NOW);
      const expected = zone === LONDON || zone === TOKYO ? 1 : 0;
      expect(activity.afterHoursToday, zone).toBe(expected);
    }
  });

  it("counts conversations today from the business's midnight", () => {
    // 2026-08-17T14:00Z: 07:00 Mon in Vancouver (today) but 23:00 Mon in Tokyo,
    // where "today" has already rolled over to the 18th.
    const dataset = datasetWith([conversationAt("conv_1", "2026-08-17T14:00:00.000Z")]);
    expect(getReceptionistActivity(configIn(VANCOUVER), dataset, NOW).conversationsToday).toBe(1);
    expect(getReceptionistActivity(configIn(NEW_YORK), dataset, NOW).conversationsToday).toBe(1);
    expect(getReceptionistActivity(configIn(TOKYO), dataset, NOW).conversationsToday).toBe(0);
  });

  it("finds a next open day in every zone, always at or after now", () => {
    for (const zone of ZONES) {
      const next = getNextOpenDay(configIn(zone), NOW);
      expect(next, zone).not.toBeNull();
      expect(zonedDayKey(next!.date, zone) >= TODAY[zone], zone).toBe(true);
      expect(next!.hours.intervals.length, zone).toBeGreaterThan(0);
    }
  });

  it("offers today again when the business is shut now but opens later the same day", () => {
    // Tokyo is at 05:00 on a Tuesday it opens at 09:00.
    const next = getNextOpenDay(configIn(TOKYO), NOW)!;
    expect(zonedDayKey(next.date, TOKYO)).toBe(TODAY[TOKYO]);
    // London has already closed for the day, so it must move on.
    const londonNext = getNextOpenDay(configIn(LONDON), NOW)!;
    expect(zonedDayKey(londonNext.date, LONDON)).not.toBe(TODAY[LONDON]);
  });
});

describe("special hours take priority over the weekly schedule", () => {
  it("closes a normally-open day", () => {
    for (const zone of ZONES) {
      const config = configIn(zone, {
        specialHours: [{ id: "sh_1", date: TODAY[zone], label: "Stocktake", isClosed: true, intervals: [] }],
      });
      const effective = getEffectiveHours(config, NOW);
      expect(effective.isOpen, zone).toBe(false);
      expect(effective.exception?.label, zone).toBe("Stocktake");
      expect(isOutsideBusinessHours(config, NOW), zone).toBe(true);
      // And the next open day skips it.
      expect(zonedDayKey(getNextOpenDay(config, NOW)!.date, zone), zone).not.toBe(TODAY[zone]);
    }
  });

  it("shortens a day, and the shortened closing time is the one that counts", () => {
    // Vancouver is at 13:00. Normal Monday runs to 18:00; a special day ending
    // at 14:00 must still be open, and one ending at 12:00 must not.
    const stillOpen = configIn(VANCOUVER, {
      specialHours: [{ id: "sh_2", date: TODAY[VANCOUVER], label: "Half day", isClosed: false, intervals: [{ open: "09:00", close: "14:00" }] }],
    });
    const alreadyShut = configIn(VANCOUVER, {
      specialHours: [{ id: "sh_3", date: TODAY[VANCOUVER], label: "Half day", isClosed: false, intervals: [{ open: "09:00", close: "12:00" }] }],
    });

    expect(isOutsideBusinessHours(stillOpen, NOW)).toBe(false);
    expect(isOutsideBusinessHours(alreadyShut, NOW)).toBe(true);
    // The weekly schedule would have said open until 18:00 in both cases.
    expect(isOutsideBusinessHours(configIn(VANCOUVER), NOW)).toBe(false);
  });

  it("reaches the simulator, the after-hours metric and the next-open answer alike", () => {
    const config = configIn(VANCOUVER, {
      specialHours: [{ id: "sh_4", date: TODAY[VANCOUVER], label: "Staff training", isClosed: true, intervals: [] }],
    });
    const dataset = datasetWith([conversationAt("conv_1", NOW.toISOString())]);

    const reply = simulateReply(config, "are you open today?", NOW);
    expect(reply.source).toBe("Special hours");
    expect(reply.text).toContain("closed today");

    // The same closure is what makes a 13:00 conversation count as after-hours.
    expect(getReceptionistActivity(config, dataset, NOW).afterHoursToday).toBe(1);
  });
});

describe("simulator wording for the next opening", () => {
  it("says 'later today' when the business opens again on the same day", () => {
    // Tokyo: 05:00 Tuesday, opening at 09:00.
    const config = configIn(TOKYO, { ai: { ...DEFAULT_CONFIGURATION.ai, afterHours: "answer_no_booking" } });
    const reply = simulateReply(config, "I'd like to book an appointment", NOW);

    expect(reply.text).toContain("later today at 9:00 AM");
    expect(reply.text).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
  });

  it("names the weekday when the next opening is on another day", () => {
    // London: 21:00 Monday, already shut, so the next opening is Tuesday.
    const config = configIn(LONDON, { ai: { ...DEFAULT_CONFIGURATION.ai, afterHours: "answer_no_booking" } });
    const reply = simulateReply(config, "I'd like to book an appointment", NOW);

    expect(reply.text).toContain("Tuesday at 9:00 AM");
    expect(reply.text).not.toContain("later today");
  });

  it("tells a caller phoning before opening that the shop opens later today", () => {
    const reply = simulateReply(configIn(TOKYO), "are you open right now?", NOW);
    expect(reply.text).toContain("closed at the moment");
    expect(reply.text).toContain("later today at 9:00 AM");
    // Without restating the same opening time twice over.
    expect(reply.text.match(/9:00 AM/g)).toHaveLength(1);
  });

  it("puts the day's hours in the past once the last shift has ended", () => {
    // London: 21:00 Monday, after the 18:00 close.
    const reply = simulateReply(configIn(LONDON), "are you open right now?", NOW);
    expect(reply.text).toContain("closed for the day");
    expect(reply.text).toContain("today's hours were 9:00 AM – 6:00 PM");
    expect(reply.text).toContain("next open Tuesday at 9:00 AM");
    expect(reply.text).not.toContain("later today");
  });

  it("quotes the next shift, not the first, on a split day", () => {
    // 13:00 Monday in Vancouver, between a morning and an afternoon shift.
    const config = configIn(VANCOUVER, {
      specialHours: [
        {
          id: "sh_split",
          date: TODAY[VANCOUVER],
          label: "Split shift",
          isClosed: false,
          intervals: [{ open: "09:00", close: "12:00" }, { open: "15:00", close: "18:00" }],
        },
      ],
      ai: { ...DEFAULT_CONFIGURATION.ai, afterHours: "answer_no_booking" },
    });
    const reply = simulateReply(config, "can I book an appointment", NOW);
    expect(reply.text).toContain("later today at 3:00 PM");
  });

  it("still opens later today even when the whole week is otherwise closed", () => {
    const config = configIn(TOKYO, {
      hours: DEFAULT_CONFIGURATION.hours.map((h) => (h.day === "Tue" ? h : { ...h, isOpen: false, intervals: [] })),
      ai: { ...DEFAULT_CONFIGURATION.ai, afterHours: "answer_no_booking" },
    });
    expect(simulateReply(config, "book an appointment", NOW).text).toContain("later today");
  });
});
