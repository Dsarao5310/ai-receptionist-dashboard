import { describe, expect, it } from "vitest";
import { businessWallClock, instantForProvider, instantFromProvider } from "./provider-time";

/**
 * The process timezone is UTC, and none of the zones below are, so a
 * normalization that quietly fell back to the runtime's clock would fail here.
 */

const VANCOUVER = "America/Vancouver";
const TOKYO = "Asia/Tokyo";

describe("instantFromProvider", () => {
  it("honours the offset the provider sent", () => {
    // The same wall-clock reading, three offsets, three different moments.
    expect(instantFromProvider({ value: "2026-08-17T09:00:00-07:00" }).toISOString()).toBe("2026-08-17T16:00:00.000Z");
    expect(instantFromProvider({ value: "2026-08-17T09:00:00Z" }).toISOString()).toBe("2026-08-17T09:00:00.000Z");
    expect(instantFromProvider({ value: "2026-08-17T09:00:00+09:00" }).toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("prefers an explicit offset over a stated provider zone", () => {
    // An offset is the more specific statement; a mismatched zone hint must not
    // be allowed to move the instant.
    const instant = instantFromProvider({ value: "2026-08-17T09:00:00-07:00", timeZone: TOKYO });
    expect(instant.toISOString()).toBe("2026-08-17T16:00:00.000Z");
  });

  it("resolves an offsetless timestamp against the zone the provider states", () => {
    expect(instantFromProvider({ value: "2026-08-17T09:00:00", timeZone: VANCOUVER }).toISOString()).toBe("2026-08-17T16:00:00.000Z");
    expect(instantFromProvider({ value: "2026-08-17T09:00", timeZone: TOKYO }).toISOString()).toBe("2026-08-17T00:00:00.000Z");
    // Space-separated is common in provider payloads.
    expect(instantFromProvider({ value: "2026-08-17 09:00:00", timeZone: VANCOUVER }).toISOString()).toBe("2026-08-17T16:00:00.000Z");
  });

  it("uses the offset actually in force on the date, not a fixed one", () => {
    // Standard time in Vancouver is UTC-8; summer time is UTC-7.
    const winter = instantFromProvider({ value: "2026-01-17T09:00:00", timeZone: VANCOUVER });
    const summer = instantFromProvider({ value: "2026-07-17T09:00:00", timeZone: VANCOUVER });
    expect(winter.toISOString()).toBe("2026-01-17T17:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-17T16:00:00.000Z");
  });

  it("refuses to guess when a timestamp has neither an offset nor a zone", () => {
    // This is the whole point of the boundary: silently assuming the server's
    // zone is how provider-local time leaks into business logic.
    expect(() => instantFromProvider({ value: "2026-08-17T09:00:00" })).toThrow(/no UTC offset/);
  });

  it("rejects unparseable input and unrecognised zones rather than producing an Invalid Date", () => {
    expect(() => instantFromProvider({ value: "sometime tuesday" })).toThrow(/unparseable/);
    expect(() => instantFromProvider({ value: "2026-13-45T99:00:00Z" })).toThrow(/unparseable/);
    expect(() => instantFromProvider({ value: "2026-08-17T09:00:00", timeZone: "Mars/Olympus" })).toThrow(/unrecognised timezone/);
  });
});

describe("businessWallClock", () => {
  it("projects an instant onto the business's calendar, not UTC's", () => {
    // 2026-08-18T04:30Z is still the 17th in Vancouver, already the 18th in Tokyo.
    const instant = new Date("2026-08-18T04:30:00Z");
    expect(businessWallClock(instant, VANCOUVER)).toEqual({ date: "2026-08-17", time: "21:30" });
    expect(businessWallClock(instant, TOKYO)).toEqual({ date: "2026-08-18", time: "13:30" });
    // Slicing the ISO string would have stored "2026-08-18" / "04:30" for both.
  });

  it("pads to the stored HH:mm shape", () => {
    expect(businessWallClock(new Date("2026-08-17T16:05:00Z"), VANCOUVER)).toEqual({ date: "2026-08-17", time: "09:05" });
  });

  it("renders midnight as 00:00, never 24:00", () => {
    expect(businessWallClock(new Date("2026-08-17T07:00:00Z"), VANCOUVER).time).toBe("00:00");
  });
});

describe("round trip", () => {
  it("returns a provider timestamp to the same instant it arrived as", () => {
    for (const zone of [VANCOUVER, TOKYO, "Europe/London", "America/New_York"]) {
      for (const iso of ["2026-01-17T09:00:00Z", "2026-07-17T23:45:00Z", "2026-11-01T08:30:00Z"]) {
        const arrived = instantFromProvider({ value: iso });
        const { date, time } = businessWallClock(arrived, zone);
        const leaving = instantForProvider(date, time, zone);
        // Seconds are not part of a booking's stored shape, so compare to the minute.
        expect(Math.abs(leaving.getTime() - arrived.getTime()), `${zone} ${iso}`).toBeLessThan(60000);
      }
    }
  });
});
