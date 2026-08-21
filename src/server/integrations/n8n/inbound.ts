import "server-only";

import type { AppConfiguration } from "@/types";
import { getDb, type Sql } from "@/server/db/client";
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
import { businessWallClock, instantFromProvider } from "@/services/adapters/provider-time";
import { checkBusinessTime, checkTemporal } from "@/services/scheduling";
import {
  parseBookedEvent,
  parseCalendarChangeEvent,
  parseCancelledEvent,
  parseExecutionEvent,
  parseInboundEnvelope,
  type InboundEnvelope,
} from "./contract";
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./signing";

/**
 * Events arriving from the workflow engine.
 *
 * ── What lives here now, and what moved ─────────────────────────────────────
 * The gate *sequence* — signature, schema, tenant, idempotency, transaction —
 * is identical for every provider and now lives in
 * `integrations/inbound/pipeline.ts`, along with the receipt, the transaction
 * boundary and the audit writes. What remains here is the part that is
 * genuinely n8n's: how its requests are signed, what its envelope looks like,
 * how a workflow reference identifies a tenant, and what each of its event
 * types means to this domain.
 *
 * That split is the point. A second inbound provider supplies the same four
 * small answers and inherits every security property this path was reviewed
 * for, rather than re-deriving them.
 *
 * ── Why the payload's tenant claim is inadmissible ──────────────────────────
 * A signed request proves only that the sender holds the shared secret. It says
 * nothing about which business the event is for. If the body's `workspaceId`
 * decided, then anyone or anything holding that one secret — a compromised
 * workflow, a copy-pasted node, a bug in a template — could write into every
 * tenant on the platform by changing a string. So the workspace is resolved
 * from `workflowRef` through `workflow_mappings`, a mapping *we* issued, which
 * the database constrains to name exactly one workspace. The envelope has no
 * `workspaceId` field at all, which is the most reliable way to not read one.
 */

export type { IngestionOutcome };

export interface IngestionRequest {
  /** The exact bytes received. Signature verification is over these, not over a re-serialised object. */
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  /** Present for providers whose signature covers the URL. n8n's does not. */
  url?: string;
  now?: Date;
}

/**
 * Which workspace an inbound event belongs to.
 *
 * This is the one query in the application that is deliberately not
 * workspace-scoped, for the same reason `authorizeWorkspace` is not: it is how
 * a tenant is *established*, so it cannot presuppose one. It is narrow on
 * purpose — it reads a mapping row and returns an id, and it reads no tenant
 * data whatsoever. Everything after it goes through `workspaceScope`.
 *
 * A reference that matches nothing resolves to null, and the event is refused.
 * The database's unique index on `workflow_ref` is what guarantees a match is
 * unambiguous.
 */
async function resolveWorkspaceFromWorkflowRef(
  workflowRef: string,
  sql: Sql = getDb()
): Promise<{ workspaceId: string; mappingId: string } | null> {
  const [row] = await sql`
    select workspace_id, id from workflow_mappings where workflow_ref = ${workflowRef}`;
  return row ? { workspaceId: String(row.workspace_id), mappingId: String(row.id) } : null;
}

/**
 * n8n's four provider-specific answers, behind the shared pipeline's contract.
 */
export const n8nInboundProvider: InboundProvider<InboundEnvelope> = {
  source: "n8n",

  verify(request: InboundRequest) {
    return verify({
      body: request.rawBody,
      signature: request.headers.get(SIGNATURE_HEADER),
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      secret: credentialStore.resolve("n8n", "webhook_signing_secret"),
      now: request.now,
    });
  },

  parse(request: InboundRequest) {
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(request.rawBody);
    } catch {
      return { ok: false as const, reason: "body is not valid JSON" };
    }

    const envelope = parseInboundEnvelope(parsedBody);
    return envelope.ok
      ? { ok: true as const, value: envelope.value }
      : { ok: false as const, reason: envelope.error };
  },

  async resolveTenant(envelope: InboundEnvelope): Promise<TenantResolution> {
    const resolved = await resolveWorkspaceFromWorkflowRef(envelope.workflowRef);
    return resolved
      ? { ok: true, workspaceId: resolved.workspaceId }
      : { ok: false, reason: "unrecognised workflow reference" };
  },

  identity(envelope: InboundEnvelope): EventIdentity {
    return {
      externalEventId: envelope.eventId,
      eventType: envelope.eventType,
      schemaVersion: envelope.schemaVersion,
    };
  },

  apply(scope: Scope, envelope: InboundEnvelope, now: Date) {
    return applyEvent(scope, envelope, now);
  },

  audit: { accepted: "workflow.event_received", rejected: "workflow.event_rejected" },
};

export async function ingestEvent(request: IngestionRequest): Promise<IngestionOutcome> {
  // The signature and timestamp arrive as headers on the real route; the shared
  // pipeline carries headers rather than named fields because the next provider
  // reads different ones. Rebuilding them here keeps this function's own
  // signature stable for its callers.
  const headers = new Headers();
  if (request.signature) headers.set(SIGNATURE_HEADER, request.signature);
  if (request.timestamp) headers.set(TIMESTAMP_HEADER, request.timestamp);

  return ingestInboundEvent(n8nInboundProvider, {
    // n8n's scheme signs `v1:{timestamp}:{body}` and never the URL, so there is
    // nothing meaningful to pass here.
    url: request.url ?? "",
    headers,
    rawBody: request.rawBody,
    now: request.now,
  });
}

// ── Event handlers ──────────────────────────────────────────────────────────

async function applyEvent(scope: Scope, envelope: InboundEnvelope, now: Date): Promise<ApplyResult> {
  switch (envelope.eventType) {
    case "appointment.booked":
      return applyBooking(scope, envelope, now);
    case "appointment.cancelled":
      return applyCancellation(scope, envelope, now);
    case "workflow.execution":
      return applyExecutionReport(scope, envelope, now);
    case "calendar.event_moved":
      return applyExternalMove(scope, envelope, now);
    case "calendar.event_deleted":
      return applyExternalDelete(scope, envelope, now);
  }
}

/**
 * Somebody dragged one of our appointments in Google.
 *
 * ── Why this is not simply "apply the new time" ─────────────────────────────
 * Google will accept 3am on a Sunday. The business will not. An external system
 * has no idea what a business's opening hours are, so accepting whatever it
 * says would let a stray drag put a customer's haircut outside every rule the
 * product enforces on its own reschedule path.
 *
 * So the same validation runs, and the outcome splits:
 *
 *   • valid   → we adopt it. Someone moved the appointment and meant to.
 *   • invalid → the appointment is flagged `external_change_detected` with the
 *               reason. We do not adopt it, and we do not quietly shove our own
 *               time back over theirs either — both systems keep saying what
 *               they say until a person decides.
 *
 * Silently "fixing" it in either direction is how one of the two records
 * becomes wrong without anybody noticing.
 */
async function applyExternalMove(scope: Scope, envelope: InboundEnvelope, now: Date): Promise<ApplyResult> {
  const parsed = parseCalendarChangeEvent(envelope.data, true);
  if (!parsed.ok) return { ok: false, detail: parsed.error };

  // Scoped by workspace: an event id from another tenant's calendar resolves to
  // nothing here, however genuine the signature on the delivery.
  const appointment = await scope.appointments.findByProviderEvent(parsed.value.externalEventId);
  if (!appointment) return { ok: false, detail: "no appointment maps to that calendar event" };

  const configuration = await scope.configuration.load();
  if (!configuration) return { ok: false, detail: "workspace has no business profile" };

  // The provider's instant, projected onto the business's calendar. Not the
  // calendar's zone, and certainly not the server's.
  const instant = instantFromProvider({ value: parsed.value.startsAt! });
  const wall = businessWallClock(instant, configuration.business.timezone);

  if (wall.date === appointment.date && wall.time === appointment.time) {
    await scope.appointments.setSyncState(appointment.id, "synced", null, now);
    return { ok: true, detail: "Calendar already matched this appointment.", operationId: null };
  }

  const temporal = checkTemporal(configuration, wall.date, wall.time, now);
  const businessTime = checkBusinessTime(configuration, wall.date, wall.time, appointment.service.durationMin);
  const rejection = !temporal.valid ? temporal : !businessTime.valid ? businessTime : null;

  if (rejection) {
    await scope.appointments.setSyncState(
      appointment.id,
      "external_change_detected",
      `The calendar has this at ${wall.date} ${wall.time}, which is not a valid booking time: ${rejection.message}`,
      now
    );
    return {
      ok: true,
      detail: `Appointment ${appointment.id} flagged: external time is not valid for this business.`,
      operationId: null,
    };
  }

  await scope.appointments.reschedule(appointment.id, wall.date, wall.time, configuration.business.timezone);
  await scope.appointments.setSyncState(appointment.id, "synced", null, now);

  await scope.activity.record({
    type: "appointment_rescheduled",
    occurredAt: instantFromProvider({ value: envelope.occurredAt }),
    customerId: appointment.customerId,
    channel: "voice",
    summary: `${appointment.service.name} moved to ${wall.date} ${wall.time}`,
    detail: "Changed directly in the connected calendar.",
    appointmentId: appointment.id,
  });

  return { ok: true, detail: `Appointment ${appointment.id} moved to ${wall.date} ${wall.time}.`, operationId: null };
}

/**
 * Somebody deleted one of our appointments in Google.
 *
 * The appointment is **not** deleted, and it is not marked cancelled either.
 * Deleting a calendar entry is not the same statement as "this customer is no
 * longer coming" — people tidy calendars, remove duplicates, and delete things
 * by accident. Erasing a business's booking on that basis would destroy history
 * on the strength of a gesture in another application.
 *
 * So the disagreement is recorded and surfaced. A person decides whether the
 * booking still stands, and either outcome is then an ordinary, audited action.
 */
async function applyExternalDelete(scope: Scope, envelope: InboundEnvelope, now: Date): Promise<ApplyResult> {
  const parsed = parseCalendarChangeEvent(envelope.data, false);
  if (!parsed.ok) return { ok: false, detail: parsed.error };

  const appointment = await scope.appointments.findByProviderEvent(parsed.value.externalEventId);
  if (!appointment) return { ok: false, detail: "no appointment maps to that calendar event" };

  // Already cancelled here: the two systems agree after all, and this is just
  // the calendar catching up with a cancellation we made.
  if (appointment.status === "cancelled") {
    await scope.appointments.setSyncState(appointment.id, "synced", null, now);
    return { ok: true, detail: "Calendar entry removed for an already-cancelled appointment.", operationId: null };
  }

  await scope.appointments.setSyncState(
    appointment.id,
    "external_change_detected",
    "The calendar entry was deleted. Confirm whether this booking still stands.",
    now
  );

  return {
    ok: true,
    detail: `Appointment ${appointment.id} flagged: its calendar entry was deleted externally.`,
    operationId: null,
  };
}

/**
 * A booking the receptionist took.
 *
 * Every rule the dashboard's own booking path obeys applies here too, and for
 * the same reason: the workflow engine is a trusted *sender*, not a trusted
 * *authority*. It does not get to book a business's Sunday when the business is
 * closed on Sundays, and it does not get to book yesterday.
 */
async function applyBooking(scope: Scope, envelope: InboundEnvelope, now: Date): Promise<ApplyResult> {
  const parsed = parseBookedEvent(envelope.data);
  if (!parsed.ok) return { ok: false, detail: parsed.error };

  const configuration = await scope.configuration.load();
  if (!configuration) return { ok: false, detail: "workspace has no business profile" };

  const service = resolveService(configuration, parsed.value.serviceId);
  if (!service) return { ok: false, detail: "unknown service" };

  // Trusted clock, not the sender's. `occurredAt` says when the caller rang
  // off; it has no bearing on whether the slot they were given is still ahead
  // of us, and a sender that could move "now" could book into the past.
  const temporal = checkTemporal(configuration, parsed.value.date, parsed.value.time, now);
  if (!temporal.valid) {
    // The shared rule, reported in this path's own words. `checkTemporal` is
    // written for the reschedule drawer and says "cannot be rescheduled",
    // which is simply wrong on a receipt for a new booking.
    return { ok: false, detail: "The requested time has already passed." };
  }

  const businessTime = checkBusinessTime(configuration, parsed.value.date, parsed.value.time, service.durationMin);
  if (!businessTime.valid) return { ok: false, detail: businessTime.message };

  const existing = await scope.customers.findByContact({
    phone: parsed.value.customer.phone,
    email: parsed.value.customer.email,
  });
  const customerId =
    existing?.id ??
    (await scope.customers.create({
      name: parsed.value.customer.name,
      phone: parsed.value.customer.phone,
      email: parsed.value.customer.email,
      createdAt: now,
    }));

  const appointmentId = await scope.appointments.create({
    customerId,
    serviceId: service.id,
    // The snapshot is taken now, from the catalogue as it stands now. That is
    // what makes it history: later edits to the service leave it untouched.
    service: {
      name: service.name,
      priceModel: service.priceModel,
      price: service.price,
      durationMin: service.durationMin,
    },
    date: parsed.value.date,
    time: parsed.value.time,
    status: "confirmed",
    source: parsed.value.source,
    notes: parsed.value.notes,
    timezone: configuration.business.timezone,
    // The sender's timestamp, normalized through the provider-time boundary
    // rather than parsed here. An offsetless value was already refused by the
    // envelope validator; this converts what remains to a canonical instant.
    createdAt: instantFromProvider({ value: envelope.occurredAt }),
  });

  await scope.activity.record({
    type: "appointment_booked",
    occurredAt: instantFromProvider({ value: envelope.occurredAt }),
    customerId,
    channel: channelFor(parsed.value.source),
    summary: `${service.name} booked for ${parsed.value.customer.name}`,
    detail: `Booked by the receptionist for ${parsed.value.date} at ${parsed.value.time}.`,
    appointmentId,
  });

  return { ok: true, detail: `Appointment ${appointmentId} booked.`, operationId: null };
}

async function applyCancellation(scope: Scope, envelope: InboundEnvelope, now: Date): Promise<ApplyResult> {
  const parsed = parseCancelledEvent(envelope.data);
  if (!parsed.ok) return { ok: false, detail: parsed.error };

  // Scoped lookup. An appointment id belonging to another workspace resolves to
  // nothing here, exactly as it would for a signed-in user with the wrong
  // tenant — the repository never looked outside this workspace.
  const appointment = await scope.appointments.findById(parsed.value.appointmentId);
  if (!appointment) return { ok: false, detail: "unknown appointment" };

  if (appointment.status === "cancelled") {
    // Already in the requested state. Reporting this as accepted rather than
    // rejected keeps a redelivered cancellation from looking like a fault.
    return { ok: true, detail: "Appointment was already cancelled.", operationId: null };
  }

  await scope.appointments.setStatus(parsed.value.appointmentId, "cancelled");

  await scope.activity.record({
    type: "appointment_cancelled",
    occurredAt: instantFromProvider({ value: envelope.occurredAt }),
    customerId: appointment.customerId,
    channel: "voice",
    summary: `${appointment.service.name} cancelled`,
    detail: parsed.value.reason || "Cancelled by the receptionist.",
    appointmentId: appointment.id,
  });

  void now;
  return { ok: true, detail: `Appointment ${appointment.id} cancelled.`, operationId: null };
}

/**
 * A workflow reporting on a run.
 *
 * No business effect — this only updates health counters and, when the run was
 * one we initiated, correlates back to the operation. The correlation is
 * verified rather than trusted: the operation is looked up *within the resolved
 * workspace*, so an event from Workspace A naming an operation of Workspace B
 * simply finds nothing.
 */
async function applyExecutionReport(scope: Scope, envelope: InboundEnvelope, now: Date): Promise<ApplyResult> {
  const parsed = parseExecutionEvent(envelope.data);
  if (!parsed.ok) return { ok: false, detail: parsed.error };

  let operationId: string | null = null;
  if (parsed.value.operationId) {
    const operation = await scope.orchestration.findById(parsed.value.operationId);
    if (!operation) return { ok: false, detail: "unknown operation" };
    operationId = operation.id;
  }

  const workflow = (await scope.integrations.listWorkflows()).find(
    (w) => w.workflowRef === envelope.workflowRef
  );
  if (workflow) {
    await scope.integrations.recordWorkflowExecution(workflow.id, {
      at: now,
      succeeded: parsed.value.outcome === "succeeded",
    });
  }

  return {
    ok: true,
    detail: `Execution reported ${parsed.value.outcome}.`,
    operationId,
  };
}

/**
 * Which service a booking is for.
 *
 * A null `serviceId` means the receptionist did not identify one, which is a
 * normal outcome on a voice call. It falls back to the first active service
 * rather than refusing the booking outright — losing a real customer's
 * appointment over a missing identifier would be the worse failure.
 */
/**
 * Which conversation channel a booking source corresponds to.
 *
 * `manual` — someone entering a booking themselves — has no channel of its own,
 * and is recorded against voice rather than inventing a fourth one. The domain
 * has three channels because the receptionist has three; widening that enum to
 * accommodate one activity row would spread through every filter and chart that
 * groups by channel.
 */
function channelFor(source: "voice" | "sms" | "email" | "manual"): "voice" | "sms" | "email" {
  return source === "manual" ? "voice" : source;
}

function resolveService(configuration: AppConfiguration, serviceId: string | null) {
  if (serviceId) return configuration.services.find((s) => s.id === serviceId && s.active) ?? null;
  return configuration.services.find((s) => s.active) ?? null;
}

export { SIGNATURE_HEADER, TIMESTAMP_HEADER };
