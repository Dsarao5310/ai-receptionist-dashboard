import type { NormalizedError } from "@/types";

function error(
  code: string,
  category: NormalizedError["category"],
  message: string,
  retryable: boolean,
  now: Date,
  severity: NormalizedError["severity"] = "warning"
): NormalizedError {
  return {
    code,
    category,
    severity,
    message,
    provider: "gmail",
    timestamp: now.toISOString(),
    retryable,
  };
}

export const EMAIL_ERRORS = {
  notConfigured: (now: Date) =>
    error("email_not_configured", "configuration", "Email is not set up yet.", false, now),
  invalidAddress: (now: Date) =>
    error("email_invalid_address", "provider", "That email address is not valid.", false, now),
  rateLimited: (now: Date) =>
    error("email_rate_limited", "rate_limit", "Email is busy. Please try again shortly.", true, now),
  timeout: (now: Date) =>
    error("email_timeout", "network", "The email service did not respond in time.", true, now),
  rejected: (now: Date) =>
    error("email_rejected", "provider", "The email service rejected that message.", false, now),
  localWriteFailed: (now: Date) =>
    error(
      "external_success_local_write_failed",
      "unknown",
      "That email was accepted but could not be saved. Support has been notified.",
      false,
      now,
      "critical"
    ),
};

export type EmailSendResult =
  | { ok: true; value: { messageId: string; threadId: string; status: "accepted" } }
  | { ok: false; error: NormalizedError };
