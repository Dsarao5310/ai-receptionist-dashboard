"use server";

import { revalidatePath } from "next/cache";
import { AuthenticationError, AuthorizationError, requirePermission, requireUser } from "@/server/auth/guards";
import { scopeFor } from "@/server/workspace-data";
import type {
  DashboardSettings,
  NotificationChannels,
  NotificationEventKey,
} from "@/server/db/repositories/settings";

/**
 * Notifications and per-user settings.
 *
 * These need only `overview.view` — the lowest permission any member holds —
 * because they are a person's own preferences and their own workspace's
 * notifications, not the business's configuration. Staff should be able to mark
 * their alerts read and choose a landing page without being able to change
 * anything about the business.
 *
 * They are still fully authorized: the workspace comes from the verified
 * session, and the user id comes from the session too. There is no parameter
 * through which someone could write another person's preferences.
 */

export type SettingsResult = { ok: true } | { ok: false; error: string };

function toFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return { ok: false, error: error.publicMessage };
  }
  throw error;
}

export async function markNotificationReadAction(id: string): Promise<SettingsResult> {
  try {
    const context = await requirePermission("overview.view");
    await scopeFor(context).notifications.markRead(id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function markAllNotificationsReadAction(): Promise<SettingsResult> {
  try {
    const context = await requirePermission("overview.view");
    await scopeFor(context).notifications.markAllRead();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateDashboardSettingsAction(
  patch: Partial<DashboardSettings>
): Promise<SettingsResult> {
  try {
    const context = await requirePermission("overview.view");
    await scopeFor(context).settings.updateDashboard(context.user.id, patch);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateNotificationPreferenceAction(
  key: NotificationEventKey,
  channel: keyof NotificationChannels,
  value: boolean
): Promise<SettingsResult> {
  try {
    const context = await requirePermission("overview.view");
    await scopeFor(context).settings.setNotification(context.user.id, key, channel, value);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * A person's own name and job title.
 *
 * Not workspace-scoped: this is the account, and it follows them into every
 * workspace they belong to. `requireUser` rather than `requirePermission` for
 * the same reason — no workspace membership is involved in editing your own
 * name.
 *
 * The email address is deliberately not editable here. It is the identity the
 * session is resolved from, so changing it is an account-recovery flow with
 * verification, not a text field.
 */
export async function updateAccountAction(patch: {
  name?: string;
  jobTitle?: string;
}): Promise<SettingsResult> {
  try {
    const user = await requireUser();
    const { getDb } = await import("@/server/db/client");
    const sql = getDb();

    const columns: Record<string, string> = {};
    if (patch.name !== undefined && patch.name.trim()) columns.name = patch.name.trim();
    if (patch.jobTitle !== undefined) columns.job_title = patch.jobTitle;
    if (Object.keys(columns).length === 0) return { ok: true };

    await sql`update users set ${sql(columns)} where id = ${user.id}`;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
