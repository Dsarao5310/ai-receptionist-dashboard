import "server-only";

import type { AppConfiguration, Appointment } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { instantForProvider } from "@/services/adapters/provider-time";
import { runWorkflowOperation, type OperationDisposition } from "./n8n/operations";
import { calendarConnected, cancelExecutor, rescheduleExecutor } from "./calendar-sync";

/**
 * The operations the application knows how to ask a workflow to perform.
 *
 * ── Why these functions exist at all ────────────────────────────────────────
 * The alternative — exporting something shaped like `executeWorkflow(id,
 * payload)` and letting each call site assemble its own request — puts the
 * power to run *any* automation with *any* body in the hands of every server
 * action, and eventually of anything that can reach one. Each function here is
 * a specific, named capability with a fixed payload the application controls.
 * The set of things the dashboard can cause n8n to do is exactly this file, and
 * it is short enough to read.
 *
 * ── Timestamps cross the boundary properly ──────────────────────────────────
 * Appointments are stored as a wall clock plus the business's timezone —
 * "the 18th at 10:00, wherever this business is". A workflow that goes on to
 * touch a calendar needs an unambiguous instant, so both are sent: the wall
 * clock with its zone named, *and* the resolved instant. Sending a bare
 * `2026-08-18T10:00` and leaving n8n to guess is precisely how a booking ends
 * up seven hours off.
 *
 * ── No secrets, ever ────────────────────────────────────────────────────────
 * These payloads carry business data a workflow needs to do its job. They never
 * carry a credential — the outbound request is authenticated by a signature
 * applied at the transport, not by anything in the body.
 */

export interface AppointmentWorkflowInput {
  appointment: Appointment;
  configuration: AppConfiguration;
  now: Date;
}

/**
 * Ask the mapped workflow to move an appointment.
 *
 * Called *before* the database is updated, and the caller commits only on
 * success. That ordering is the point of §15: an appointment must not read
 * "rescheduled" in the dashboard while the calendar behind it still says
 * otherwise.
 */
export async function requestAppointmentReschedule(
  context: AuthContext,
  input: AppointmentWorkflowInput & { date: string; time: string }
): Promise<OperationDisposition> {
  const { appointment, configuration, date, time, now } = input;
  const timezone = configuration.business.timezone;

  return runWorkflowOperation(context, {
    operation: "appointment.reschedule",
    // Used only when no workflow is mapped: the calendar is then reached
    // directly, under the same operation row and the same idempotency key.
    executor: (await calendarConnected(context))
      ? rescheduleExecutor(context, { appointment, configuration, date, time })
      : undefined,
    // `updatedAt` makes the key describe *this state* of the appointment. A
    // retry of the same click computes the same key and cannot double-book; a
    // genuinely new move, after the appointment has changed, computes a new one
    // and is not mistaken for a replay.
    idempotencyParts: [appointment.id, appointment.updatedAt, date, time],
    target: { type: "appointment", id: appointment.id },
    now,
    data: {
      appointmentId: appointment.id,
      timezone,
      customer: {
        name: appointment.customerName,
        phone: appointment.customerPhone,
        email: appointment.customerEmail,
      },
      // The snapshot, not the current catalogue: the workflow should act on
      // what the customer actually agreed to.
      service: { name: appointment.service.name, durationMin: appointment.service.durationMin },
      previous: {
        date: appointment.date,
        time: appointment.time,
        startsAt: instantForProvider(appointment.date, appointment.time, timezone).toISOString(),
      },
      next: {
        date,
        time,
        startsAt: instantForProvider(date, time, timezone).toISOString(),
      },
    },
  });
}

export async function requestAppointmentCancellation(
  context: AuthContext,
  input: AppointmentWorkflowInput
): Promise<OperationDisposition> {
  const { appointment, configuration, now } = input;
  const timezone = configuration.business.timezone;

  return runWorkflowOperation(context, {
    operation: "appointment.cancel",
    executor: (await calendarConnected(context))
      ? cancelExecutor(context, { appointment, configuration })
      : undefined,
    idempotencyParts: [appointment.id, appointment.updatedAt],
    target: { type: "appointment", id: appointment.id },
    now,
    data: {
      appointmentId: appointment.id,
      timezone,
      customer: {
        name: appointment.customerName,
        phone: appointment.customerPhone,
        email: appointment.customerEmail,
      },
      service: { name: appointment.service.name, durationMin: appointment.service.durationMin },
      scheduled: {
        date: appointment.date,
        time: appointment.time,
        startsAt: instantForProvider(appointment.date, appointment.time, timezone).toISOString(),
      },
    },
  });
}

/**
 * Tell the workflow engine that the business's own details changed.
 *
 * Advisory rather than authoritative: the database has already been updated by
 * the time this runs, and a workspace with nothing mapped simply has nothing to
 * tell. Hours are sent as the interval lists they are stored as — flattening
 * them to one opening and one closing time would lose every business that
 * closes for lunch.
 */
export async function syncBusinessConfiguration(
  context: AuthContext,
  input: { configuration: AppConfiguration; now: Date; revision: string }
): Promise<OperationDisposition> {
  const { configuration, now, revision } = input;

  return runWorkflowOperation(context, {
    operation: "business.sync",
    idempotencyParts: [revision],
    target: { type: "business_profile", id: context.workspaceId },
    now,
    data: {
      business: {
        name: configuration.business.name,
        phone: configuration.business.phone,
        email: configuration.business.email,
        timezone: configuration.business.timezone,
      },
      hours: configuration.hours.map((day) => ({
        day: day.day,
        isOpen: day.isOpen,
        intervals: day.intervals.map((i) => ({ open: i.open, close: i.close })),
      })),
      services: configuration.services
        .filter((s) => s.active)
        .map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin })),
    },
  });
}
