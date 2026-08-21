import "server-only";

import type { AuthContext } from "@/server/auth/policy";
import { workspaceScope } from "@/server/db/workspace-scope";
import { markSyncRequired } from "./n8n/operations";

/**
 * Commit a durable change that an external system has already made.
 *
 * ── Why this is a function and not four lines at each call site ─────────────
 * This is the single most dangerous branch in the product: a real message has
 * gone to a real phone, or a real appointment has moved in a real diary, and
 * our own write is about to fail. Getting it wrong means either an invisible
 * inconsistency or a user told "that failed" about something that definitely
 * happened.
 *
 * It began inside the calendar's server action, which made it effectively
 * untestable — an action needs a session, and a test cannot easily produce one.
 * Extracted, it can be driven directly with a database guaranteed to reject the
 * write, which is the only way to know the branch works.
 *
 * It now lives here rather than in `calendar-sync.ts` because Twilio needs it
 * for exactly the same reason the calendar did, and a rule that applies to
 * every provider should not be imported from one provider's module.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 * It does not retry the external mutation. That already happened; repeating it
 * is how one reschedule becomes two, or one text message becomes three. It
 * records the disagreement where an operator will look and hands back a message
 * that admits what occurred.
 */
export async function commitWithSyncGuard<T>(
  context: AuthContext,
  input: {
    /**
     * The appointment to flag, when the operation was about one.
     *
     * Null for operations with no appointment — an outbound SMS, for instance.
     * The operation row is the authoritative record either way; this is only
     * the convenience copy that puts the problem in front of someone looking
     * at the booking rather than at an operation log.
     */
    appointmentId: string | null;
    /** Null when nothing external happened, in which case a failure is just a failure. */
    operationId: string | null;
    detail: string;
    now: Date;
  },
  commit: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await commit() };
  } catch (error) {
    // Nothing external happened, so there is nothing to be out of step with.
    // Let the caller's own error handling deal with it.
    if (!input.operationId) throw error;

    // The operation row first, and it is the authoritative record: it lives in
    // a different table from the write that just failed, so whatever stopped
    // that one is unlikely to stop this.
    await markSyncRequired(context, input.operationId, input.detail, input.now);

    if (input.appointmentId) {
      // Best-effort on purpose: it writes to the *same row* that just refused a
      // write, so a row-level cause (a constraint, a trigger, a lock) would
      // take this down too. Losing the convenience copy must not turn an honest
      // "it happened but we couldn't save it" into an unhandled crash, and the
      // reconciliation queue on /admin/workflows still shows the operation.
      try {
        await markAppointmentOutOfSync(context, input.appointmentId, input.detail, input.now);
      } catch {
        // Deliberately swallowed. The durable record is already written above.
      }
    }

    return {
      ok: false,
      error: "That change was made but could not be saved. Support has been notified.",
    };
  }
}

/**
 * Mark an appointment as out of step after a failed local write.
 *
 * Called when the external system succeeded and the database did not — the case
 * `sync_required` exists for. It records the disagreement on the appointment
 * itself so the reconciliation view can find it, in addition to the operation
 * row the spine marks.
 */
export async function markAppointmentOutOfSync(
  context: AuthContext,
  appointmentId: string,
  detail: string,
  now: Date
): Promise<void> {
  await workspaceScope(context).appointments.setSyncState(appointmentId, "sync_required", detail, now);
}
