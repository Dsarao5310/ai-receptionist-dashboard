"use server";

import { revalidatePath } from "next/cache";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";
import { serverNow } from "@/server/clock";
import { scopeFor, getWorkspaceConfiguration } from "@/server/workspace-data";
import {
  buildCalendarConfig,
  calendarRecord,
  CONFIG_KEYS,
} from "@/server/integrations/google-calendar/connection";
import {
  getAppointmentEvent,
  listSelectableCalendars,
  rescheduleAppointmentEvent,
} from "@/server/integrations/google-calendar/operations";
import { checkRescheduleSlot } from "@/services/scheduling";
import { businessWallClock } from "@/services/adapters/provider-time";

/**
 * Calendar administration.
 *
 * ── Platform-only, every one of them ────────────────────────────────────────
 * `integrations.manage` is not grantable by any workspace role. A business
 * owner sees "Calendar — Connected" and cannot choose which calendar, cannot
 * disconnect it, and cannot reconcile it. That separation is enforced here, on
 * the server, and not by which buttons a page decides to render.
 */

export type CalendarActionResult = { ok: true } | { ok: false; error: string };

function toFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return { ok: false, error: error.publicMessage };
  }
  throw error;
}

function revalidateWorkspaceViews(): void {
  revalidatePath("/", "layout");
}

/** The calendars this workspace's connected account offers. Admin only. */
export async function listCalendarsAction(): Promise<
  { ok: true; calendars: { id: string; summary: string; timeZone: string; primary: boolean }[] } | { ok: false; error: string }
> {
  try {
    const context = await requirePermission("integrations.manage");
    const result = await listSelectableCalendars(context, serverNow());
    if (!result.ok) return { ok: false, error: result.error.message };

    return {
      ok: true,
      calendars: result.value.map((c) => ({
        id: c.id,
        summary: c.summary,
        timeZone: c.timeZone,
        primary: c.primary,
      })),
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Choose which calendar this workspace writes to.
 *
 * The submitted id is checked against the list the *connected account* actually
 * offers, rather than written through. Without that, this action would accept
 * any string and quietly point a business's bookings at a calendar belonging to
 * someone else who had shared it — the request would even succeed.
 */
export async function selectCalendarAction(calendarId: string): Promise<CalendarActionResult> {
  try {
    const context = await requirePermission("integrations.manage");
    const now = serverNow();

    const available = await listSelectableCalendars(context, now);
    if (!available.ok) return { ok: false, error: available.error.message };

    const chosen = available.value.find((c) => c.id === calendarId);
    if (!chosen) return { ok: false, error: "That calendar is not available on the connected account." };

    const record = await calendarRecord(context);
    if (!record) return { ok: false, error: "Calendar integration not found." };

    const scope = scopeFor(context);
    await scope.integrations.applyPatch(record.id, {
      connection: "connected",
      health: "healthy",
      lastCheckedAt: now.toISOString(),
      config: buildCalendarConfig({
        account: record.config.find((c) => c.key === CONFIG_KEYS.account)?.value ?? null,
        calendarId: chosen.id,
        calendarLabel: chosen.summary,
        calendarTimeZone: chosen.timeZone,
        authorized: true,
      }),
    });

    await scope.integrations.recordEvent({
      provider: "google_calendar",
      type: "config_changed",
      message: `Target calendar set to ${chosen.summary}.`,
      severity: "info",
      occurredAt: now,
    });

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "calendar.calendar_selected",
      targetType: "integration",
      targetId: "google_calendar",
      metadata: { calendar: chosen.summary, timezone: chosen.timeZone },
    });

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Reconcile one appointment against the calendar.
 *
 * ── What "reconcile" does and does not decide ───────────────────────────────
 * It reads what Google currently says, compares it with our record, and then
 * applies the product's rule rather than a generic "last write wins":
 *
 *   • **The event is gone.** Our appointment stands — a booking a customer made
 *     is not erased because someone tidied a calendar — and the appointment is
 *     marked for review so a person decides whether to restore or cancel it.
 *   • **The event moved to a time our rules allow.** We adopt it. Someone
 *     dragged the appointment in Google and meant it.
 *   • **The event moved to a time our rules forbid** — 3am, a closing day, the
 *     past. Google will happily accept that; the business cannot. We do *not*
 *     adopt it, and we do not silently push our time back over theirs either.
 *     It stays flagged, because a person needs to choose.
 *
 * That last case is the reason this is not "last write wins": the external
 * system has no idea what the business's opening hours are.
 */
export async function reconcileAppointmentAction(appointmentId: string): Promise<CalendarActionResult> {
  try {
    const context = await requirePermission("integrations.manage");
    const scope = scopeFor(context);
    const now = serverNow();

    const appointment = await scope.appointments.findById(appointmentId);
    if (!appointment) return { ok: false, error: "Appointment not found." };

    const mapping = await scope.appointments.providerMapping(appointmentId);
    if (!mapping.eventId) return { ok: false, error: "This appointment has no calendar entry." };

    const configuration = await getWorkspaceConfiguration(context);
    const remote = await getAppointmentEvent(context, { eventId: mapping.eventId, now });

    if (!remote.ok) {
      if (remote.error.code === "calendar_event_not_found") {
        await scope.appointments.setSyncState(
          appointmentId,
          "external_change_detected",
          "The calendar entry no longer exists. Cancel this appointment or push it back to the calendar.",
          now
        );
        await auditReconciliation(context, appointmentId, "event_missing");
        revalidateWorkspaceViews();
        return { ok: true };
      }
      return { ok: false, error: remote.error.message };
    }

    if (remote.value.status === "cancelled") {
      await scope.appointments.setSyncState(
        appointmentId,
        "external_change_detected",
        "The calendar entry was cancelled externally. Confirm whether this booking still stands.",
        now
      );
      await auditReconciliation(context, appointmentId, "event_cancelled_externally");
      revalidateWorkspaceViews();
      return { ok: true };
    }

    // The remote instant, expressed as the business's wall clock — the only
    // correct way to compare it with what we store.
    const businessTimeZone = configuration.business.timezone;
    const wall = businessWallClock(remote.value.start, businessTimeZone);

    if (wall.date === appointment.date && wall.time === appointment.time) {
      await scope.appointments.setSyncState(appointmentId, "synced", null, now);
      await auditReconciliation(context, appointmentId, "already_in_step");
      revalidateWorkspaceViews();
      return { ok: true };
    }

    const check = checkRescheduleSlot(configuration, appointment, wall.date, wall.time, now);
    if (!check.valid) {
      await scope.appointments.setSyncState(
        appointmentId,
        "external_change_detected",
        `The calendar has this at ${wall.date} ${wall.time}, which the business rules do not allow: ${check.message}`,
        now
      );
      await auditReconciliation(context, appointmentId, "external_time_invalid");
      revalidateWorkspaceViews();
      return { ok: true };
    }

    await scope.appointments.reschedule(appointmentId, wall.date, wall.time, businessTimeZone);
    await scope.appointments.setSyncState(appointmentId, "synced", null, now);
    await auditReconciliation(context, appointmentId, "adopted_external_time");

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Push our record back onto the calendar.
 *
 * The other half of reconciliation: when an operator decides the application is
 * right, this makes Google agree. It goes through the same domain operation any
 * reschedule uses, so the event content and timezone handling are identical.
 */
export async function pushAppointmentToCalendarAction(appointmentId: string): Promise<CalendarActionResult> {
  try {
    const context = await requirePermission("integrations.manage");
    const scope = scopeFor(context);
    const now = serverNow();

    const appointment = await scope.appointments.findById(appointmentId);
    if (!appointment) return { ok: false, error: "Appointment not found." };

    const configuration = await getWorkspaceConfiguration(context);
    const mapping = await scope.appointments.providerMapping(appointmentId);

    const result = await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: appointment.date,
      time: appointment.time,
      eventId: mapping.eventId,
      now,
    });

    if (!result.ok) return { ok: false, error: result.error.message };

    await scope.appointments.setProviderMapping(appointmentId, {
      provider: "google_calendar",
      eventId: result.value.eventId,
      calendarId: result.value.calendarId,
      syncedAt: now,
    });

    // `replacedEventId` is set when the previously-mapped event was gone or a
    // cancelled tombstone and pushing ours had to create a fresh event — the
    // old event id is kept here as the safe audit trail back to it, never in
    // provider_event_id itself, which now points only at the visible event.
    await auditReconciliation(
      context,
      appointmentId,
      result.value.replacedEventId ? "pushed_local_state_replaced_cancelled_event" : "pushed_local_state",
      result.value.replacedEventId ? { replacedEventId: result.value.replacedEventId } : undefined
    );
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

async function auditReconciliation(
  context: Awaited<ReturnType<typeof requirePermission>>,
  appointmentId: string,
  outcome: string,
  extra?: Record<string, string>
): Promise<void> {
  await recordAuditEvent({
    actorUserId: context.user.id,
    workspaceId: context.workspaceId,
    action: "calendar.reconciled",
    targetType: "appointment",
    targetId: appointmentId,
    metadata: { outcome, ...extra },
  });
}
