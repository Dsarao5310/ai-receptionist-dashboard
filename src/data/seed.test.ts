import { describe, expect, it } from "vitest";
import { buildDataset } from "./seed";
import { DEFAULT_CONFIGURATION } from "./default-config";
import { zonedDayKey, zonedMinutesOfDay } from "@/lib/timezone";
import { appointmentInstant } from "@/services/business";
import type { AppConfiguration } from "@/types";

/**
 * The generator now produces wall-clock appointment days/times in the business
 * timezone and links every appointment to a catalogue service by id. These tests
 * run with the process timezone set to UTC, so a generator that silently used
 * the process clock would produce days that disagree with the business zone.
 */

const NOW = new Date("2026-08-17T19:00:00Z");

function configFor(timezone: string): AppConfiguration {
  return { ...DEFAULT_CONFIGURATION, business: { ...DEFAULT_CONFIGURATION.business, timezone } };
}

describe("generated appointments reference the service catalogue", () => {
  const dataset = buildDataset(NOW, 42, "America/Vancouver");

  it("gives every appointment a serviceId that exists in the default catalogue", () => {
    const catalogueIds = new Set(DEFAULT_CONFIGURATION.services.map((s) => s.id));
    const orphans = dataset.appointments.filter((a) => a.serviceId === null || !catalogueIds.has(a.serviceId));
    expect(orphans).toHaveLength(0);
  });

  it("stores a booking snapshot that matches the catalogue at generation time", () => {
    for (const appointment of dataset.appointments.slice(0, 40)) {
      const service = DEFAULT_CONFIGURATION.services.find((s) => s.id === appointment.serviceId)!;
      expect(appointment.service.name).toBe(service.name);
      expect(appointment.service.durationMin).toBe(service.durationMin);
      expect(appointment.service.price).toBe(service.price);
    }
  });

  it("carries a usable duration on every snapshot", () => {
    expect(dataset.appointments.every((a) => a.service.durationMin > 0)).toBe(true);
  });
});

describe("generated appointment times are wall-clock in the business zone", () => {
  it("keeps stored date and time consistent with the resolved instant", () => {
    for (const zone of ["America/Vancouver", "Asia/Tokyo", "Europe/London"]) {
      const dataset = buildDataset(NOW, 42, zone);
      const config = configFor(zone);
      for (const appointment of dataset.appointments.slice(0, 30)) {
        const instant = appointmentInstant(config, appointment);
        expect(zonedDayKey(instant, zone), `${zone} ${appointment.id}`).toBe(appointment.date);
        const [h, m] = appointment.time.split(":").map(Number);
        expect(zonedMinutesOfDay(instant, zone), `${zone} ${appointment.id}`).toBe(h * 60 + m);
      }
    }
  });

  it("schedules appointments within trading hours on the business clock", () => {
    const dataset = buildDataset(NOW, 42, "Asia/Tokyo");
    for (const appointment of dataset.appointments) {
      const [hour] = appointment.time.split(":").map(Number);
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(18);
    }
  });

  it("produces different stored days for the same instant in zones a day apart", () => {
    // Tokyo is ~17h ahead of Vancouver, so the generated calendar differs.
    const vancouver = buildDataset(NOW, 42, "America/Vancouver");
    const tokyo = buildDataset(NOW, 42, "Asia/Tokyo");
    const differing = vancouver.appointments.filter((a, i) => tokyo.appointments[i]?.date !== a.date);
    expect(differing.length).toBeGreaterThan(0);
  });
});

describe("generated dataset internal consistency", () => {
  const dataset = buildDataset(NOW, 42, "America/Vancouver");
  const config = configFor("America/Vancouver");

  it("never marks a future appointment as completed", () => {
    const wrong = dataset.appointments.filter((a) => a.status === "completed" && appointmentInstant(config, a) > NOW);
    expect(wrong).toHaveLength(0);
  });

  it("orders appointments by their resolved instant", () => {
    const times = dataset.appointments.map((a) => appointmentInstant(config, a).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("points every conversation's appointmentId at a real appointment", () => {
    const ids = new Set(dataset.appointments.map((a) => a.id));
    const dangling = dataset.conversations.filter((c) => c.appointmentId && !ids.has(c.appointmentId));
    expect(dangling).toHaveLength(0);
  });

  it("is deterministic for a given seed and zone", () => {
    const a = buildDataset(NOW, 42, "America/Vancouver");
    const b = buildDataset(NOW, 42, "America/Vancouver");
    expect(a.appointments.map((x) => `${x.id}:${x.date}:${x.time}:${x.serviceId}`)).toEqual(
      b.appointments.map((x) => `${x.id}:${x.date}:${x.time}:${x.serviceId}`)
    );
  });
});
