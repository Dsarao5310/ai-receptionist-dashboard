import { unstable_rethrow } from "next/navigation";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { scopeFor, getWorkspaceConfiguration } from "@/server/workspace-data";
import { serverEnv } from "@/server/env";
import { AdminDenied } from "@/features/integrations/AdminDenied";
import {
  CONFIG_KEYS,
  resolveConnection,
  timezoneMismatch,
} from "@/server/integrations/google-calendar/connection";
import { CalendarAdminView } from "./view";

/**
 * The calendar, for whoever operates the platform.
 *
 * ── Why this is its own page ────────────────────────────────────────────────
 * Every other provider fits the shared integration drawer: connect, test,
 * disconnect. A calendar does not. It needs a calendar *chosen* from an
 * account, two timezones compared, and a queue of bookings where the external
 * system and this one disagree. Cramming that into the generic drawer would
 * make the drawer worse for the six providers that do not need it.
 *
 * ── Loaded here, not in the layout ──────────────────────────────────────────
 * Reconciliation data is admin diagnostics that most sessions never look at.
 * Loading it on this request keeps it out of every other page's payload —
 * which is also what stops it reaching people who may not see it.
 */
export default async function AdminCalendarPage() {
  let data: Awaited<ReturnType<typeof loadCalendarAdminData>>;
  try {
    data = await loadCalendarAdminData();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthorizationError || error instanceof AuthenticationError) return <AdminDenied />;
    throw error;
  }

  return <CalendarAdminView {...data} />;
}

async function loadCalendarAdminData() {
  const context = await requirePermission("integrations.manage");
  const scope = scopeFor(context);

  const [configuration, records, needingSync] = await Promise.all([
    getWorkspaceConfiguration(context),
    scope.integrations.list(),
    scope.appointments.listNeedingSync(25),
  ]);

  const record = records.find((r) => r.provider === "google_calendar") ?? null;
  const state = await resolveConnection(context);

  const configured = (key: string) => {
    const field = record?.config.find((c) => c.key === key);
    return field?.state === "configured" ? (field.value ?? null) : null;
  };

  const calendarTimeZone = configured(CONFIG_KEYS.calendarTimeZone);

  return {
    recordId: record?.id ?? "",
    mode: serverEnv.googleCalendarMode,
    connected: state.connected,
    connectionReason: state.connected ? null : state.reason,
    account: configured(CONFIG_KEYS.account),
    calendarLabel: configured(CONFIG_KEYS.calendar),
    // Admin-only. A calendar id is a private identifier and never reaches a
    // client-facing surface.
    calendarId: configured(CONFIG_KEYS.calendarId),
    calendarTimeZone,
    authorized: record?.config.find((c) => c.key === CONFIG_KEYS.oauth)?.state === "configured",
    health: record?.health ?? "unknown",
    connection: record?.connection ?? "not_configured",
    lastCheckedAt: record?.lastCheckedAt ?? null,
    lastSuccessfulSyncAt: record?.lastSuccessfulSyncAt ?? null,
    lastError: record?.lastError ?? null,
    timezones: timezoneMismatch(configuration.business.timezone, calendarTimeZone ?? configuration.business.timezone),
    needingSync: needingSync.map((appointment) => ({
      id: appointment.id,
      customerName: appointment.customerName,
      serviceName: appointment.service.name,
      date: appointment.date,
      time: appointment.time,
      status: appointment.status,
      syncState: appointment.syncState ?? null,
      syncDetail: appointment.syncDetail,
      eventId: appointment.eventId,
    })),
  };
}
