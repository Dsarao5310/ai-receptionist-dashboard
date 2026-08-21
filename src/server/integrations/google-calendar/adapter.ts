import "server-only";

import type { IntegrationCapabilityFlag } from "@/types";
import { serverEnv } from "@/server/env";
import type { AdapterContext, IntegrationAdapter, TestResult } from "@/services/adapters/types";
import { requireWorkspace } from "@/server/auth/guards";
import { testCalendarConnection } from "./operations";
import { buildCalendarConfig, CONFIG_KEYS } from "./connection";
import { revokeAndForget } from "./oauth";

/**
 * Google Calendar behind the existing adapter interface.
 *
 * ── What "test" means for a real provider ───────────────────────────────────
 * The mock decided its answer from the record's own stored state, so testing a
 * connection could only ever confirm what the database already believed. This
 * one performs a read-only fetch of the selected calendar: it proves the stored
 * grant still refreshes, the calendar still exists, and we can still see it —
 * without creating, moving or deleting anything in a real business's diary.
 *
 * ── Connect is not here ─────────────────────────────────────────────────────
 * Connecting requires a browser redirect through Google's consent screen, which
 * an adapter method returning a patch cannot express. That flow lives in the
 * OAuth routes; `connect` here reports what an administrator should do instead
 * of pretending to do it. Adapters that *can* connect without a redirect keep
 * working exactly as before — the interface did not change.
 */

function capabilitiesFor(ctx: AdapterContext, enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    ["read_events", "write_events", "free_busy"].includes(capability.key)
      ? { ...capability, enabled }
      : capability
  );
}

function configValue(ctx: AdapterContext, key: string): string | null {
  const field = ctx.record.config.find((c) => c.key === key);
  return field?.state === "configured" ? (field.value ?? null) : null;
}

export const googleCalendarServerAdapter: IntegrationAdapter = {
  provider: "google_calendar",

  async connect(ctx) {
    // A no-op patch with an honest error. The alternative — marking the record
    // connected — would make every capability claim a calendar that has never
    // authorised us.
    return {
      lastCheckedAt: ctx.now.toISOString(),
      lastError: {
        code: "calendar_requires_consent",
        category: "auth",
        severity: "warning",
        message: "This calendar needs to be authorised.",
        adminDetail: "Use Connect calendar, which redirects through Google's consent screen.",
        provider: "google_calendar",
        timestamp: ctx.now.toISOString(),
        retryable: false,
      },
    };
  },

  /**
   * Disconnect: revoke the grant, forget the tokens, keep the history.
   *
   * Appointments, their external event mappings and every audit row survive.
   * Disconnecting a calendar is an operational change, not a reason to lose a
   * business's record of what it has booked — and keeping the mappings is what
   * makes a later reconnection able to reconcile rather than start blind.
   */
  async disconnect(ctx) {
    const context = await requireWorkspace();
    await revokeAndForget(context.workspaceId);

    return {
      connection: "disconnected",
      health: "unknown",
      lastCheckedAt: ctx.now.toISOString(),
      lastError: null,
      config: buildCalendarConfig({
        account: null,
        calendarId: null,
        calendarLabel: null,
        // The calendar's timezone is kept: it describes a calendar that still
        // exists, and losing it would make a reconnection look like a change.
        calendarTimeZone: configValue(ctx, CONFIG_KEYS.calendarTimeZone),
        authorized: false,
      }),
      capabilities: capabilitiesFor(ctx, false),
    };
  },

  async testConnection(ctx): Promise<TestResult> {
    if (serverEnv.googleCalendarMode === "disabled") {
      return {
        outcome: "configuration_incomplete",
        health: "unknown",
        message: "Calendar integration is switched off for this deployment.",
        error: {
          code: "calendar_mode_disabled",
          category: "configuration",
          severity: "info",
          message: "Calendar integration is switched off.",
          adminDetail: "GOOGLE_CALENDAR_MODE is disabled.",
          provider: "google_calendar",
          timestamp: ctx.now.toISOString(),
          retryable: false,
        },
      };
    }

    const context = await requireWorkspace();
    const result = await testCalendarConnection(context, ctx.now);

    if (result.ok) {
      return {
        outcome: "healthy",
        health: "healthy",
        message: `Reading ${result.value.calendarLabel} normally (${result.value.latencyMs}ms).`,
        error: null,
      };
    }

    const outcome: TestResult["outcome"] =
      result.error.category === "auth"
        ? "authentication_required"
        : result.error.category === "permission"
          ? "permission_missing"
          : result.error.category === "configuration"
            ? "configuration_incomplete"
            : "unreachable";

    return {
      outcome,
      health: outcome === "configuration_incomplete" ? "degraded" : "down",
      // Already normalized: no status code, no Google payload, no vendor detail
      // beyond what an admin surface is entitled to.
      message: result.error.message,
      error: result.error,
    };
  },

  getCapabilities(ctx) {
    return capabilitiesFor(
      ctx,
      ctx.record.connection === "connected" && serverEnv.googleCalendarMode !== "disabled"
    );
  },
};
