/**
 * Deterministic PRNG (mulberry32). Given the same seed, produces the same
 * sequence — used so demo data is reproducible within a single generation
 * pass instead of relying on Math.random().
 */
export function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export function randomInt(rand: Rand, min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export function pick<T>(rand: Rand, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function pickWeighted<T extends string>(rand: Rand, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function shuffle<T>(rand: Rand, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * ── Calendar-grid date helpers ──────────────────────────────────────────────
 *
 * These operate in the *runtime's* local time and are only correct for building
 * a grid of plain calendar dates: they construct a date locally and read it back
 * locally, so the two cancel out and the resulting day never shifts.
 *
 * They must not be used to reason about business hours, "today", or when an
 * appointment actually happens — those are questions about the business's
 * timezone, and `@/lib/timezone` exists to answer them. Anything that compares a
 * stored timestamp against a business rule belongs there, not here.
 */

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Elapsed-time arithmetic — zone-independent, since it shifts an instant. */
export function addMinutes(date: Date, minutes: number) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD for a locally-constructed calendar date. See the note above. */
export function isoDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
