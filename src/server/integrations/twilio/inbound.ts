import "server-only";

import { serverEnv } from "@/server/env";
import { credentialStore } from "@/server/integrations/credential-store";
import {
  ingestInboundEvent,
  type ApplyResult,
  type EventIdentity,
  type InboundProvider,
  type InboundRequest,
  type IngestionOutcome,
  type Scope,
  type TenantResolution,
} from "@/server/integrations/inbound/pipeline";
import { toE164 } from "./phone-numbers";
import { verify, SIGNATURE_HEADER } from "./signing";
import { resolveWorkspaceFromNumber } from "./tenancy";

/**
 * What Twilio sends us, and what it means.
 *
 * ── Two providers, one pipeline ─────────────────────────────────────────────
 * Twilio posts two quite different things to two different URLs: an inbound
 * message, and a delivery receipt for a message we sent. They share a signature
 * scheme, a tenant-resolution rule and an idempotency identity, and they differ
 * only in payload and effect — which is exactly the split the shared pipeline
 * was extracted for. Each is an `InboundProvider`; the gate sequence, receipt,
 * transaction and audit are inherited.
 *
 * ── Why the tenant comes from a number and not the body ─────────────────────
 * A Twilio signature proves the request came from Twilio. It does not say which
 * business it is for — one Twilio account can serve every tenant on the
 * platform. So the workspace is resolved from `provider_phone_numbers`, a
 * mapping we issued, keyed on the number that is *ours* in each direction:
 *
 *   • inbound message  — `To`   is our number, `From` is the customer
 *   • status callback  — `From` is our number, `To`   is the customer
 *
 * Getting that backwards would resolve tenancy from a value the sender chooses,
 * which is the whole failure this design exists to prevent.
 */

function params(request: InboundRequest): URLSearchParams {
  // Parsed from the raw body, never from a re-serialised object: the signature
  // is computed over these decoded pairs and the bytes must survive intact.
  return new URLSearchParams(request.rawBody);
}

/** Shared by both providers: same header, same token, same configured URL. */
function verifyTwilio(request: InboundRequest, url: string | undefined) {
  return verify({
    url,
    params: params(request),
    signature: request.headers.get(SIGNATURE_HEADER),
    token: credentialStore.resolve("twilio", "auth_token"),
  });
}

// ── Inbound messages ────────────────────────────────────────────────────────

export interface InboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
}

export const twilioMessageProvider: InboundProvider<InboundMessage> = {
  source: "twilio",

  verify(request) {
    return verifyTwilio(request, serverEnv.twilioPublicWebhookUrl);
  },

  parse(request) {
    const form = params(request);
    const messageSid = form.get("MessageSid") ?? form.get("SmsSid");
    const from = form.get("From");
    const to = form.get("To");

    if (!messageSid) return { ok: false, reason: "missing MessageSid" };
    if (!from || !to) return { ok: false, reason: "missing From or To" };

    // Normalized before anything looks a number up. Twilio sends E.164 already,
    // but a value that arrives another way must not silently miss the mapping.
    const fromE164 = toE164(from);
    const toE164Value = toE164(to);
    if (!fromE164 || !toE164Value) return { ok: false, reason: "From or To is not a valid phone number" };

    return {
      ok: true,
      value: { messageSid, from: fromE164, to: toE164Value, body: form.get("Body") ?? "" },
    };
  },

  async resolveTenant(message): Promise<TenantResolution> {
    // `To` is our number on an inbound message.
    const resolved = await resolveWorkspaceFromNumber(message.to);
    if (!resolved) return { ok: false, reason: "unrecognised destination number" };
    if (!resolved.smsEnabled) return { ok: false, reason: "number is not enabled for SMS" };
    return { ok: true, workspaceId: resolved.workspaceId };
  },

  identity(message): EventIdentity {
    // Twilio's own message sid. Trusted as a dedupe label only, never to decide
    // tenancy — a redelivery of the same sid must apply exactly once.
    return { externalEventId: message.messageSid, eventType: "message.received", schemaVersion: 1 };
  },

  async apply(scope: Scope, message: InboundMessage, now: Date): Promise<ApplyResult> {
    // Attach to a known customer where one exists. A number we have never seen
    // is recorded as traffic without inventing a customer record — an unknown
    // sender is not yet a customer of this business.
    const customer = await scope.customers.findByContact({ phone: message.from });

    await scope.messaging.recordMessage({
      direction: "inbound",
      providerMessageSid: message.messageSid,
      fromNumber: message.from,
      toNumber: message.to,
      body: message.body,
      status: "received",
      customerId: customer?.id ?? null,
      sentAt: now,
    });

    return {
      ok: true,
      detail: `Message received from ${message.from}.`,
      operationId: null,
    };
  },

  audit: { accepted: "workflow.event_received", rejected: "workflow.event_rejected" },
};

// ── Delivery status callbacks ───────────────────────────────────────────────

export interface DeliveryStatus {
  messageSid: string;
  /** Our number. */
  from: string;
  status: string;
  errorCode: string | null;
}

/** Twilio's larger status vocabulary, normalized to what the domain stores. */
function normalizeStatus(raw: string): "sent" | "delivered" | "undelivered" | "failed" | null {
  switch (raw) {
    case "delivered":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
      return "failed";
    case "sent":
    case "queued":
    case "sending":
    case "accepted":
      return "sent";
    default:
      return null;
  }
}

export const twilioStatusProvider: InboundProvider<DeliveryStatus> = {
  source: "twilio",

  verify(request) {
    return verifyTwilio(request, serverEnv.twilioStatusCallbackUrl ?? serverEnv.twilioPublicWebhookUrl);
  },

  parse(request) {
    const form = params(request);
    const messageSid = form.get("MessageSid") ?? form.get("SmsSid");
    const status = form.get("MessageStatus") ?? form.get("SmsStatus");
    const from = form.get("From");

    if (!messageSid) return { ok: false, reason: "missing MessageSid" };
    if (!status) return { ok: false, reason: "missing MessageStatus" };
    if (!from) return { ok: false, reason: "missing From" };

    const fromE164 = toE164(from);
    if (!fromE164) return { ok: false, reason: "From is not a valid phone number" };

    return {
      ok: true,
      value: { messageSid, from: fromE164, status, errorCode: form.get("ErrorCode") },
    };
  },

  async resolveTenant(event): Promise<TenantResolution> {
    // `From` is our number on a status callback — the mirror of an inbound
    // message, and the reason this is not shared blindly with the one above.
    const resolved = await resolveWorkspaceFromNumber(event.from);
    return resolved
      ? { ok: true, workspaceId: resolved.workspaceId }
      : { ok: false, reason: "unrecognised sending number" };
  },

  identity(event): EventIdentity {
    // Deliberately *not* the bare message sid: a message legitimately produces
    // several callbacks as it progresses (sent → delivered), and keying the
    // receipt on the sid alone would discard every status after the first.
    // Keying on sid + status makes each transition exactly-once instead.
    return {
      externalEventId: `${event.messageSid}:${event.status}`,
      eventType: "message.status",
      schemaVersion: 1,
    };
  },

  async apply(scope: Scope, event: DeliveryStatus, now: Date): Promise<ApplyResult> {
    const status = normalizeStatus(event.status);
    if (!status) return { ok: false, detail: `unsupported message status "${event.status}"` };

    const result = await scope.messaging.applyDeliveryStatus({
      providerMessageSid: event.messageSid,
      status,
      errorCode: event.errorCode,
      errorMessage: null,
      at: now,
    });

    // A callback for a message this workspace never sent. Scoped lookup, so a
    // sid belonging to another tenant resolves to nothing here.
    if (!result) return { ok: false, detail: "no message matches that provider id" };

    // The message already reached delivered/undelivered/failed — a sink
    // Twilio does not transition out of — so this callback is a stale,
    // out-of-order redelivery of an earlier state, not new information.
    // Accepted (it is not malformed or foreign), but nothing changed and
    // nothing is reported: firing a notification for a fact that already
    // settled would tell an operator something happened when it did not.
    if (!result.changed) {
      return { ok: true, detail: `Message already ${result.message.status}; stale callback ignored.`, operationId: null };
    }

    const updated = result.message;

    // The moment worth surfacing: the carrier accepted this message earlier and
    // has now refused it. The operation that sent it already succeeded and is
    // deliberately not reopened — this is a new, later fact about the same
    // message, and an operator needs to see it as one.
    if (status === "undelivered" || status === "failed") {
      await scope.integrations.recordEvent({
        provider: "twilio",
        type: "message_undelivered",
        message: `A text message to ${updated.toNumber} could not be delivered.`,
        severity: "warning",
        occurredAt: now,
      });
    } else if (status === "delivered") {
      await scope.integrations.recordEvent({
        provider: "twilio",
        type: "message_delivered",
        message: `A text message to ${updated.toNumber} was delivered.`,
        severity: "info",
        occurredAt: now,
      });
    }

    return { ok: true, detail: `Message ${status}.`, operationId: null };
  },

  audit: { accepted: "workflow.event_received", rejected: "workflow.event_rejected" },
};

// ── Entry points ────────────────────────────────────────────────────────────

export interface TwilioWebhookRequest {
  rawBody: string;
  signature: string | null;
  now?: Date;
}

function toInboundRequest(request: TwilioWebhookRequest, url: string) {
  const headers = new Headers();
  if (request.signature) headers.set(SIGNATURE_HEADER, request.signature);
  return { url, headers, rawBody: request.rawBody, now: request.now };
}

export async function ingestInboundMessage(request: TwilioWebhookRequest): Promise<IngestionOutcome> {
  return ingestInboundEvent(
    twilioMessageProvider,
    toInboundRequest(request, serverEnv.twilioPublicWebhookUrl ?? "")
  );
}

export async function ingestDeliveryStatus(request: TwilioWebhookRequest): Promise<IngestionOutcome> {
  return ingestInboundEvent(
    twilioStatusProvider,
    toInboundRequest(request, serverEnv.twilioStatusCallbackUrl ?? serverEnv.twilioPublicWebhookUrl ?? "")
  );
}

export { SIGNATURE_HEADER };
