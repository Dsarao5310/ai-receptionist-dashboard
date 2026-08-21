import "server-only";

import type { DateRangeKey } from "@/types";
import { bool, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Per-user settings inside one workspace.
 *
 * Scoped to the pair rather than to the person: someone who owns one business
 * and covers shifts at another wants different alerts in each, and a single
 * global preference would be wrong for one of them.
 *
 * Appearance is deliberately not here. Theme, accent, density and sidebar state
 * are device preferences; they stay in the browser, where they can be applied
 * before the first paint without waiting on a query.
 */

export type NotificationEventKey =
  | "appointment_booked"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "integration_problem"
  | "ai_could_not_answer"
  | "high_missed_calls";

export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export interface DashboardSettings {
  landingPage: string;
  defaultRange: DateRangeKey;
  timestampStyle: "relative" | "exact";
}

export interface WorkspaceUserSettings {
  dashboard: DashboardSettings;
  notifications: Record<NotificationEventKey, NotificationChannels>;
}

const DEFAULT_DASHBOARD: DashboardSettings = {
  landingPage: "/",
  defaultRange: "7d",
  timestampStyle: "relative",
};

const DEFAULT_NOTIFICATIONS: Record<NotificationEventKey, NotificationChannels> = {
  appointment_booked: { inApp: true, email: true, sms: false },
  appointment_cancelled: { inApp: true, email: true, sms: false },
  appointment_rescheduled: { inApp: true, email: false, sms: false },
  integration_problem: { inApp: true, email: true, sms: false },
  ai_could_not_answer: { inApp: true, email: false, sms: false },
  high_missed_calls: { inApp: true, email: true, sms: false },
};

export class SettingsRepository extends WorkspaceScopedRepository {
  /** Defaults fill any gap, so a user who has never opened Settings still works. */
  async load(userId: string): Promise<WorkspaceUserSettings> {
    const [dashboardRows, notificationRows] = await Promise.all([
      this.sql`select * from user_workspace_settings
               where user_id = ${userId} and workspace_id = ${this.ws}`,
      this.sql`select * from user_notification_preferences
               where user_id = ${userId} and workspace_id = ${this.ws}`,
    ]);

    const notifications = { ...DEFAULT_NOTIFICATIONS };
    for (const row of notificationRows) {
      const key = str(row.event_key) as NotificationEventKey;
      if (key in notifications) {
        notifications[key] = { inApp: bool(row.in_app), email: bool(row.email), sms: bool(row.sms) };
      }
    }

    return {
      dashboard: dashboardRows[0] ? toDashboard(dashboardRows[0]) : DEFAULT_DASHBOARD,
      notifications,
    };
  }

  async updateDashboard(userId: string, patch: Partial<DashboardSettings>): Promise<void> {
    const current = await this.load(userId);
    const next = { ...current.dashboard, ...patch };
    await this.sql`
      insert into user_workspace_settings
        (user_id, workspace_id, landing_page, default_range, timestamp_style)
      values (${userId}, ${this.ws}, ${next.landingPage}, ${next.defaultRange}, ${next.timestampStyle})
      on conflict (user_id, workspace_id) do update set
        landing_page    = excluded.landing_page,
        default_range   = excluded.default_range,
        timestamp_style = excluded.timestamp_style`;
  }

  async setNotification(
    userId: string,
    key: NotificationEventKey,
    channel: keyof NotificationChannels,
    value: boolean
  ): Promise<void> {
    const current = await this.load(userId);
    const next = { ...current.notifications[key], [channel]: value };
    await this.sql`
      insert into user_notification_preferences
        (user_id, workspace_id, event_key, in_app, email, sms)
      values (${userId}, ${this.ws}, ${key}, ${next.inApp}, ${next.email}, ${next.sms})
      on conflict (user_id, workspace_id, event_key) do update set
        in_app = excluded.in_app,
        email  = excluded.email,
        sms    = excluded.sms`;
  }
}

function toDashboard(row: Row): DashboardSettings {
  return {
    landingPage: str(row.landing_page),
    defaultRange: str(row.default_range) as DateRangeKey,
    timestampStyle: str(row.timestamp_style) === "exact" ? "exact" : "relative",
  };
}
