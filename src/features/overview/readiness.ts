import type { ConnectionState, ReceptionistStatus } from "@/types";

/**
 * How ready the receptionist is to do its job, as a 0–100 score.
 *
 * ── Derived, not stored ────────────────────────────────────────────────────
 * This is a presentation of `getReceptionistStatus`, which is itself derived
 * on the server from the provider records. Nothing here is persisted and there
 * is no second source of truth to drift: change a connection and this moves
 * with it.
 *
 * ── The weighting ──────────────────────────────────────────────────────────
 * The four channels are not equal. Calendar carries the most weight because
 * without it a booking cannot complete at all — every other channel becomes a
 * way of taking a message. A half-working channel scores half, because
 * "needs attention" means degraded rather than dead.
 */
const WEIGHTS: Record<keyof Omit<ReceptionistStatus, "overall">, number> = {
  calendar: 34,
  voice: 22,
  sms: 22,
  email: 22,
};

function credit(state: ConnectionState): number {
  if (state === "connected") return 1;
  if (state === "needs_attention") return 0.5;
  return 0;
}

export interface Readiness {
  score: number;
  caption: string;
}

export function getReadiness(status: ReceptionistStatus): Readiness {
  // Offline is a a hard zero rather than a weighted sum: if the receptionist is
  // switched off, no amount of healthy plumbing means it is doing anything.
  if (status.overall === "offline") {
    return { score: 0, caption: "The receptionist is switched off, so nothing is being handled right now." };
  }

  const score = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
    (sum, key) => sum + WEIGHTS[key] * credit(status[key]),
    0
  );

  const missing = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).filter(
    (key) => status[key] === "disconnected"
  );

  if (missing.length === 0) {
    return { score, caption: "Every channel is connected and working normally." };
  }

  const names: Record<keyof typeof WEIGHTS, string> = {
    calendar: "Calendar",
    voice: "Voice",
    sms: "SMS",
    email: "Email",
  };
  const list = missing.map((k) => names[k]);
  const readable =
    list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

  return {
    score,
    caption: `${readable} ${list.length === 1 ? "is" : "are"} not set up yet.`,
  };
}
