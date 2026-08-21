import "server-only";

import type { IntegrationCapabilityFlag } from "@/types";
import { serverEnv } from "@/server/env";
import { requireWorkspace } from "@/server/auth/guards";
import { workspaceScope } from "@/server/db/workspace-scope";
import { credentialStore } from "@/server/integrations/credential-store";
import type { AdapterContext, IntegrationAdapter, TestResult } from "@/services/adapters/types";
import { TWILIO_ERRORS } from "./errors";

/**
 * Twilio behind the existing adapter interface.
 *
 * ── What "test" means for a carrier ─────────────────────────────────────────
 * Not sending a message. A health check that sent one would cost money, reach a
 * real handset, and — on a trial account — fail for the unrelated reason that
 * the recipient is unverified. So this checks what can be checked without
 * transmitting: that the deployment is configured, that a credential resolves,
 * and that this workspace actually owns a number to send from.
 *
 * That last one matters more than it looks. A workspace with credentials but no
 * mapped number can neither send nor receive, because inbound traffic has no
 * number to resolve a tenant from — and reporting "healthy" in that state would
 * be the integration lying about itself.
 */

function capabilitiesFor(ctx: AdapterContext, enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    ["inbound_sms", "outbound_sms"].includes(capability.key) ? { ...capability, enabled } : capability
  );
}

export const twilioServerAdapter: IntegrationAdapter = {
  provider: "twilio",

  async connect(ctx) {
    // Twilio has no consent redirect: it is configured, not authorized. So
    // "connect" verifies configuration rather than pretending to negotiate.
    const configured = Boolean(serverEnv.twilioAccountSid) && credentialStore.isFullyConfigured("twilio");
    const callbacksConfigured =
      serverEnv.twilioMode !== "live" ||
      Boolean(serverEnv.twilioPublicWebhookUrl && serverEnv.twilioStatusCallbackUrl);

    if (!configured || !callbacksConfigured) {
      return {
        connection: "not_configured",
        health: "degraded",
        lastCheckedAt: ctx.now.toISOString(),
        lastError: {
          ...TWILIO_ERRORS.notConfigured(ctx.now),
          adminDetail: !configured
            ? "Twilio credentials are incomplete."
            : "Live Twilio requires both TWILIO_PUBLIC_WEBHOOK_URL and TWILIO_STATUS_CALLBACK_URL.",
        },
        capabilities: capabilitiesFor(ctx, false),
      };
    }

    return {
      connection: "connected",
      health: "healthy",
      lastCheckedAt: ctx.now.toISOString(),
      lastError: null,
      capabilities: capabilitiesFor(ctx, true),
    };
  },

  /**
   * Disconnect keeps the history and the numbers.
   *
   * Message records survive, because they are what the business actually said
   * to its customers. The number mapping survives too: releasing it here would
   * silently orphan inbound traffic, and a number is released in Twilio, not by
   * a dashboard toggle.
   */
  async disconnect(ctx) {
    return {
      connection: "disconnected",
      health: "unknown",
      lastCheckedAt: ctx.now.toISOString(),
      lastError: null,
      capabilities: capabilitiesFor(ctx, false),
    };
  },

  async testConnection(ctx): Promise<TestResult> {
    if (serverEnv.twilioMode === "disabled") {
      return {
        outcome: "configuration_incomplete",
        health: "unknown",
        message: "Text messaging is switched off for this deployment.",
        error: TWILIO_ERRORS.notConfigured(ctx.now),
      };
    }

    const context = await requireWorkspace();
    const numbers = await workspaceScope(context).messaging.listNumbers();
    const sending = numbers.find((n) => n.provider === "twilio" && n.smsEnabled);

    if (serverEnv.twilioMode === "live") {
      if (!serverEnv.twilioAccountSid || !credentialStore.resolve("twilio", "auth_token")) {
        return {
          outcome: "configuration_incomplete",
          health: "degraded",
          message: "Text messaging is not fully configured.",
          error: TWILIO_ERRORS.notConfigured(ctx.now),
        };
      }
      if (!serverEnv.twilioPublicWebhookUrl) {
        return {
          outcome: "configuration_incomplete",
          health: "degraded",
          message: "Text messaging cannot receive replies yet.",
          error: {
            ...TWILIO_ERRORS.notConfigured(ctx.now),
            adminDetail:
              "TWILIO_PUBLIC_WEBHOOK_URL is not set. Twilio signs the full URL, so inbound messages cannot be verified without it.",
          },
        };
      }
      if (!serverEnv.twilioStatusCallbackUrl) {
        return {
          outcome: "configuration_incomplete",
          health: "degraded",
          message: "Text-message delivery reporting is not configured.",
          error: {
            ...TWILIO_ERRORS.notConfigured(ctx.now),
            adminDetail:
              "TWILIO_STATUS_CALLBACK_URL is not set. Accepted messages could later fail without an operator-visible delivery outcome.",
          },
        };
      }
    }

    // Deliberately not satisfied by `TWILIO_PHONE_NUMBER`. That variable lets a
    // single-number deployment *send*, but inbound tenancy is resolved from
    // `provider_phone_numbers` and nothing else — so a workspace without a row
    // can never receive a reply. Reporting healthy on the strength of an
    // environment variable would be the integration lying about half of itself.
    if (!sending) {
      return {
        outcome: "configuration_incomplete",
        health: "degraded",
        message: serverEnv.twilioPhoneNumber
          ? "This business can send text messages but cannot receive replies yet."
          : "No text-messaging number is assigned to this business yet.",
        error: {
          ...TWILIO_ERRORS.notConfigured(ctx.now),
          adminDetail:
            "This workspace owns no row in provider_phone_numbers, so inbound messages cannot be attributed to it.",
        },
      };
    }

    const label = serverEnv.twilioMode === "simulated" ? " (simulated)" : "";
    return {
      outcome: "healthy",
      health: "healthy",
      message: `Ready to send and receive text messages${label}.`,
      error: null,
    };
  },

  getCapabilities(ctx) {
    return capabilitiesFor(
      ctx,
      ctx.record.connection === "connected" && serverEnv.twilioMode !== "disabled"
    );
  },
};
