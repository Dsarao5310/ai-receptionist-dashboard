import { getZonedParts, isValidTimeZone, wallClockToInstant, zonedDayKey } from "@/lib/timezone";

/**
 * The timezone boundary every provider adapter must cross through.
 *
 * No providers are connected yet. This module exists so the rule described in
 * `services/README.md` is executable rather than only written down: whatever
 * telephony, calendar, email, SMS or automation platform is wired up later, its
 * timestamps are normalized *here*, at the edge, and everything below only ever
 * sees canonical values.
 *
 * The two directions are deliberately asymmetric, because the domain stores two
 * different kinds of value:
 *
 *   • instants (`createdAt`, conversation `timestamp`) — absolute moments
 *   • wall-clock values (`appointment.date` + `.time`, opening hours) — which
 *     mean nothing until resolved against the business timezone
 *
 * Nothing in this module reads the ambient clock or the runtime's zone.
 */

/** A timestamp as a provider sent it, before it is trusted. */
export interface ProviderTimestamp {
  /** ISO 8601. May or may not carry an offset — see `timeZone`. */
  value: string;
  /**
   * The IANA zone the provider's own clock is in, for payloads that send a bare
   * wall-clock string. Ignored when `value` already carries an offset, since an
   * explicit offset is the more specific statement of the same fact.
   */
  timeZone?: string;
}

const HAS_OFFSET = /(?:Z|z|[+-]\d{2}:?\d{2})$/;
const NAIVE_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;

/**
 * A provider timestamp as an absolute instant.
 *
 * A value carrying an offset is taken at face value — `2026-08-17T09:00:00-07:00`
 * is a different moment from `2026-08-17T09:00:00Z`, and re-anchoring either to
 * a "nicer" zone would be data loss.
 *
 * A value *without* an offset is not yet a timestamp: it is a wall-clock reading
 * on some clock, and which clock must be stated. Rather than quietly assuming
 * the server's zone — the exact leak this boundary exists to prevent — this
 * throws unless the provider's zone is supplied.
 */
export function instantFromProvider({ value, timeZone }: ProviderTimestamp): Date {
  const raw = value.trim();

  if (HAS_OFFSET.test(raw)) {
    const instant = new Date(raw);
    if (Number.isNaN(instant.getTime())) throw new Error(`Provider sent an unparseable timestamp: ${value}`);
    return instant;
  }

  const naive = NAIVE_DATE_TIME.exec(raw);
  if (!naive) throw new Error(`Provider sent an unparseable timestamp: ${value}`);
  if (!timeZone) {
    throw new Error(
      `Provider timestamp "${value}" carries no UTC offset, so the zone it was recorded in must be supplied. ` +
        `Guessing would let the provider's local time leak into business logic.`
    );
  }
  if (!isValidTimeZone(timeZone)) throw new Error(`Provider sent an unrecognised timezone: ${timeZone}`);

  const [, dayKey, hour, minute] = naive;
  return wallClockToInstant(dayKey, `${hour}:${minute}`, timeZone);
}

/**
 * An instant projected onto the business's calendar, in the shape appointments
 * store: a wall-clock day key plus `HH:mm`.
 *
 * This is the *only* correct way to turn a provider's moment into an
 * appointment's `date` and `time`. Slicing an ISO string would store the day and
 * time as UTC read them; using the runtime's zone would store them as wherever
 * the server happens to run.
 */
export function businessWallClock(instant: Date, businessTimeZone: string): { date: string; time: string } {
  const { hour, minute } = getZonedParts(instant, businessTimeZone);
  return {
    date: zonedDayKey(instant, businessTimeZone),
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/**
 * The reverse: a stored wall-clock booking as an absolute instant, ready to hand
 * to a provider. Resolve first, format second — never send a provider a bare
 * `"2026-08-17T09:00"` and leave it to guess.
 */
export function instantForProvider(date: string, time: string, businessTimeZone: string): Date {
  return wallClockToInstant(date, time, businessTimeZone);
}
