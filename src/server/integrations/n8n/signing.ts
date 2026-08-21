import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Secret } from "@/server/integrations/credential-store";

/**
 * The signature both directions of the n8n boundary are authenticated with.
 *
 * ── Why signing and not a bearer token ──────────────────────────────────────
 * A shared bearer token proves the caller once knew a secret. A signature over
 * the body proves that *this* body, at *this* time, came from someone who knows
 * it — so a captured request cannot be replayed with the payload edited, and an
 * intermediary cannot append a field.
 *
 * The signed string is `v1:{timestamp}:{body}`, and the timestamp is a signed
 * input rather than a header the receiver merely reads. That is what makes the
 * freshness window meaningful: an attacker replaying yesterday's request cannot
 * move the timestamp forward without invalidating the signature they copied.
 *
 * ── Constant-time comparison ────────────────────────────────────────────────
 * `===` on two strings returns as soon as it finds a difference, and the time
 * it takes is therefore a function of how many leading characters matched. That
 * leaks, one byte at a time, enough to construct a valid signature. Every
 * comparison here goes through `timingSafeEqual`.
 *
 * ── Version prefix ──────────────────────────────────────────────────────────
 * `v1=` is not decoration. Changing a signing scheme with live workflows on the
 * other side requires a period where both are accepted, and that is only
 * possible if the receiver can tell them apart.
 */

export const SIGNATURE_VERSION = "v1";

/** Header names, defined once so both directions cannot drift apart. */
export const SIGNATURE_HEADER = "x-receptionist-signature";
export const TIMESTAMP_HEADER = "x-receptionist-timestamp";

/**
 * How far out of date a signed request may be.
 *
 * Five minutes is enough for ordinary clock skew between two machines and short
 * enough that a captured request stops being useful quickly. It cannot be made
 * generous "just in case": the window *is* the replay protection.
 */
export const MAX_CLOCK_SKEW_SECONDS = 300;

function payloadToSign(timestamp: number, body: string): string {
  return `${SIGNATURE_VERSION}:${timestamp}:${body}`;
}

export function sign(body: string, secret: Secret, now: Date): { signature: string; timestamp: number } {
  const timestamp = Math.floor(now.getTime() / 1000);
  const digest = createHmac("sha256", secret.expose()).update(payloadToSign(timestamp, body)).digest("hex");
  return { signature: `${SIGNATURE_VERSION}=${digest}`, timestamp };
}

/**
 * Why a signature was refused.
 *
 * Kept as a small closed set so the *caller* can log precisely while the
 * *response* stays a single undifferentiated failure. Telling an unauthenticated
 * caller whether their signature was malformed, stale or simply wrong is three
 * free hints toward a valid one.
 */
export type SignatureFailure =
  | "missing_signature"
  | "missing_timestamp"
  | "malformed_signature"
  | "unsupported_version"
  | "stale_timestamp"
  | "invalid_signature"
  | "no_secret_configured";

export type VerificationResult = { valid: true } | { valid: false; reason: SignatureFailure };

export function verify(input: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  secret: Secret | null;
  now: Date;
  maxSkewSeconds?: number;
}): VerificationResult {
  // Checked before anything else: without a secret there is no verification to
  // do, and treating "we are not configured" as "the caller is fine" is the
  // failure mode that turns an ingestion endpoint into an open write API.
  if (!input.secret) return { valid: false, reason: "no_secret_configured" };
  if (!input.signature) return { valid: false, reason: "missing_signature" };
  if (!input.timestamp) return { valid: false, reason: "missing_timestamp" };

  const [version, provided] = input.signature.split("=", 2);
  if (!version || !provided) return { valid: false, reason: "malformed_signature" };
  if (version !== SIGNATURE_VERSION) return { valid: false, reason: "unsupported_version" };

  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: "missing_timestamp" };

  // Absolute difference, so a timestamp from the future is rejected too. A
  // caller whose clock is an hour fast would otherwise hold a request that
  // stays valid for an hour.
  const skew = Math.abs(Math.floor(input.now.getTime() / 1000) - timestamp);
  if (skew > (input.maxSkewSeconds ?? MAX_CLOCK_SKEW_SECONDS)) return { valid: false, reason: "stale_timestamp" };

  const expected = createHmac("sha256", input.secret.expose())
    .update(payloadToSign(timestamp, input.body))
    .digest("hex");

  return timingSafeEqualHex(expected, provided) ? { valid: true } : { valid: false, reason: "invalid_signature" };
}

/**
 * `timingSafeEqual` throws on differing lengths, which would itself be a timing
 * signal — and a caller can trivially control the length of what they send. The
 * lengths are compared first and a mismatch is simply "not equal", so a short
 * signature and a wrong signature take the same path.
 */
function timingSafeEqualHex(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
