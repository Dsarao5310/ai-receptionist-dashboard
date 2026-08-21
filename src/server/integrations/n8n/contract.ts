import type { WorkflowOperation } from "@/types";

/**
 * The wire contract between this application and its workflow engine.
 *
 * ── Versioned from the first line ───────────────────────────────────────────
 * `schemaVersion` is present before anything depends on it, because the moment
 * a workflow is live on the other side, an unversioned payload can only be
 * changed by breaking it. Adding a version later means guessing what the sender
 * meant by its absence; having one from the start means the receiver can accept
 * two shapes during a migration and say so explicitly.
 *
 * ── TypeScript stops at the socket ──────────────────────────────────────────
 * The types below describe what *should* arrive. Everything that actually
 * arrives goes through the validators at the bottom of this file, because a
 * declared type is a compile-time claim about our own code and says nothing
 * whatsoever about the bytes on the wire. `as InboundEvent` on a parsed JSON
 * body would be a lie the compiler happily accepts.
 *
 * This module is deliberately free of server-only imports: the contract is
 * shared vocabulary, and the tests exercise the validators directly.
 */

export const INTEGRATION_SCHEMA_VERSION = 1;

/** Versions this build will still accept from a sender. */
export const SUPPORTED_SCHEMA_VERSIONS = [1];

// ── Outbound: what we send n8n ──────────────────────────────────────────────

/**
 * The envelope every outbound operation is wrapped in.
 *
 * `workspaceId` is present because the workflow needs to know which business it
 * is acting for — but note the asymmetry with the inbound direction: here it is
 * a value *we* determined from an authorized session, and there it is a claim
 * we refuse to trust. The same field is authoritative in one direction and
 * inadmissible in the other, which is exactly right.
 */
export interface OutboundEnvelope {
  schemaVersion: number;
  /** Our id for this logical operation. Echoed back for correlation. */
  operationId: string;
  operation: WorkflowOperation;
  /** Stable across retries of the same logical request. */
  idempotencyKey: string;
  workspaceId: string;
  /** Server time. The workflow does not get to tell us what "now" is. */
  issuedAt: string;
  data: Record<string, unknown>;
}

/** What a workflow is expected to answer with. Validated, not assumed. */
export interface OutboundResult {
  status: "succeeded" | "failed";
  /** n8n's execution identifier, for admin correlation. Optional. */
  executionRef?: string;
  /** Present when the workflow refused. Safe text only. */
  reason?: string;
}

// ── Inbound: what n8n sends us ──────────────────────────────────────────────

export const INBOUND_EVENT_TYPES = [
  "appointment.booked",
  "appointment.cancelled",
  "workflow.execution",
  // Calendar: a change someone made in Google rather than in this dashboard.
  "calendar.event_moved",
  "calendar.event_deleted",
] as const;

export type InboundEventType = (typeof INBOUND_EVENT_TYPES)[number];

export interface InboundEnvelope {
  schemaVersion: number;
  /** The sender's id for this delivery. Used for deduplication only. */
  eventId: string;
  eventType: InboundEventType;
  /**
   * The workflow that produced this event. This is what the workspace is
   * resolved from — a trusted mapping we issued, not a tenant id the sender
   * chose. See `resolveWorkspaceFromWorkflowRef`.
   */
  workflowRef: string;
  /** n8n's execution id. Admin correlation only. */
  executionRef?: string;
  /** When the sender says it happened. Normalized through the time boundary. */
  occurredAt: string;
  data: Record<string, unknown>;
}

/** `appointment.booked` — the receptionist booked something on a call. */
export interface BookedEventData {
  customer: { name: string; phone: string; email: string };
  serviceId: string | null;
  /** Business wall clock: "the 18th at 10:00, in this business's timezone". */
  date: string;
  time: string;
  notes: string;
  source: "voice" | "sms" | "email" | "manual";
}

/** `appointment.cancelled` — an appointment we already know about. */
export interface CancelledEventData {
  appointmentId: string;
  reason: string;
}

/** `workflow.execution` — a workflow reporting on itself. No business effect. */
export interface ExecutionEventData {
  outcome: "succeeded" | "failed";
  /** Our operation id, when the run was one we initiated. */
  operationId?: string;
  detail?: string;
}

/**
 * `calendar.event_moved` / `calendar.event_deleted` — somebody edited the
 * calendar directly.
 *
 * The event is identified by the provider's own event id, which we stored when
 * we created it. Matching on a customer's name or a service title would be
 * guesswork that goes wrong the first time two people share a name.
 *
 * `startsAt` is an instant with an offset, deliberately: a bare wall clock from
 * a calendar whose timezone may differ from the business's is exactly the value
 * that silently lands an appointment in the wrong hour.
 */
export interface CalendarChangeEventData {
  externalEventId: string;
  /** Present for a move; absent for a deletion. */
  startsAt?: string;
  endsAt?: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): ParseResult<T> {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A bounded string.
 *
 * Length limits are validation, not tidiness: without one, a field that ends up
 * in a text column accepts a megabyte, and a field that ends up in a log line
 * accepts a megabyte of someone else's choosing.
 */
function stringField(source: Record<string, unknown>, key: string, max: number): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optionalString(source: Record<string, unknown>, key: string, max: number): string | undefined | null {
  if (source[key] === undefined || source[key] === null) return undefined;
  return stringField(source, key, max);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^([01]\d|2[0-3]):[0-5]\d$/;
/** ISO 8601 carrying an offset. Offsetless timestamps are rejected outright. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The envelope, before anything is done with it.
 *
 * Ordered so that the cheapest and most decisive checks run first. Nothing here
 * touches the database, so a malformed or unsupported payload is refused before
 * it can cost a query.
 */
export function parseInboundEnvelope(raw: unknown): ParseResult<InboundEnvelope> {
  if (!isObject(raw)) return fail("payload must be a JSON object");

  const schemaVersion = raw.schemaVersion;
  if (typeof schemaVersion !== "number" || !SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    return fail(`unsupported schemaVersion (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")})`);
  }

  const eventId = stringField(raw, "eventId", 200);
  if (!eventId) return fail("eventId is required");

  const eventType = raw.eventType;
  if (typeof eventType !== "string" || !INBOUND_EVENT_TYPES.includes(eventType as InboundEventType)) {
    return fail("unknown eventType");
  }

  const workflowRef = stringField(raw, "workflowRef", 200);
  if (!workflowRef) return fail("workflowRef is required");

  const occurredAt = stringField(raw, "occurredAt", 40);
  if (!occurredAt || !INSTANT.test(occurredAt)) {
    // An offsetless timestamp is not a moment, it is a reading on an unnamed
    // clock. Accepting one would mean silently adopting the server's zone —
    // the exact leak the provider-time boundary exists to prevent.
    return fail("occurredAt must be an ISO 8601 instant with a UTC offset");
  }
  if (Number.isNaN(new Date(occurredAt).getTime())) return fail("occurredAt is not a valid instant");

  const executionRef = optionalString(raw, "executionRef", 200);
  if (executionRef === null) return fail("executionRef must be a string");

  if (raw.data !== undefined && !isObject(raw.data)) return fail("data must be an object");

  return {
    ok: true,
    value: {
      schemaVersion,
      eventId,
      eventType: eventType as InboundEventType,
      workflowRef,
      executionRef,
      occurredAt,
      data: isObject(raw.data) ? raw.data : {},
    },
  };
}

export function parseBookedEvent(data: Record<string, unknown>): ParseResult<BookedEventData> {
  const customer = data.customer;
  if (!isObject(customer)) return fail("customer is required");

  const name = stringField(customer, "name", 200);
  if (!name) return fail("customer.name is required");

  // A booking with no way to reach the customer is not a booking. Either
  // channel satisfies it; neither is individually required.
  const phone = optionalString(customer, "phone", 40) ?? "";
  const email = optionalString(customer, "email", 200) ?? "";
  if (!phone && !email) return fail("customer needs a phone or an email");

  const date = stringField(data, "date", 10);
  if (!date || !DATE_ONLY.test(date)) return fail("date must be YYYY-MM-DD");

  const time = stringField(data, "time", 5);
  if (!time || !TIME_ONLY.test(time)) return fail("time must be HH:mm");

  const source = data.source;
  if (source !== "voice" && source !== "sms" && source !== "email" && source !== "manual") {
    return fail("source must be one of voice, sms, email, manual");
  }

  const serviceId = optionalString(data, "serviceId", 100);
  if (serviceId === null) return fail("serviceId must be a string");

  const notes = optionalString(data, "notes", 2000);
  if (notes === null) return fail("notes must be a string");

  return {
    ok: true,
    value: { customer: { name, phone, email }, serviceId: serviceId ?? null, date, time, notes: notes ?? "", source },
  };
}

export function parseCancelledEvent(data: Record<string, unknown>): ParseResult<CancelledEventData> {
  const appointmentId = stringField(data, "appointmentId", 100);
  if (!appointmentId) return fail("appointmentId is required");

  const reason = optionalString(data, "reason", 500);
  if (reason === null) return fail("reason must be a string");

  return { ok: true, value: { appointmentId, reason: reason ?? "" } };
}

export function parseCalendarChangeEvent(
  data: Record<string, unknown>,
  requireTimes: boolean
): ParseResult<CalendarChangeEventData> {
  const externalEventId = stringField(data, "externalEventId", 200);
  if (!externalEventId) return fail("externalEventId is required");

  if (!requireTimes) return { ok: true, value: { externalEventId } };

  const startsAt = stringField(data, "startsAt", 40);
  const endsAt = stringField(data, "endsAt", 40);
  if (!startsAt || !INSTANT.test(startsAt)) return fail("startsAt must be an ISO 8601 instant with a UTC offset");
  if (!endsAt || !INSTANT.test(endsAt)) return fail("endsAt must be an ISO 8601 instant with a UTC offset");

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fail("times are not valid instants");
  if (end <= start) return fail("endsAt must be after startsAt");

  return { ok: true, value: { externalEventId, startsAt, endsAt } };
}

export function parseExecutionEvent(data: Record<string, unknown>): ParseResult<ExecutionEventData> {
  const outcome = data.outcome;
  if (outcome !== "succeeded" && outcome !== "failed") return fail("outcome must be succeeded or failed");

  const operationId = optionalString(data, "operationId", 100);
  if (operationId === null) return fail("operationId must be a string");

  const detail = optionalString(data, "detail", 500);
  if (detail === null) return fail("detail must be a string");

  return { ok: true, value: { outcome, operationId, detail } };
}

/**
 * What a workflow answered, before it is believed.
 *
 * A workflow engine is not a trusted peer for *shape* just because it is a
 * trusted peer for *identity*: a node throwing an unexpected object is far more
 * likely than an attacker, and both produce the same garbage. An unparseable
 * response is treated as a failure, never as a success with missing fields —
 * "we could not tell" must never round up to "it worked".
 */
export function parseOutboundResult(raw: unknown): ParseResult<OutboundResult> {
  if (!isObject(raw)) return fail("response must be a JSON object");

  const status = raw.status;
  if (status !== "succeeded" && status !== "failed") return fail("response status must be succeeded or failed");

  const executionRef = optionalString(raw, "executionRef", 200);
  if (executionRef === null) return fail("executionRef must be a string");

  const reason = optionalString(raw, "reason", 500);
  if (reason === null) return fail("reason must be a string");

  return { ok: true, value: { status, executionRef, reason } };
}
