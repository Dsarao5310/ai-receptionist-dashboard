import "server-only";

import type { NormalizedError } from "@/types";
import { TWILIO_ERRORS, type SendResult } from "./errors";

/**
 * A carrier that behaves like Twilio, in process.
 *
 * ── Deterministic, including its failures ───────────────────────────────────
 * No randomness anywhere. Message ids come from a counter, and every failure
 * mode is selected by the *destination number* — a test names an outcome by
 * choosing who it texts, rather than by mocking a transport. That mirrors the
 * calendar simulator, where the failure is chosen by calendar id.
 *
 * The reserved numbers below are deliberately in the North American
 * `555-01xx` fictional range, so a test destination can never collide with a
 * number a real person might hold.
 *
 * ── What it models that a naive mock would not ──────────────────────────────
 * The gap between *accepted* and *delivered*. `send` returns `queued`, which is
 * exactly what Twilio returns: it means the carrier took the message, and it is
 * not evidence anybody received it. Delivery outcomes arrive separately, the
 * way they really do, through the status-callback pipeline. A simulator that
 * returned "delivered" from `send` would quietly teach the wrong lesson.
 */

interface StoredMessage {
  sid: string;
  to: string;
  from: string;
  body: string;
  status: "queued" | "sent" | "delivered" | "undelivered" | "failed";
}

const messages = new Map<string, StoredMessage>();
let sequence = 0;

/** Failure injection by destination number, so an outcome is configuration. */
export const SIMULATED = {
  /** Twilio refuses: unverified recipient on a trial account (error 21608). */
  unverified: "+15550100001",
  /** Twilio refuses: not a valid mobile number (error 21614). */
  invalid: "+15550100002",
  /** The request times out before the carrier answers. */
  timeout: "+15550100003",
  /** Accepted, then the carrier gives up. Delivered via the status callback. */
  undelivered: "+15550100004",
  /** Twilio rate-limits us. */
  rateLimited: "+15550100005",
} as const;

export const simulatedTwilio = {
  async send(input: { to: string; from: string; body: string; now: Date }): Promise<SendResult> {
    switch (input.to) {
      case SIMULATED.unverified:
        return { ok: false, error: TWILIO_ERRORS.unverifiedRecipient(input.now) };
      case SIMULATED.invalid:
        return { ok: false, error: TWILIO_ERRORS.invalidRecipient(input.now) };
      case SIMULATED.timeout:
        return { ok: false, error: TWILIO_ERRORS.timeout(10_000, input.now) };
      case SIMULATED.rateLimited:
        return { ok: false, error: TWILIO_ERRORS.rateLimited(30, input.now) };
    }

    // A fresh sid every time, exactly as Twilio would. A retry that reached
    // here twice *would* produce two messages — which is why the idempotency
    // that prevents it lives in the operation layer, and why this simulator
    // must not paper over its absence.
    sequence += 1;
    const sid = `SM_sim_${sequence}`;
    messages.set(sid, { sid, to: input.to, from: input.from, body: input.body, status: "queued" });

    // `queued`, never `delivered`. See the module note.
    return { ok: true, value: { sid, status: "queued" } };
  },

  // ── Test affordances ──────────────────────────────────────────────────────

  reset(): void {
    messages.clear();
    sequence = 0;
  },

  all(): StoredMessage[] {
    return [...messages.values()];
  },

  find(sid: string): StoredMessage | null {
    return messages.get(sid) ?? null;
  },

  /** What the carrier later decided, as it would arrive on a status callback. */
  markStatus(sid: string, status: StoredMessage["status"]): void {
    const stored = messages.get(sid);
    if (stored) stored.status = status;
  },
};

export type { NormalizedError };
