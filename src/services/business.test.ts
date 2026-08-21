import { describe, expect, it } from "vitest";
import type { AppConfiguration, Appointment, BusinessService } from "@/types";
import { DEFAULT_CONFIGURATION } from "@/data/default-config";
import {
  appointmentInstant,
  formatServicePrice,
  getCatalogueService,
  getEffectiveHours,
  getNextOpenDay,
  getServiceComparison,
  getServiceDrift,
  isOutsideBusinessHours,
  snapshotOfService,
} from "./business";
import { zonedDayKey } from "@/lib/timezone";

/**
 * The process timezone is UTC (vitest.config.ts). Configurations below use other
 * zones on purpose, so anything that reads the process clock instead of the
 * business clock fails here rather than passing by coincidence.
 */

function configIn(timezone: string, overrides: Partial<AppConfiguration> = {}): AppConfiguration {
  return {
    ...DEFAULT_CONFIGURATION,
    business: { ...DEFAULT_CONFIGURATION.business, timezone },
    ...overrides,
  };
}

function makeAppointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt_test",
    customerId: "cust_1",
    customerName: "Test Customer",
    customerPhone: "(604) 555-0000",
    customerEmail: "test@example.com",
    serviceId: "svc_haircut",
    service: { name: "Haircut", priceModel: "fixed", price: 65, durationMin: 45 },
    date: "2026-08-17",
    time: "09:00",
    source: "voice",
    status: "confirmed",
    notes: "",
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
    ...over,
  };
}

describe("service identity", () => {
  it("resolves an appointment to its catalogue entry by id, not by name", () => {
    const config = configIn("America/Vancouver");
    const renamed: BusinessService[] = config.services.map((s) =>
      s.id === "svc_haircut" ? { ...s, name: "Gentlemen's Cut" } : s
    );
    const withRename = { ...config, services: renamed };

    const appointment = makeAppointment();
    // The name no longer matches, but the id still does.
    expect(getCatalogueService(withRename, appointment)?.id).toBe("svc_haircut");
    expect(getCatalogueService(withRename, appointment)?.name).toBe("Gentlemen's Cut");
  });

  it("returns null when the service has been deleted from the catalogue", () => {
    const config = configIn("America/Vancouver");
    const without = { ...config, services: config.services.filter((s) => s.id !== "svc_haircut") };
    expect(getCatalogueService(without, makeAppointment())).toBeNull();
  });

  it("keeps the booked details when the catalogue price changes", () => {
    const config = configIn("America/Vancouver");
    const repriced = { ...config, services: config.services.map((s) => (s.id === "svc_haircut" ? { ...s, price: 95 } : s)) };
    const appointment = makeAppointment();

    // The historical record is untouched...
    expect(appointment.service.price).toBe(65);
    expect(formatServicePrice(appointment.service)).toBe("$65");
    // ...while the catalogue moved on.
    expect(getCatalogueService(repriced, appointment)?.price).toBe(95);
  });

  it("reports how a booking has drifted from the current catalogue", () => {
    const config = configIn("America/Vancouver");
    const appointment = makeAppointment();

    expect(getServiceDrift(config, appointment)).toEqual([]);

    const renamed = { ...config, services: config.services.map((s) => (s.id === "svc_haircut" ? { ...s, name: "Cut" } : s)) };
    expect(getServiceDrift(renamed, appointment)).toContain("renamed");

    const repriced = { ...config, services: config.services.map((s) => (s.id === "svc_haircut" ? { ...s, price: 95 } : s)) };
    expect(getServiceDrift(repriced, appointment)).toContain("repriced");

    const retimed = { ...config, services: config.services.map((s) => (s.id === "svc_haircut" ? { ...s, durationMin: 60 } : s)) };
    expect(getServiceDrift(retimed, appointment)).toContain("reduration");

    const deleted = { ...config, services: config.services.filter((s) => s.id !== "svc_haircut") };
    expect(getServiceDrift(deleted, appointment)).toEqual(["deleted"]);
  });

  it("reports no drift for a booking that never referenced the catalogue", () => {
    const config = configIn("America/Vancouver");
    expect(getServiceDrift(config, makeAppointment({ serviceId: null }))).toEqual([]);
  });

  it("snapshots exactly the fields a booking must preserve", () => {
    const service = DEFAULT_CONFIGURATION.services.find((s) => s.id === "svc_haircut")!;
    expect(snapshotOfService(service)).toEqual({
      name: service.name,
      priceModel: service.priceModel,
      price: service.price,
      durationMin: service.durationMin,
    });
  });

  it("keeps seeded appointment service ids pointing at real catalogue entries", () => {
    const ids = new Set(DEFAULT_CONFIGURATION.services.map((s) => s.id));
    expect(ids.has("svc_haircut")).toBe(true);
    expect(ids.size).toBe(DEFAULT_CONFIGURATION.services.length);
  });
});

describe("the service lifecycle a booking has to survive", () => {
  const config = configIn("America/Vancouver");
  const withHaircut = (patch: Partial<BusinessService>) => ({
    ...config,
    services: config.services.map((s) => (s.id === "svc_haircut" ? { ...s, ...patch } : s)),
  });

  it("shows nothing at all while the catalogue still matches", () => {
    expect(getServiceComparison(config, makeAppointment())).toBeNull();
  });

  it("keeps the booked name after a rename, and reports only the rename", () => {
    const renamed = withHaircut({ name: "Classic Haircut" });
    const appointment = makeAppointment();
    const comparison = getServiceComparison(renamed, appointment)!;

    expect(appointment.service.name).toBe("Haircut"); // history untouched
    expect(comparison.reasons).toEqual(["renamed"]);
    expect(comparison.booked.name).toBe("Haircut");
    expect(comparison.current?.name).toBe("Classic Haircut");
    // Price and duration did not change, so neither side restates them.
    expect(comparison.booked.details).toBe("");
    expect(comparison.current?.details).toBe("");
  });

  it("keeps the booked price after a reprice, and shows both figures", () => {
    const comparison = getServiceComparison(withHaircut({ price: 95 }), makeAppointment())!;
    expect(comparison.reasons).toEqual(["repriced"]);
    expect(comparison.booked.details).toBe("$65");
    expect(comparison.current?.details).toBe("$95");
  });

  it("keeps the booked duration after a duration change", () => {
    const comparison = getServiceComparison(withHaircut({ durationMin: 60 }), makeAppointment())!;
    expect(comparison.reasons).toEqual(["reduration"]);
    expect(comparison.booked.details).toBe("45 min");
    expect(comparison.current?.details).toBe("1 hr");
  });

  it("reports several changes at once without repeating unchanged fields", () => {
    const comparison = getServiceComparison(withHaircut({ name: "Classic Cut", price: 95, durationMin: 60 }), makeAppointment())!;
    expect(comparison.reasons).toEqual(["renamed", "repriced", "reduration"]);
    expect(comparison.booked.name).toBe("Haircut");
    expect(comparison.booked.details).toBe("$65 · 45 min");
    expect(comparison.current?.details).toBe("$95 · 1 hr");
  });

  it("notices a change of price model, not just of the number", () => {
    const comparison = getServiceComparison(withHaircut({ priceModel: "from" }), makeAppointment())!;
    expect(comparison.reasons).toEqual(["repriced"]);
    expect(comparison.booked.details).toBe("$65");
    expect(comparison.current?.details).toBe("From $65");
  });

  it("survives deletion with the booking intact and nothing to compare against", () => {
    const deleted = { ...config, services: config.services.filter((s) => s.id !== "svc_haircut") };
    const appointment = makeAppointment();
    const comparison = getServiceComparison(deleted, appointment)!;

    expect(comparison.deleted).toBe(true);
    expect(comparison.current).toBeNull();
    // The unresolved reference does not corrupt the record: everything the
    // customer was told is still there.
    expect(getCatalogueService(deleted, appointment)).toBeNull();
    expect(appointment.service).toEqual({ name: "Haircut", priceModel: "fixed", price: 65, durationMin: 45 });
    expect(comparison.booked.details).toBe("$65 · 45 min");
  });

  it("treats deactivating a service as unchanged — it is still the same service", () => {
    expect(getServiceComparison(withHaircut({ active: false }), makeAppointment())).toBeNull();
  });

  it("never mutates the appointment while reporting drift", () => {
    const appointment = makeAppointment();
    const before = JSON.stringify(appointment);
    getServiceComparison(withHaircut({ name: "Classic Cut", price: 95, durationMin: 60 }), appointment);
    getServiceDrift(withHaircut({ price: 95 }), appointment);
    expect(JSON.stringify(appointment)).toBe(before);
  });

  it("does not share structure between a snapshot and the catalogue entry it came from", () => {
    const service = { ...config.services.find((s) => s.id === "svc_haircut")! };
    const snapshot = snapshotOfService(service);
    service.name = "Edited later";
    service.price = 999;
    expect(snapshot.name).toBe("Haircut");
    expect(snapshot.price).toBe(65);
  });
});

describe("appointmentInstant", () => {
  it("resolves stored wall-clock values against the business timezone", () => {
    const appointment = makeAppointment({ date: "2026-08-17", time: "09:00" });

    expect(appointmentInstant(configIn("America/Vancouver"), appointment).toISOString()).toBe("2026-08-17T16:00:00.000Z");
    expect(appointmentInstant(configIn("Asia/Tokyo"), appointment).toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(appointmentInstant(configIn("UTC"), appointment).toISOString()).toBe("2026-08-17T09:00:00.000Z");
  });

  it("keeps an early-morning appointment on its own day in every zone", () => {
    const appointment = makeAppointment({ date: "2026-08-17", time: "00:30" });
    for (const zone of ["America/Vancouver", "Asia/Tokyo", "Europe/London", "Pacific/Kiritimati"]) {
      const config = configIn(zone);
      expect(zonedDayKey(appointmentInstant(config, appointment), zone), zone).toBe("2026-08-17");
    }
  });
});

describe("business hours in the business timezone", () => {
  // Default seeded hours: Mon-Wed & Fri 09:00-18:00, Thu 09:00-19:00,
  // Sat 10:00-16:00, Sun closed.
  const vancouver = configIn("America/Vancouver");
  const tokyo = configIn("Asia/Tokyo");

  it("judges open/closed on the business clock, not the viewer's", () => {
    // 2026-08-17T20:00Z: 13:00 Monday in Vancouver (open), 05:00 Tuesday in Tokyo (closed).
    const instant = new Date("2026-08-17T20:00:00Z");
    expect(isOutsideBusinessHours(vancouver, instant)).toBe(false);
    expect(isOutsideBusinessHours(tokyo, instant)).toBe(true);
  });

  it("treats the instant just before opening as outside hours", () => {
    // 08:59 Monday in Vancouver.
    expect(isOutsideBusinessHours(vancouver, new Date("2026-08-17T15:59:00Z"))).toBe(true);
    // 09:00 Monday in Vancouver.
    expect(isOutsideBusinessHours(vancouver, new Date("2026-08-17T16:00:00Z"))).toBe(false);
  });

  it("treats closing time as exclusive", () => {
    // 18:00 Monday in Vancouver — the shop has shut.
    expect(isOutsideBusinessHours(vancouver, new Date("2026-08-18T01:00:00Z"))).toBe(true);
    // 17:59 Monday.
    expect(isOutsideBusinessHours(vancouver, new Date("2026-08-18T00:59:00Z"))).toBe(false);
  });

  it("picks the weekly schedule row for the business's own weekday", () => {
    // 2026-08-17T06:00Z is Sunday 23:00 in Vancouver but Monday in UTC.
    const instant = new Date("2026-08-17T06:00:00Z");
    expect(getEffectiveHours(vancouver, instant).isOpen).toBe(false); // Sunday: closed
    expect(getEffectiveHours(configIn("UTC"), instant).isOpen).toBe(true); // Monday 06:00 row exists
  });

  it("lets a special-hours entry override the weekly schedule for its date", () => {
    const config = configIn("America/Vancouver", {
      specialHours: [{ id: "sh_x", date: "2026-08-17", label: "Stocktake", isClosed: true, intervals: [] }],
    });
    const monday = new Date("2026-08-17T20:00:00Z"); // 13:00 Monday, normally open
    const effective = getEffectiveHours(config, monday);
    expect(effective.isOpen).toBe(false);
    expect(effective.exception?.label).toBe("Stocktake");
    expect(isOutsideBusinessHours(config, monday)).toBe(true);
  });

  it("matches special hours against the business day, not the UTC day", () => {
    // 2026-08-18T05:00Z is still Monday 22:00 in Vancouver.
    const config = configIn("America/Vancouver", {
      specialHours: [{ id: "sh_x", date: "2026-08-17", label: "Late night", isClosed: false, intervals: [{ open: "20:00", close: "23:00" }] }],
    });
    expect(getEffectiveHours(config, new Date("2026-08-18T05:00:00Z")).exception?.label).toBe("Late night");
  });

  it("finds the next open day skipping closures", () => {
    // Saturday 2026-08-22 in Vancouver; Sunday is closed, so next open is Monday.
    const saturdayEvening = new Date("2026-08-23T04:00:00Z"); // 21:00 Sat in Vancouver
    const next = getNextOpenDay(vancouver, saturdayEvening);
    expect(next).not.toBeNull();
    expect(zonedDayKey(next!.date, "America/Vancouver")).toBe("2026-08-24"); // Monday
  });

  it("still offers today while there is opening time left in it", () => {
    // 08:00 Monday in Vancouver, before the 09:00 opening.
    const earlyMonday = new Date("2026-08-17T15:00:00Z");
    expect(zonedDayKey(getNextOpenDay(vancouver, earlyMonday)!.date, "America/Vancouver")).toBe("2026-08-17");
  });

  it("moves to the following day once today's last closing time has passed", () => {
    // 19:00 Monday in Vancouver, after the 18:00 close.
    const lateMonday = new Date("2026-08-18T02:00:00Z");
    expect(zonedDayKey(getNextOpenDay(vancouver, lateMonday)!.date, "America/Vancouver")).toBe("2026-08-18");
  });

  it("skips a special closure when finding the next open day", () => {
    const config = configIn("America/Vancouver", {
      specialHours: [{ id: "sh_mon", date: "2026-08-24", label: "Holiday", isClosed: true, intervals: [] }],
    });
    const saturdayEvening = new Date("2026-08-23T04:00:00Z");
    expect(zonedDayKey(getNextOpenDay(config, saturdayEvening)!.date, "America/Vancouver")).toBe("2026-08-25");
  });
});
