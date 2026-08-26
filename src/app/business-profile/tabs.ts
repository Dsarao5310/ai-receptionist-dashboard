/**
 * Kept out of view.tsx deliberately: that file is "use client", and every
 * export of a client module becomes an opaque client reference when a Server
 * Component imports it — including plain constants, not just components. The
 * server-rendered page.tsx needs the real array to validate the ?tab= query
 * param, so this lives in its own plain module both sides can import safely.
 */
export type ProfileTab = "details" | "hours" | "services" | "knowledge";
export const PROFILE_TABS: ProfileTab[] = ["details", "hours", "services", "knowledge"];
