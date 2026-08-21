"use client";

import { useMemo } from "react";
import { useConfiguration } from "@/lib/store/configuration";
import { formatDayKey, formatInZone, getZonedParts, zonedDayKey } from "@/lib/timezone";

/**
 * Display formatting on the business's clock.
 *
 * Two different kinds of value get formatted in this app and they must not be
 * confused:
 *
 *   • an **instant** (`createdAt`, a conversation `timestamp`) — one moment in
 *     time, which reads differently in every zone. Shown in the business zone so
 *     a call logged at 4pm in the shop reads as 4pm to everyone looking at the
 *     dashboard, wherever they are.
 *   • a **day key** (`appointment.date`, `"2026-08-17"`) — already a wall-clock
 *     value with no zone of its own. Formatted without being re-interpreted, so
 *     it can never slide to the previous day.
 */
export interface BusinessFormat {
  timeZone: string;
  /** An instant, as date + time on the business clock. */
  dateTime: (value: string | Date) => string;
  /** An instant, time only. */
  time: (value: string | Date) => string;
  /** An instant, date only. */
  date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  /** A stored wall-clock day (YYYY-MM-DD). */
  day: (dayKey: string, options?: Intl.DateTimeFormatOptions) => string;
  /** "just now" / "3 hr ago", falling back to a business-clock date once old. */
  relative: (value: string | Date) => string;
  /** True when the instant falls on today's date in the business zone. */
  isToday: (value: string | Date) => boolean;
}

const DATE_ONLY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const TIME_ONLY: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function createBusinessFormat(timeZone: string): BusinessFormat {
  const zone = timeZone || "UTC";

  const date: BusinessFormat["date"] = (value, options = DATE_ONLY) => formatInZone(toDate(value), zone, options);
  const time: BusinessFormat["time"] = (value) => formatInZone(toDate(value), zone, TIME_ONLY);

  return {
    timeZone: zone,
    date,
    time,
    dateTime: (value) => `${date(value)}, ${time(value)}`,
    day: (dayKey, options = DATE_ONLY) => formatDayKey(dayKey, zone, options),
    isToday: (value) => zonedDayKey(toDate(value), zone) === zonedDayKey(new Date(), zone),
    relative: (value) => {
      const instant = toDate(value);
      const diffSec = Math.round((Date.now() - instant.getTime()) / 1000);
      const diffMin = Math.round(diffSec / 60);
      const diffHr = Math.round(diffMin / 60);
      const diffDay = Math.round(diffHr / 24);
      // Elapsed time is zone-independent; only the fallback date needs the zone.
      if (diffSec < 60) return "just now";
      if (diffMin < 60) return `${diffMin} min ago`;
      if (diffHr < 24) return `${diffHr} hr ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return date(instant);
    },
  };
}

/** Formatters bound to the configured business timezone. */
export function useBusinessFormat(): BusinessFormat {
  const timeZone = useConfiguration((s) => s.business.timezone);
  return useMemo(() => createBusinessFormat(timeZone), [timeZone]);
}

/** Short zone label ("PDT") for captions that need to say which clock is shown. */
export function timeZoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

export { getZonedParts };
