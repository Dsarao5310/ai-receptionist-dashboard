import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { instantFromProvider } from "@/services/adapters/provider-time";
import { credentialStore } from "@/server/integrations/credential-store";
import {
  ingestInboundEvent,
  type ApplyResult,
  type InboundProvider,
  type InboundRequest,
  type IngestionOutcome,
  type Parsed,
  type Scope,
} from "@/server/integrations/inbound/pipeline";
import { toE164 } from "@/server/integrations/twilio/phone-numbers";
import type {
  VapiCallUpdate,
  VapiDomainCallStatus,
  VapiTranscriptLine,
} from "@/server/db/repositories/vapi-calls";
import { resolveWorkspaceFromVapiResources } from "./tenancy";

export const AUTHORIZATION_HEADER = "authorization";
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_TRANSCRIPT_LINES = 200;
const MAX_TRANSCRIPT_LINE_LENGTH = 8_000;

type VapiStatus = "scheduled" | "queued" | "ringing" | "in-progress" | "forwarding" | "ended";

export interface VapiEnvelope {
  kind: "status-update" | "end-of-call-report";
  callId: string;
  assistantId: string | null;
  phoneNumberId: string | null;
  phoneNumber: string | null;
  customerPhone: string | null;
  eventAt: Date;
  providerStatus: VapiStatus | "end-of-call-report";
  domainStatus: VapiDomainCallStatus | null;
  startedAt: Date | null;
  endedAt: Date | null;
  endedReason: string | null;
  summary: string | null;
  transcript?: VapiTranscriptLine[];
}

type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

function boundedString(value: unknown, max = MAX_IDENTIFIER_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function instant(value: unknown): Date | null {
  const raw = boundedString(value, 100);
  if (!raw) return null;
  try {
    return instantFromProvider({ value: raw });
  } catch {
    return null;
  }
}

function bearerMatches(request: InboundRequest): boolean {
  const configured = credentialStore.resolve("vapi", "webhook_bearer_token");
  if (!configured) return false;
  const header = request.headers.get(AUTHORIZATION_HEADER);
  if (!header?.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);
  const expectedHash = createHash("sha256").update(configured.expose()).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

function transcriptLines(message: JsonObject, call: JsonObject): VapiTranscriptLine[] | undefined {
  const artifact = object(message.artifact) ?? object(call.artifact);
  if (!artifact || !Array.isArray(artifact.messages)) return undefined;
  if (artifact.messages.length > MAX_TRANSCRIPT_LINES) return undefined;

  const lines: VapiTranscriptLine[] = [];
  for (const value of artifact.messages) {
    const entry = object(value);
    if (!entry) continue;
    const role = entry.role;
    if (role !== "assistant" && role !== "user") continue;
    const body = boundedString(entry.message, MAX_TRANSCRIPT_LINE_LENGTH);
    if (!body) continue;
    const seconds = typeof entry.secondsFromStart === "number" && Number.isFinite(entry.secondsFromStart)
      ? Math.max(0, Math.floor(entry.secondsFromStart))
      : 0;
    lines.push({
      speaker: role === "assistant" ? "ai" : "customer",
      body,
      offsetLabel: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
    });
  }
  return lines;
}

function normalizeTerminal(startedAt: Date | null, endedReason: string | null): VapiDomainCallStatus {
  if (!startedAt) return "missed";
  const reason = endedReason?.toLowerCase() ?? "";
  if (/error|fail|rejected|invalid|timeout/.test(reason)) return "failed";
  if (/no[-_ ]?answer|busy|voicemail/.test(reason)) return "missed";
  return "completed";
}

export function parseVapiEnvelope(rawBody: string): Parsed<VapiEnvelope> {
  let root: JsonObject | null = null;
  try {
    root = object(JSON.parse(rawBody));
  } catch {
    return { ok: false, reason: "body is not valid JSON" };
  }

  const message = object(root?.message);
  const call = object(message?.call);
  if (!message || !call) return { ok: false, reason: "message.call is required" };

  const type = boundedString(message.type);
  if (type !== "status-update" && type !== "end-of-call-report") {
    return { ok: false, reason: "unsupported Vapi server message" };
  }

  const callId = boundedString(call.id);
  if (!callId) return { ok: false, reason: "call.id is required" };

  const startedAt = instant(message.startedAt) ?? instant(call.startedAt);
  const endedAt = instant(message.endedAt) ?? instant(call.endedAt);
  const eventAt = instant(message.timestamp) ?? instant(call.updatedAt) ?? endedAt ?? startedAt;
  if (!eventAt) return { ok: false, reason: "an offset-bearing event timestamp is required" };
  if (startedAt && endedAt && endedAt.getTime() < startedAt.getTime()) {
    return { ok: false, reason: "call ended before it started" };
  }

  const assistant = object(message.assistant);
  const phoneNumber = object(message.phoneNumber);
  const customer = object(call.customer) ?? object(message.customer);
  const analysis = object(message.analysis) ?? object(call.analysis);
  const assistantId = boundedString(call.assistantId) ?? boundedString(assistant?.id);
  const phoneNumberId = boundedString(call.phoneNumberId) ?? boundedString(phoneNumber?.id);
  const mappedPhone = toE164(boundedString(phoneNumber?.number, 40) ?? "");
  const customerPhone = toE164(boundedString(customer?.number, 40) ?? "");
  const endedReason = boundedString(message.endedReason, 200) ?? boundedString(call.endedReason, 200);
  const summary = boundedString(analysis?.summary, MAX_SUMMARY_LENGTH);

  if (!assistantId && !phoneNumberId && !mappedPhone) {
    return { ok: false, reason: "a trusted assistant or phone resource is required" };
  }

  if (type === "status-update") {
    const status = boundedString(message.status) as VapiStatus | null;
    if (!status || !["scheduled", "queued", "ringing", "in-progress", "forwarding", "ended"].includes(status)) {
      return { ok: false, reason: "unsupported Vapi call status" };
    }
    return {
      ok: true,
      value: {
        kind: type,
        callId,
        assistantId,
        phoneNumberId,
        phoneNumber: mappedPhone,
        customerPhone,
        eventAt,
        providerStatus: status,
        domainStatus: status === "in-progress"
          ? "in_progress"
          : status === "ended"
            ? normalizeTerminal(startedAt, endedReason)
            : null,
        startedAt,
        endedAt,
        endedReason,
        summary: null,
      },
    };
  }

  return {
    ok: true,
    value: {
      kind: type,
      callId,
      assistantId,
      phoneNumberId,
      phoneNumber: mappedPhone,
      customerPhone,
      eventAt,
      providerStatus: "end-of-call-report",
      domainStatus: normalizeTerminal(startedAt, endedReason),
      startedAt,
      endedAt,
      endedReason,
      summary,
      transcript: transcriptLines(message, call),
    },
  };
}

async function applyVapiEvent(scope: Scope, envelope: VapiEnvelope): Promise<ApplyResult> {
  if (!envelope.domainStatus) {
    return { ok: true, detail: `${envelope.providerStatus} acknowledged`, operationId: null };
  }

  const update: VapiCallUpdate = {
    providerCallId: envelope.callId,
    providerStatus: envelope.providerStatus,
    domainStatus: envelope.domainStatus,
    eventAt: envelope.eventAt,
    startedAt: envelope.startedAt,
    endedAt: envelope.endedAt,
    endedReason: envelope.endedReason,
    customerPhone: envelope.customerPhone,
    summary: envelope.summary,
    ...(envelope.transcript ? { transcript: envelope.transcript } : {}),
  };
  const applied = await scope.vapi.applyCallUpdate(update);

  if (applied.becameTerminal) {
    const completed = applied.status === "completed";
    await scope.activity.record({
      type: completed ? "call_completed" : "conversation_missed",
      occurredAt: envelope.endedAt ?? envelope.eventAt,
      customerId: applied.customerId,
      channel: "voice",
      summary: completed ? "AI receptionist call completed" : "AI receptionist call needs attention",
      detail: envelope.summary ?? (completed ? "Call completed." : "Call did not complete normally."),
      conversationId: applied.conversationId,
      callId: applied.callId,
    });
  }

  return {
    ok: true,
    detail: applied.changed ? `${envelope.kind} applied` : `${envelope.kind} ignored as stale`,
    operationId: null,
  };
}

export const vapiInboundProvider: InboundProvider<VapiEnvelope> = {
  source: "vapi",
  verify: (request) => bearerMatches(request)
    ? { valid: true }
    : { valid: false, reason: "invalid Vapi authorization" },
  parse: (request) => parseVapiEnvelope(request.rawBody),
  async resolveTenant(envelope) {
    const result = await resolveWorkspaceFromVapiResources({
      assistantId: envelope.assistantId,
      phoneNumberId: envelope.phoneNumberId,
      phoneNumber: envelope.phoneNumber,
    });
    return result.ok
      ? { ok: true, workspaceId: result.workspaceId }
      : { ok: false, reason: result.reason };
  },
  identity(envelope) {
    return {
      externalEventId: `${envelope.callId}:${envelope.kind}:${envelope.providerStatus}:${envelope.eventAt.toISOString()}`,
      eventType: envelope.kind,
      schemaVersion: 1,
    };
  },
  apply: applyVapiEvent,
  audit: { accepted: "vapi.event_received", rejected: "vapi.event_rejected" },
};

export function ingestVapiEvent(input: {
  rawBody: string;
  authorization: string | null;
  now?: Date;
}): Promise<IngestionOutcome> {
  const headers = new Headers();
  if (input.authorization) headers.set(AUTHORIZATION_HEADER, input.authorization);
  return ingestInboundEvent(vapiInboundProvider, {
    url: "",
    headers,
    rawBody: input.rawBody,
    now: input.now,
  });
}
