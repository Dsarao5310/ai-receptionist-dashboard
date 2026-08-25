import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Plain `twMerge` does not know about the dashboard display layer's custom
 * type-scale classes (`globals.css`'s `.text-metric`/`.text-display`/
 * `.text-section`). Without this, `twMerge` falls back to treating any
 * unrecognised `text-*` class as a generic "last one wins" conflict with
 * *any other* `text-*` class in the same call — including a genuinely
 * unrelated text-colour class. `cn("text-metric", "text-hero-text")` silently
 * dropped `text-metric` entirely rather than keeping both: confirmed live,
 * every KPI tile's number was rendering at the browser default 16px instead
 * of the intended 30px, with no error and no visual cue something was wrong.
 * Registering them into the real `font-size` group fixes that while still
 * correctly conflicting with each other or with `text-2xl` if ever combined.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-metric", "text-display", "text-section"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Date and time formatting deliberately does not live here.
 *
 * Every date or time this app shows belongs to a business with its own
 * timezone, so formatting it in the *viewer's* zone is always a bug — a call
 * logged at 4pm in the shop must not read as 7pm to the owner checking from a
 * hotel. Use `useBusinessFormat()` (or `createBusinessFormat`) from
 * `@/lib/business-format`, which is bound to `config.business.timezone` and
 * keeps instants and stored wall-clock day keys distinct.
 *
 * What remains below is zone-independent: elapsed durations, money, and text.
 */

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
