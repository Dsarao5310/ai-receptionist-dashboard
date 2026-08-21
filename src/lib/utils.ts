import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
