import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Secret } from "@/server/integrations/credential-store";

/**
 * Twilio's webhook signature, which is not like ours.
 *
 * ── The algorithm, and why every part of it matters ─────────────────────────
 * Twilio computes:
 *
 *     base64( HMAC-SHA1( authToken, fullUrl + concat(sortedParamKey + value) ) )
 *
 * and sends it as `X-Twilio-Signature`. Three details differ from the n8n
 * scheme in ways that break a copied implementation:
 *
 *   1. **The URL is signed.** Not just the body — the complete URL Twilio was
 *      configured to call, including scheme, host, path and any query string.
 *      Behind a tunnel or a proxy the URL the server observes is not the URL
 *      Twilio signed, so the value is taken from configuration
 *      (`TWILIO_PUBLIC_WEBHOOK_URL`) rather than from the request. Reading it
 *      from a `Host` header would also hand an attacker control of what is
 *      being verified.
 *
 *   2. **The signed material is form parameters, not raw bytes.** Twilio posts
 *      `application/x-www-form-urlencoded` and signs the *decoded* key/value
 *      pairs sorted by key, concatenated with no separators. So the raw body
 *      still has to be preserved exactly — it is what the pairs are parsed
 *      from — but the digest is over the sorted pairs, not over the body text.
 *
 *   3. **HMAC-SHA1, base64.** Not SHA-256, not hex. Twilio's choice, and not
 *      ours to modernize unilaterally: the sender decides.
 *
 * ── Constant-time comparison ────────────────────────────────────────────────
 * `===` on two strings returns as soon as it finds a difference, and the time
 * it takes leaks how many leading characters matched — enough, one byte at a
 * time, to construct a valid signature. Every comparison goes through
 * `timingSafeEqual`, with a length check first because that function throws on
 * differing lengths and a caller controls the length of what they send.
 */

export const SIGNATURE_HEADER = "x-twilio-signature";

/**
 * Why a signature was refused.
 *
 * A closed set so the *server* can log precisely while the *response* stays a
 * single undifferentiated 403. Telling an unauthenticated caller whether their
 * signature was malformed, wrong, or simply unverifiable because we hold no
 * token is three free hints toward a valid one.
 */
export type SignatureFailure =
  | "missing_signature"
  | "no_token_configured"
  | "no_url_configured"
  | "invalid_signature";

export type VerificationResult = { valid: true } | { valid: false; reason: SignatureFailure };

/**
 * The exact string Twilio signed.
 *
 * Sorting is by key, and a key appearing more than once contributes each of its
 * values in the order received — `URLSearchParams` preserves that, and
 * collapsing duplicates would change the digest for a legitimate request.
 */
export function buildSignedPayload(url: string, params: URLSearchParams): string {
  const entries: [string, string][] = [];
  params.forEach((value, key) => entries.push([key, value]));
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries.reduce((acc, [key, value]) => acc + key + value, url);
}

/** The signature Twilio would send for this request. Used by tests and the simulator. */
export function computeSignature(url: string, params: URLSearchParams, token: Secret): string {
  return createHmac("sha1", token.expose()).update(buildSignedPayload(url, params), "utf8").digest("base64");
}

export function verify(input: {
  /** The configured public URL, not one derived from the request. */
  url: string | undefined;
  /** Parsed from the raw body, which must not have been re-serialised first. */
  params: URLSearchParams;
  signature: string | null;
  token: Secret | null;
}): VerificationResult {
  // Checked before anything else: without a token there is no verification to
  // perform, and treating "we are not configured" as "the caller is fine" is
  // the failure mode that turns a webhook into an open write endpoint.
  if (!input.token) return { valid: false, reason: "no_token_configured" };
  if (!input.url) return { valid: false, reason: "no_url_configured" };
  if (!input.signature) return { valid: false, reason: "missing_signature" };

  const expected = computeSignature(input.url, input.params, input.token);
  return timingSafeEqualBase64(expected, input.signature)
    ? { valid: true }
    : { valid: false, reason: "invalid_signature" };
}

function timingSafeEqualBase64(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
