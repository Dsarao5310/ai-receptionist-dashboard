import "server-only";

import { serverEnv } from "@/server/env";
import { credentialStore, type Secret } from "@/server/integrations/credential-store";
import { TWILIO_ERRORS, type SendResult } from "./errors";
import { simulatedTwilio } from "./simulator";

/**
 * The Twilio REST API, behind one door.
 *
 * ── No generic request function escapes this module ─────────────────────────
 * `request()` is private. What the rest of the application can call is
 * `sendSms` — one named domain operation whose payload the server builds. There
 * is deliberately no `twilioRequest(method, path, body)` for a caller to reach
 * for: that would hand every call site the ability to buy numbers, read message
 * history or change account settings with the same credential.
 *
 * ── Everything is normalized on the way out ─────────────────────────────────
 * A caller never sees an HTTP status or a Twilio error body. Failures leave as
 * `NormalizedError`; Twilio's numeric codes are mapped to the small set in
 * ./errors.ts, because "21608" is actionable to an operator and meaningless to
 * the business owner who will be shown the message.
 *
 * ── Modes ───────────────────────────────────────────────────────────────────
 * `simulated` runs an in-process carrier with the same semantics. Production
 * refuses to start in that mode, so it cannot quietly stand in for a real one.
 */

const API_BASE = "https://api.twilio.com/2010-04-01";

/** Twilio's numeric codes, mapped to the vocabulary above. */
function mapProviderCode(code: number | undefined, status: number, now: Date) {
  switch (code) {
    case 21608:
      return TWILIO_ERRORS.unverifiedRecipient(now);
    case 21211:
    case 21614:
      return TWILIO_ERRORS.invalidRecipient(now);
    case 20003:
      return TWILIO_ERRORS.authFailed(now);
    case 20429:
      return TWILIO_ERRORS.rateLimited(null, now);
    default:
      return status === 401 || status === 403
        ? TWILIO_ERRORS.authFailed(now)
        : TWILIO_ERRORS.unavailable(`Twilio returned HTTP ${status}.`, now);
  }
}

interface RequestOptions {
  path: string;
  form: URLSearchParams;
  accountSid: string;
  token: Secret;
  now: Date;
}

/**
 * One HTTP call to Twilio. Private on purpose — see the module note.
 *
 * The credential goes in the Authorization header via `.expose()` exactly here,
 * and never into a URL, where it would be written to access logs on the way.
 */
async function request(options: RequestOptions): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: ReturnType<typeof mapProviderCode> }
> {
  const controller = new AbortController();
  const timeoutMs = serverEnv.twilioTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}/Accounts/${options.accountSid}${options.path}`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.token.expose()}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: options.form.toString(),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = null;
    }

    if (!response.ok) {
      const code = body && typeof body.code === "number" ? body.code : undefined;
      return { ok: false, error: mapProviderCode(code, response.status, options.now) };
    }
    if (!body) {
      return { ok: false, error: TWILIO_ERRORS.malformed("body was not JSON", options.now) };
    }
    return { ok: true, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: TWILIO_ERRORS.timeout(timeoutMs, options.now) };
    }
    // Only the error's class name: a fetch failure's message can contain the
    // full request URL, which carries the account sid.
    const detail = error instanceof Error ? error.constructor.name : "unknown transport failure";
    return { ok: false, error: TWILIO_ERRORS.unavailable(detail, options.now) };
  } finally {
    clearTimeout(timer);
  }
}

export interface SendSmsInput {
  to: string;
  from: string;
  body: string;
  /** Where Twilio should report delivery outcomes. Optional but strongly wanted. */
  statusCallbackUrl?: string | null;
  now: Date;
}

/**
 * Hand one message to the carrier.
 *
 * Returns what Twilio actually says: a sid and a *queued* status. That is not
 * delivery, and this function does not pretend otherwise — the real outcome
 * arrives later on a status callback. See `errors.undelivered`.
 */
export async function sendSms(input: SendSmsInput): Promise<SendResult> {
  if (serverEnv.twilioMode === "disabled") {
    return { ok: false, error: TWILIO_ERRORS.notConfigured(input.now) };
  }
  if (serverEnv.twilioMode === "simulated") {
    return simulatedTwilio.send(input);
  }

  const accountSid = serverEnv.twilioAccountSid;
  const token = credentialStore.resolve("twilio", "auth_token");
  if (!accountSid || !token || !input.statusCallbackUrl) {
    return { ok: false, error: TWILIO_ERRORS.notConfigured(input.now) };
  }

  const form = new URLSearchParams({ To: input.to, From: input.from, Body: input.body });
  form.set("StatusCallback", input.statusCallbackUrl);

  const result = await request({
    path: "/Messages.json",
    form,
    accountSid,
    token,
    now: input.now,
  });
  if (!result.ok) return result;

  const sid = typeof result.body.sid === "string" ? result.body.sid : null;
  if (!sid) return { ok: false, error: TWILIO_ERRORS.malformed("message had no sid", input.now) };

  const status = result.body.status === "sent" ? "sent" : "queued";
  return { ok: true, value: { sid, status } };
}
