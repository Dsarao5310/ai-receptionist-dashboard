import "server-only";

import { instantFromProvider } from "@/services/adapters/provider-time";
import { serverEnv } from "@/server/env";
import { resolveWorkspaceFromMailbox } from "@/server/db/repositories/email";
import {
  ingestInboundEvent,
  type ApplyResult,
  type InboundProvider,
  type InboundRequest,
  type IngestionOutcome,
  type Parsed,
  type Scope,
} from "@/server/integrations/inbound/pipeline";
import { normalizeEmailAddress } from "./addresses";

const SIMULATOR_HEADER = "x-email-simulator";
const SIMULATOR_VALUE = "local-email-foundation";
const MAX_ID = 200;
const MAX_SUBJECT = 998;
const MAX_BODY = 100_000;

export interface EmailEnvelope {
  providerMailboxId: string;
  providerThreadId: string;
  providerMessageId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  eventAt: Date;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

export function parseEmailEnvelope(rawBody: string): Parsed<EmailEnvelope> {
  let root: JsonObject | null;
  try {
    root = object(JSON.parse(rawBody));
  } catch {
    return { ok: false, reason: "body is not valid JSON" };
  }
  if (!root || root.eventType !== "message.received") {
    return { ok: false, reason: "unsupported email event" };
  }
  const message = object(root.message);
  if (!message) return { ok: false, reason: "message is required" };

  const providerMailboxId = bounded(root.mailboxId, MAX_ID);
  const providerThreadId = bounded(message.threadId, MAX_ID);
  const providerMessageId = bounded(message.id, MAX_ID);
  const fromAddress = normalizeEmailAddress(bounded(message.from, 320) ?? "");
  const toAddress = normalizeEmailAddress(bounded(message.to, 320) ?? "");
  const subject = typeof message.subject === "string" && message.subject.length <= MAX_SUBJECT
    ? message.subject.trim()
    : null;
  const body = bounded(message.body, MAX_BODY);
  const timestamp = bounded(message.timestamp, 100);

  if (!providerMailboxId || !providerThreadId || !providerMessageId) {
    return { ok: false, reason: "mailbox, thread, and message ids are required" };
  }
  if (!fromAddress || !toAddress) return { ok: false, reason: "valid email addresses are required" };
  if (subject === null || !body) return { ok: false, reason: "bounded subject and body are required" };
  if (!timestamp) return { ok: false, reason: "an offset-bearing event timestamp is required" };

  let eventAt: Date;
  try {
    eventAt = instantFromProvider({ value: timestamp });
  } catch {
    return { ok: false, reason: "an offset-bearing event timestamp is required" };
  }

  return {
    ok: true,
    value: {
      providerMailboxId,
      providerThreadId,
      providerMessageId,
      fromAddress,
      toAddress,
      subject,
      body,
      eventAt,
    },
  };
}

async function applyEmailEvent(scope: Scope, envelope: EmailEnvelope): Promise<ApplyResult> {
  const result = await scope.email.applyMessage({
    providerMailboxId: envelope.providerMailboxId,
    providerThreadId: envelope.providerThreadId,
    providerMessageId: envelope.providerMessageId,
    direction: "inbound",
    fromAddress: envelope.fromAddress,
    toAddress: envelope.toAddress,
    subject: envelope.subject,
    body: envelope.body,
    eventAt: envelope.eventAt,
  });
  return result.ok
    ? { ok: true, detail: result.createdThread ? "email thread created" : "email reply recorded", operationId: null }
    : { ok: false, detail: result.reason };
}

export const emailInboundProvider: InboundProvider<EmailEnvelope> = {
  source: "gmail",
  verify(request: InboundRequest) {
    const valid =
      serverEnv.emailProviderMode === "simulated" &&
      request.headers.get(SIMULATOR_HEADER) === SIMULATOR_VALUE;
    return valid ? { valid: true } : { valid: false, reason: "email ingestion is unavailable" };
  },
  parse: (request) => parseEmailEnvelope(request.rawBody),
  async resolveTenant(envelope) {
    const mapping = await resolveWorkspaceFromMailbox(envelope.providerMailboxId);
    return mapping
      ? { ok: true, workspaceId: mapping.workspaceId }
      : { ok: false, reason: "unknown mailbox" };
  },
  identity(envelope) {
    return {
      externalEventId: envelope.providerMessageId,
      eventType: "message.received",
      schemaVersion: 1,
    };
  },
  apply: applyEmailEvent,
  audit: { accepted: "email.event_received", rejected: "email.event_rejected" },
};

/** Local-only entry point. No public route is added by this foundation. */
export function ingestSimulatedEmail(rawBody: string, now?: Date): Promise<IngestionOutcome> {
  const headers = new Headers({ [SIMULATOR_HEADER]: SIMULATOR_VALUE });
  return ingestInboundEvent(emailInboundProvider, { url: "", headers, rawBody, now });
}
