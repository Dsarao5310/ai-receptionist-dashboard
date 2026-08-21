import "server-only";

import type { IntegrationConfigField, IntegrationRecord } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { workspaceScope } from "@/server/db/workspace-scope";
import { serverEnv } from "@/server/env";

/**
 * What a workspace's calendar connection currently is.
 *
 * ── Why this is resolved, not passed around ─────────────────────────────────
 * Every calendar operation needs the same four facts: which calendar, in which
 * timezone, for which workspace, and whether we are connected at all. Threading
 * them through call sites would mean each one could get them from somewhere
 * else — and "somewhere else" eventually includes a request body.
 *
 * So there is one resolver, it takes an `AuthContext`, and it reads the
 * *authorized* workspace's own integration record. A calendar id is never
 * accepted as an argument from a caller: §9's rule — never perform a calendar
 * operation from a provider reference alone — is enforced by there being no
 * parameter for one.
 */

export const CONFIG_KEYS = {
  account: "account",
  calendar: "calendar",
  calendarId: "calendar_id",
  calendarTimeZone: "calendar_timezone",
  oauth: "oauth",
} as const;

export interface CalendarConnection {
  /** The integration record's id, for patching. */
  recordId: string;
  workspaceId: string;
  calendarId: string;
  /** The calendar's own zone — not necessarily the business's. */
  calendarTimeZone: string;
  /** Display label for admin surfaces, e.g. the connected account. */
  account: string | null;
  calendarLabel: string | null;
}

export type ConnectionState =
  | { connected: true; connection: CalendarConnection }
  | { connected: false; reason: "not_configured" | "no_calendar_selected" | "disconnected" | "mode_disabled" };

function configValue(record: IntegrationRecord, key: string): string | null {
  const field = record.config.find((c) => c.key === key);
  return field?.state === "configured" ? (field.value ?? null) : null;
}

/**
 * The calendar record for the authorized workspace, if there is one.
 *
 * Returns the record itself so callers that need to patch health or
 * configuration do not have to look it up a second time.
 */
export async function calendarRecord(context: AuthContext): Promise<IntegrationRecord | null> {
  const records = await workspaceScope(context).integrations.list();
  return records.find((r) => r.provider === "google_calendar") ?? null;
}

export async function resolveConnection(context: AuthContext): Promise<ConnectionState> {
  if (serverEnv.googleCalendarMode === "disabled") return { connected: false, reason: "mode_disabled" };

  const record = await calendarRecord(context);
  if (!record) return { connected: false, reason: "not_configured" };

  if (record.connection === "disconnected" || record.connection === "not_configured") {
    return { connected: false, reason: record.connection === "disconnected" ? "disconnected" : "not_configured" };
  }

  const calendarId = configValue(record, CONFIG_KEYS.calendarId);
  // Authorised but no calendar chosen yet is a real, distinct state: the OAuth
  // handshake succeeded and an administrator still has a decision to make.
  if (!calendarId) return { connected: false, reason: "no_calendar_selected" };

  return {
    connected: true,
    connection: {
      recordId: record.id,
      workspaceId: context.workspaceId,
      calendarId,
      calendarTimeZone: configValue(record, CONFIG_KEYS.calendarTimeZone) ?? "UTC",
      account: configValue(record, CONFIG_KEYS.account),
      calendarLabel: configValue(record, CONFIG_KEYS.calendar),
    },
  };
}

/**
 * Build the configuration document an admin sees after a connection changes.
 *
 * `oauth` is marked sensitive and carries no value — `sanitizeConfig` strips one
 * and a CHECK constraint refuses the row if it survived. The frontend learns
 * that authorisation exists, never what it is.
 */
export function buildCalendarConfig(input: {
  account: string | null;
  calendarId: string | null;
  calendarLabel: string | null;
  calendarTimeZone: string | null;
  authorized: boolean;
}): IntegrationConfigField[] {
  const field = (key: string, label: string, value: string | null): IntegrationConfigField => ({
    key,
    label,
    state: value ? "configured" : "not_configured",
    ...(value ? { value } : {}),
    sensitive: false,
  });

  return [
    field(CONFIG_KEYS.account, "Connected account", input.account),
    field(CONFIG_KEYS.calendar, "Target calendar", input.calendarLabel),
    field(CONFIG_KEYS.calendarId, "Calendar identifier", input.calendarId),
    field(CONFIG_KEYS.calendarTimeZone, "Calendar timezone", input.calendarTimeZone),
    {
      key: CONFIG_KEYS.oauth,
      label: "Authorisation",
      state: input.authorized ? "configured" : "not_configured",
      sensitive: true,
    },
  ];
}

/**
 * Does the calendar's timezone match the business's?
 *
 * Not an error — a Vancouver salon may perfectly reasonably keep its bookings
 * on a calendar configured in Toronto, and the booking still happens at the
 * time the business meant. What matters is that an administrator can *see* the
 * difference, because when a booking looks three hours out this is the first
 * thing worth ruling out.
 *
 * The mismatch changes nothing about how times are computed: a booking's
 * instant is always derived from the business timezone, and the calendar's zone
 * is only ever used to interpret values Google sends back.
 */
export function timezoneMismatch(
  businessTimeZone: string,
  calendarTimeZone: string
): { mismatched: boolean; business: string; calendar: string } {
  return {
    mismatched: businessTimeZone !== calendarTimeZone,
    business: businessTimeZone,
    calendar: calendarTimeZone,
  };
}
