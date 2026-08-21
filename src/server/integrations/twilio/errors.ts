import "server-only";

import type { NormalizedError } from "@/types";

/**
 * Twilio failures, in the vocabulary the product already speaks.
 *
 * Each says two different things: `message` is what a business owner may be
 * shown — no vendor, no error number — and `adminDetail` is what an operator
 * needs, still with nothing sensitive in it. Twilio's numeric codes are useful
 * to an operator and meaningless to a salon owner, so they live in the second.
 */

export type SendResult =
  | { ok: true; value: { sid: string; status: "queued" | "sent" } }
  | { ok: false; error: NormalizedError };

function twilioError(partial: Omit<NormalizedError, "provider" | "timestamp">, now: Date): NormalizedError {
  return { ...partial, provider: "twilio", timestamp: now.toISOString() };
}

export const TWILIO_ERRORS = {
  notConfigured: (now: Date) =>
    twilioError(
      {
        code: "twilio_not_configured",
        category: "configuration",
        severity: "warning",
        message: "Text messaging is not set up yet.",
        adminDetail: "TWILIO_MODE is live but the account SID, auth token or sending number is missing.",
        retryable: false,
      },
      now
    ),

  authFailed: (now: Date) =>
    twilioError(
      {
        code: "twilio_auth_failed",
        category: "auth",
        severity: "critical",
        message: "Text messaging needs to be reconnected.",
        adminDetail: "Twilio rejected the credentials. Check the account SID and auth token.",
        retryable: false,
      },
      now
    ),

  /**
   * Trial accounts may only message verified numbers (Twilio code 21608).
   *
   * Kept as its own case rather than folded into a generic rejection because
   * the remedy is specific and human — verify the number, or upgrade — and an
   * operator seeing "invalid request" would go looking for a bug instead.
   */
  unverifiedRecipient: (now: Date) =>
    twilioError(
      {
        code: "twilio_unverified_recipient",
        category: "permission",
        severity: "warning",
        message: "That number has not been verified for messaging yet.",
        adminDetail:
          "Twilio 21608: trial accounts may only send to verified numbers. Verify the recipient or upgrade the account.",
        retryable: false,
      },
      now
    ),

  invalidRecipient: (now: Date) =>
    twilioError(
      {
        code: "twilio_invalid_recipient",
        category: "provider",
        severity: "warning",
        message: "That phone number cannot receive text messages.",
        adminDetail: "Twilio rejected the destination as not a valid SMS-capable number.",
        retryable: false,
      },
      now
    ),

  rateLimited: (retryAfterSeconds: number | null, now: Date) =>
    twilioError(
      {
        code: "twilio_rate_limited",
        category: "rate_limit",
        severity: "warning",
        message: "Messaging is busy. This will be retried shortly.",
        adminDetail: retryAfterSeconds
          ? `Twilio asked us to wait ${retryAfterSeconds}s.`
          : "Twilio returned a rate-limit response.",
        retryable: true,
      },
      now
    ),

  timeout: (ms: number, now: Date) =>
    twilioError(
      {
        code: "twilio_timeout",
        category: "network",
        severity: "warning",
        message: "The messaging service did not respond in time. Please try again.",
        adminDetail: `No response within ${ms}ms.`,
        retryable: true,
      },
      now
    ),

  unavailable: (detail: string, now: Date) =>
    twilioError(
      {
        code: "twilio_unavailable",
        category: "provider",
        severity: "critical",
        message: "The messaging service is unavailable right now.",
        adminDetail: detail,
        retryable: true,
      },
      now
    ),

  malformed: (detail: string, now: Date) =>
    twilioError(
      {
        code: "twilio_malformed_response",
        category: "provider",
        severity: "critical",
        message: "The messaging service returned something unexpected.",
        adminDetail: `Response failed validation: ${detail}`,
        retryable: false,
      },
      now
    ),

  /**
   * The carrier accepted the message and later refused to deliver it.
   *
   * This is the Twilio shape of the lesson Google taught with cancelled event
   * tombstones: transport success is not domain success. It arrives minutes
   * later, on a status callback, against an operation that already succeeded.
   */
  undelivered: (providerCode: string | null, now: Date) =>
    twilioError(
      {
        code: "twilio_undelivered",
        category: "provider",
        severity: "warning",
        message: "That text message could not be delivered.",
        adminDetail: providerCode
          ? `The carrier reported the message undeliverable (Twilio code ${providerCode}).`
          : "The carrier reported the message undeliverable.",
        // Never automatically: the message was already handed over once, and a
        // silent resend is how one notification becomes three.
        retryable: false,
      },
      now
    ),
} as const;
