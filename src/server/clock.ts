import "server-only";

/**
 * The trusted clock.
 *
 * ── Why this exists as its own module ───────────────────────────────────────
 * The scheduling rules take `now` as an argument, which is what makes them
 * testable — but it also means someone could pass a `now` that arrived from a
 * browser. That would let a client reschedule into the past simply by claiming
 * an earlier time.
 *
 * So there are two clocks, and only one of them is authoritative:
 *
 *   • the **browser clock** drives immediate feedback while someone types. It
 *     is convenience, and it is allowed to be wrong.
 *   • the **server clock** — this one — decides. Every server action reads it
 *     here and never accepts a time from its input.
 *
 * A client-supplied `now` is not merely discouraged; no protected action takes
 * one as a parameter, so there is nothing to forget to validate.
 */
export function serverNow(): Date {
  return new Date();
}

/**
 * For tests that need a fixed clock. Only ever used from test code — production
 * paths call `serverNow`, which takes no arguments and cannot be influenced.
 */
export function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}
