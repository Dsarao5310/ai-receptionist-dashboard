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

const CHANNEL_LABELS: Record<keyof typeof WEIGHTS, string> = {
  calendar: "Calendar",
  voice: "Voice",
  sms: "SMS",
  email: "Email",
};

export interface ReadinessChannel {
  key: keyof typeof WEIGHTS;
  label: string;
  /** Share of the composite score this channel accounts for, e.g. 34 for 34%. */
  weight: number;
  state: ConnectionState;
}

export interface Readiness {
  score: number;
  caption: string;
  /** What the score is made of — the thing StatusStrip's connection badges
   *  don't show: how much each channel actually counts. */
  breakdown: ReadinessChannel[];
}

function buildBreakdown(status: ReceptionistStatus): ReadinessChannel[] {
  return (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => ({
    key,
    label: CHANNEL_LABELS[key],
    weight: WEIGHTS[key],
    state: status[key],
  }));
}

export function getReadiness(status: ReceptionistStatus): Readiness {
  const breakdown = buildBreakdown(status);

  // Offline is a a hard zero rather than a weighted sum: if the receptionist is
  // switched off, no amount of healthy plumbing means it is doing anything.
  if (status.overall === "offline") {
    return {
      score: 0,
      caption: "The receptionist is switched off, so nothing is being handled right now.",
      breakdown,
    };
  }

  const score = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
    (sum, key) => sum + WEIGHTS[key] * credit(status[key]),
    0
  );

  const missingCount = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).filter(
    (key) => status[key] === "disconnected"
  ).length;

  if (missingCount === 0) {
    return { score, caption: "Every channel is connected and working normally.", breakdown };
  }

  // No caption sentence here: the breakdown list below states exactly which
  // channels are costing points and by how much — a hollow dot next to a
  // weight number already answers "what, and how much", which used to take a
  // full sentence to say and still repeated names StatusStrip had already
  // shown above it.
  return { score, caption: "", breakdown };
}
