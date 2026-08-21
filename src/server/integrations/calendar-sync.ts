import "server-only";

import type { AppConfiguration, Appointment, NormalizedError } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { recordAuditEvent } from "@/server/audit";
import { workspaceScope } from "@/server/db/workspace-scope";
import { LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS, type ExecutorResult } from "./n8n/operations";
import { commitWithSyncGuard } from "./sync-guard";
import {
  cancelAppointmentEvent,
  createAppointmentEvent,
  rescheduleAppointmentEvent,
} from "./google-calendar/operations";
import { resolveConnection } from "./google-calendar/connection";

/**
 * The calendar, as an executor for the orchestration spine.
 *
 * ── How the two integrations fit together ───────────────────────────────────
 * n8n is the orchestrator; Google Calendar is a system that gets acted on. A
 * deployment can put the calendar call inside an n8n workflow (the workflow
 * holds the Google credential) or perform it here (this application holds it).
 * Both are real deployments and both are supported — what must *not* differ
 * between them is the idempotency, the state machine, the audit trail or the
 * reconciliation queue.
 *
 * So this module supplies executors to `runWorkflowOperation`, which uses one
 * only when no workflow is mapped. Whichever path runs, the operation row, the
 * key, the states and the events are identical, and an operator investigating a
 * failure reads them in one place.
 *
 * ── What each executor is responsible for ───────────────────────────────────
 * The external effect and the mapping it produces — nothing else. The caller
 * still owns the durable business change, because only the caller knows whether
 * its own transaction committed. That separation is what makes `sync_required`
 * expressible at all.
 */

export interface CalendarExecutorInput {
  appointment: Appointment;
  configuration: AppConfiguration;
}

/** Whether this workspace has a calendar worth talking to. */
export async function calendarConnected(context: AuthContext): Promise<boolean> {
  return (await resolveConnection(context)).connected;
}

/**
 * The `ExecutorResult` an executor returns once `commitWithSyncGuard` has
 * already handled its own local write failing after a real external success.
 * `commitWithSyncGuard` itself only returns a user-facing string; this wraps
 * it back into the `NormalizedError` shape `ExecutorResult` needs, carrying
 * the code `runWorkflowOperation` uses to avoid settling the operation twice.
 */
function localWriteFailedResult(now: Date): { ok: false; error: NormalizedError } {
  return {
    ok: false,
    error: {
      code: LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS,
      category: "unknown",
      severity: "critical",
      message: "That change was made but could not be saved. Support has been notified.",
      provider: "google_calendar",
      timestamp: now.toISOString(),
      retryable: false,
    },
  };
}

/**
 * Move the appointment's event, then record the mapping.
 *
 * The mapping write happens here rather than in the caller because it belongs to
 * the *external* half of the operation: if the calendar moved but this write
 * failed, the operation is genuinely out of step and the spine records it.
 */
export function rescheduleExecutor(
  context: AuthContext,
  input: CalendarExecutorInput & { date: string; time: string }
): (ctx: { operationId: string; now: Date }) => Promise<ExecutorResult> {
  return async ({ operationId, now }) => {
    const scope = workspaceScope(context);
    const mapping = await scope.appointments.providerMapping(input.appointment.id);

    const result = await rescheduleAppointmentEvent(context, {
      appointment: input.appointment,
      configuration: input.configuration,
      date: input.date,
      time: input.time,
      eventId: mapping.eventId,
      now,
    });

    if (!result.ok) return { ok: false, error: result.error };

    // The dangerous window, here rather than only in the caller: the
    // calendar has already moved a real event, and this is the executor's
    // own bookkeeping write for it. A failure here must not be reported as
    // a plain (retryable) failure — that would let a retry call Google
    // again for a mutation that already succeeded.
    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId: input.appointment.id,
        operationId,
        detail: `Rescheduled to ${input.date} ${input.time} on the calendar, but the mapping could not be saved.`,
        now,
      },
      () =>
        scope.appointments.setProviderMapping(input.appointment.id, {
          provider: "google_calendar",
          eventId: result.value.eventId,
          calendarId: result.value.calendarId,
          syncedAt: now,
        })
    );
    if (!committed.ok) return localWriteFailedResult(now);

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "calendar.event_rescheduled",
      targetType: "appointment",
      targetId: input.appointment.id,
      // Times and ids only. No token, no calendar payload, no customer detail
      // beyond what the appointment already records. `replacedEventId` is
      // present only when the previously-mapped event turned out to be gone
      // or a cancelled tombstone and a new event had to be created — keeping
      // its id here is the safe trail back to that old external event.
      metadata: {
        to: `${input.date} ${input.time}`,
        ...(result.value.replacedEventId ? { replacedEventId: result.value.replacedEventId } : {}),
      },
    });

    return { ok: true, reference: result.value.eventId };
  };
}

export function cancelExecutor(
  context: AuthContext,
  input: CalendarExecutorInput
): (ctx: { operationId: string; now: Date }) => Promise<ExecutorResult> {
  return async ({ operationId, now }) => {
    const scope = workspaceScope(context);
    const mapping = await scope.appointments.providerMapping(input.appointment.id);

    const result = await cancelAppointmentEvent(context, {
      appointment: input.appointment,
      configuration: input.configuration,
      eventId: mapping.eventId,
      now,
    });

    if (!result.ok) return { ok: false, error: result.error };

    // The mapping is deliberately kept. The appointment is cancelled, not
    // deleted, and knowing which calendar entry it corresponded to is what
    // makes a later reconciliation possible.
    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId: input.appointment.id,
        operationId,
        detail: "Cancelled on the calendar, but that could not be saved locally.",
        now,
      },
      () => scope.appointments.setSyncState(input.appointment.id, "synced", null, now)
    );
    if (!committed.ok) return localWriteFailedResult(now);

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "calendar.event_cancelled",
      targetType: "appointment",
      targetId: input.appointment.id,
    });

    return { ok: true, reference: mapping.eventId };
  };
}

export function createExecutor(
  context: AuthContext,
  input: CalendarExecutorInput
): (ctx: { operationId: string; now: Date }) => Promise<ExecutorResult> {
  return async ({ operationId, now }) => {
    const scope = workspaceScope(context);

    const result = await createAppointmentEvent(context, {
      appointment: input.appointment,
      configuration: input.configuration,
      now,
    });

    if (!result.ok) return { ok: false, error: result.error };

    // The riskiest of the three: with no prior mapping, a retry after this
    // write fails would call `createAppointmentEvent` again — a second real
    // event — unless the operation is settled as `sync_required`, which
    // refuses a retry under the same idempotency key outright.
    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId: input.appointment.id,
        operationId,
        detail: "Created on the calendar, but the mapping could not be saved.",
        now,
      },
      () =>
        scope.appointments.setProviderMapping(input.appointment.id, {
          provider: "google_calendar",
          eventId: result.value.eventId,
          calendarId: result.value.calendarId,
          syncedAt: now,
        })
    );
    if (!committed.ok) return localWriteFailedResult(now);

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "calendar.event_created",
      targetType: "appointment",
      targetId: input.appointment.id,
    });

    return { ok: true, reference: result.value.eventId };
  };
}

/**
 * The partial-failure guard now lives in `../sync-guard`.
 *
 * It moved when Twilio needed it for exactly the same reason the calendar did:
 * a rule that applies to every provider should not be imported from one
 * provider's module. Re-exported here so existing call sites and tests keep
 * naming it where they always have.
 */
export { commitWithSyncGuard, markAppointmentOutOfSync } from "./sync-guard";
