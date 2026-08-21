import { createMockAdapter } from "./core";

/**
 * Calendar scheduling. Sends a bare wall-clock reading plus the calendar's own
 * timezone — legal at the boundary only because the zone travels with it. This
 * is the case that would silently break if normalization were ever bypassed.
 */
export const googleCalendarAdapter = createMockAdapter({
  provider: "google_calendar",
  timeStyle: { kind: "zoned", timeZone: "America/Los_Angeles" },
  requiredConfig: ["account", "calendar", "oauth"],
  capabilitiesWhenConnected: ["read_events", "write_events", "free_busy"],
});
