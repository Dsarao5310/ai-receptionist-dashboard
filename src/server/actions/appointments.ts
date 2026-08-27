"use server";

import { revalidatePath } from "next/cache";
import type { Appointment } from "@/types";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";
import { serverNow } from "@/server/clock";
import { getWorkspaceConfiguration, scopeFor } from "@/server/workspace-data";
import {
  requestAppointmentBooking,
  requestAppointmentCancellation,
  requestAppointmentReschedule,
} from "@/server/integrations/workflows";
import type { OperationDisposition } from "@/server/integrations/n8n/operations";
import { commitWithSyncGuard } from "@/server/integrations/calendar-sync";
import { checkRescheduleSlot } from "@/services/scheduling";

/**
 * Appointment mutations, decided on the server.
 *
 * Every action here follows the same five steps, in the same order:
 *
 *   1. **Who is this?** `requirePermission("appointments.manage")` resolves the
 *      user from the session cookie and their role from a membership lookup.
 *   2. **Which workspace?** The returned context carries an *authorized*
 *      workspace id. Every read and write below is scoped to it, so an id
 *      naming another tenant's appointment resolves to nothing.
 *   3. **Load the authoritative state.** The appointment, its snapshot and the
 *      workspace's own hours and timezone — never values the browser sent.
 *   4. **Validate on trusted time.** `serverNow()` takes no arguments. There is
 *      no parameter through which a client could claim an earlier "now".
 *   5. **Write, audit, revalidate.**
 *
 * The browser runs the same pure rules for instant feedback while someone
 * types. That is convenience. This is the decision.
 */

export type MutationResult = { ok: true } | { ok: false; error: string };
export type RescheduleResult = { ok: true; date: string; time: string } | { ok: false; error: string };

/** Every action funnels its failures through here, so none leaks an internal reason. */
function toFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return { ok: false, error: error.publicMessage };
  }
  throw error;
}

/**
 * The dataset feeds every page, so a change to it invalidates all of them.
 * Revalidating the root layout is what stops Overview from still showing a
 * cancelled appointment as upcoming.
 */
function revalidateWorkspaceViews(): void {
  revalidatePath("/", "layout");
}

/**
 * The workflow boundary, from the caller's side.
 *
 * Four dispositions, and the interesting thing is how differently they have to
 * be treated:
 *
 *   • `no_workflow` — nothing is mapped, so nothing external needs to agree
 *     with us. Proceed. This is the state the product shipped in before this
 *     phase, and it must stay a working state: a business does not lose the
 *     ability to reschedule because an integration nobody configured is absent.
 *   • `succeeded` — the external action happened. Commit.
 *   • `duplicate` — this exact request already succeeded. The external action
 *     happened *once*, which is the whole point; carry on and let the write be
 *     the no-op it will be.
 *   • `failed` — do not commit. Reporting success for a change the calendar
 *     refused is worse than refusing it.
 *
 * The returned operation id is what a later failure needs in order to mark
 * itself `sync_required`.
 */
type WorkflowGate =
  | { proceed: true; operationId: string | null }
  | { proceed: false; error: string };

function gate(disposition: OperationDisposition): WorkflowGate {
  switch (disposition.kind) {
    case "no_workflow":
      return { proceed: true, operationId: null };
    case "succeeded":
    case "duplicate":
      return { proceed: true, operationId: disposition.operation.id };
    case "failed":
      // The normalized `message`, never the admin detail and never the raw
      // upstream response. A business user is told what it means for them.
      return { proceed: false, error: disposition.error.message };
  }
}

export async function rescheduleAppointmentAction(input: {
  appointmentId: string;
  date: string;
  time: string;
}): Promise<RescheduleResult> {
  try {
    const context = await requirePermission("appointments.manage");
    const scope = scopeFor(context);

    const appointment = await scope.appointments.findById(input.appointmentId);
    if (!appointment) {
      // Deliberately the same answer whether the appointment belongs to another
      // tenant or does not exist. Distinguishing them would confirm a record's
      // existence to someone with no right to know.
      return { ok: false, error: "Appointment not found." };
    }

    const config = await getWorkspaceConfiguration(context);
    const now = serverNow();
    const check = checkRescheduleSlot(config, appointment, input.date, input.time, now);
    if (!check.valid) return { ok: false, error: check.message };

    // Validation first, workflow second, database third. The order matters:
    // an invalid time must never reach a workflow, and a workflow that refuses
    // must never reach the database.
    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration: config,
      date: input.date,
      time: input.time,
      now,
    });
    const gated = gate(disposition);
    if (!gated.proceed) return { ok: false, error: gated.error };

    // The dangerous window: the calendar may already have moved a real entry in
    // a real diary. Nothing here can undo that, and reporting a flat failure
    // would leave an invisible inconsistency — so the guard records it instead.
    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId: input.appointmentId,
        operationId: gated.operationId,
        detail: "The calendar was updated but this record could not be saved.",
        now,
      },
      () =>
        scope.appointments.reschedule(input.appointmentId, input.date, input.time, config.business.timezone)
    );
    if (!committed.ok) return { ok: false, error: committed.error };

    const updated = committed.value;
    if (!updated) return { ok: false, error: "Appointment not found." };

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "appointment.rescheduled",
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { from: `${appointment.date} ${appointment.time}`, to: `${input.date} ${input.time}` },
    });

    revalidateWorkspaceViews();
    return { ok: true, date: updated.date, time: updated.time };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Cancelling needs the same authority as rescheduling and is audited the same
 * way. Kept separate so the two can diverge — cancelling may later need a
 * reason, a customer notification, or a stronger permission.
 */
export async function cancelAppointmentAction(appointmentId: string): Promise<MutationResult> {
  try {
    const context = await requirePermission("appointments.manage");
    const scope = scopeFor(context);

    const appointment = await scope.appointments.findById(appointmentId);
    if (!appointment) return { ok: false, error: "Appointment not found." };

    const config = await getWorkspaceConfiguration(context);
    const now = serverNow();

    const disposition = await requestAppointmentCancellation(context, {
      appointment,
      configuration: config,
      now,
    });
    const gated = gate(disposition);
    if (!gated.proceed) return { ok: false, error: gated.error };

    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId,
        operationId: gated.operationId,
        detail: "The calendar entry was cancelled but this record could not be saved.",
        now,
      },
      () => scope.appointments.setStatus(appointmentId, "cancelled")
    );
    if (!committed.ok) return { ok: false, error: committed.error };

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "appointment.cancelled",
      targetType: "appointment",
      targetId: appointmentId,
      metadata: { was: appointment.status },
    });

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Notes carry no scheduling meaning, so no scheduling validation runs — but the
 * authorization and scoping are identical. Editing a note on another tenant's
 * appointment fails at the same place editing its time would.
 */
export async function updateAppointmentNotesAction(input: {
  appointmentId: string;
  notes: string;
}): Promise<MutationResult> {
  try {
    const context = await requirePermission("appointments.manage");
    const scope = scopeFor(context);

    const updated = await scope.appointments.setNotes(input.appointmentId, input.notes);
    if (!updated) return { ok: false, error: "Appointment not found." };

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Undo.
 *
 * The subtlety worth being explicit about: undo does not get a pass on the
 * scheduling rules, and it does not get a pass on the calendar either. Undoing
 * a *reschedule* moves the appointment back to a time, so it goes through the
 * same workflow gate as an ordinary reschedule — otherwise the dashboard would
 * revert while a live calendar stayed at the new time. Undoing a
 * *cancellation* is asking the calendar to recreate an event it was already
 * told to remove, so it goes through the booking workflow instead. A plain
 * status change with no time movement (undoing nothing calendar-shaped) skips
 * the workflow entirely, same as it always has.
 *
 * Both of those calendar-touching paths are also time moves in the sense that
 * matters here, so both get the same slot check a reschedule would: if the
 * original slot has since passed, or the business has since closed that day,
 * the undo is refused with the reason. That reads as a limitation and is
 * really the rule holding: there is no path, including this one, that puts an
 * appointment somewhere the ordinary rules would not allow.
 */
export async function restoreAppointmentAction(input: {
  appointmentId: string;
  date: string;
  time: string;
  status: Appointment["status"];
  notes: string;
}): Promise<MutationResult> {
  try {
    const context = await requirePermission("appointments.manage");
    const scope = scopeFor(context);

    const appointment = await scope.appointments.findById(input.appointmentId);
    if (!appointment) return { ok: false, error: "Appointment not found." };

    const config = await getWorkspaceConfiguration(context);
    const now = serverNow();
    const movesInTime = appointment.date !== input.date || appointment.time !== input.time;
    const uncancels = appointment.status === "cancelled" && input.status !== "cancelled";

    if (movesInTime || uncancels) {
      const check = checkRescheduleSlot(config, appointment, input.date, input.time, now);
      if (!check.valid) return { ok: false, error: check.message };
    }

    // Validation first, workflow second, database third — the same ordering
    // reschedule and cancel already follow, for the same reason.
    let gated: WorkflowGate = { proceed: true, operationId: null };
    if (uncancels) {
      const disposition = await requestAppointmentBooking(context, {
        appointment: { ...appointment, date: input.date, time: input.time },
        configuration: config,
        now,
      });
      gated = gate(disposition);
    } else if (movesInTime) {
      const disposition = await requestAppointmentReschedule(context, {
        appointment,
        configuration: config,
        date: input.date,
        time: input.time,
        now,
      });
      gated = gate(disposition);
    }
    if (!gated.proceed) return { ok: false, error: gated.error };

    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId: input.appointmentId,
        operationId: gated.operationId,
        detail: "The calendar was updated but this undo could not be saved.",
        now,
      },
      () =>
        scope.appointments.restore(
          { ...appointment, date: input.date, time: input.time, status: input.status, notes: input.notes },
          config.business.timezone
        )
    );
    if (!committed.ok) return { ok: false, error: committed.error };

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
