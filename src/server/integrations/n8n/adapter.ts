import "server-only";

import type { IntegrationCapabilityFlag, IntegrationConfigField } from "@/types";
import { serverEnv } from "@/server/env";
import { credentialStore } from "@/server/integrations/credential-store";
import type { AdapterContext, IntegrationAdapter, TestResult } from "@/services/adapters/types";
import { probeHealth } from "./client";

/**
 * The real n8n adapter.
 *
 * ── What changed from the mock ──────────────────────────────────────────────
 * The mock decided its answers from the record's own stored state: if the row
 * said "connected", testing it said "healthy". That is a demo, and it can only
 * ever confirm what the database already believed. This one asks the engine.
 *
 * The interface is unchanged, which is the point of having had one. Nothing
 * above this file — the server action, the repository, the admin drawer — knows
 * that this adapter now opens a socket, and no component imports it: it is
 * reached through `serverAdapterRegistry`, which is `server-only` and therefore
 * cannot be pulled into a client bundle even by an incorrect import.
 *
 * ── Connection means credential, not OAuth ──────────────────────────────────
 * n8n is platform infrastructure, configured once per deployment rather than
 * authorised per tenant. So "connect" here is not a redirect and a token
 * exchange: it verifies that the deployment's credentials resolve and that the
 * engine answers, then records that. The credential itself is resolved through
 * the credential store and never touched by this file — `isFullyConfigured`
 * returns a boolean, not a value.
 */

const REQUIRED_CONFIG_KEYS = ["instance", "credential"];

function capabilitiesFor(ctx: AdapterContext, enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    capability.key === "execute" || capability.key === "history" ? { ...capability, enabled } : capability
  );
}

/**
 * The configuration lines an admin sees, refreshed from what the server can
 * actually resolve.
 *
 * `credential` is marked sensitive and therefore carries no value — the
 * repository strips one and a CHECK constraint refuses the row if it somehow
 * survived. What is written is the *state*: whether the credential resolves.
 * `instance` carries the mode rather than the URL, because the engine's address
 * is infrastructure and this row is one join away from an admin screen.
 */
function configFor(ctx: AdapterContext): IntegrationConfigField[] {
  const credentialsPresent = credentialStore.isFullyConfigured("n8n");

  return ctx.record.config.map((field) => {
    if (field.key === "credential") {
      return { ...field, state: credentialsPresent ? ("configured" as const) : ("not_configured" as const) };
    }
    if (field.key === "instance") {
      return {
        ...field,
        state: serverEnv.n8nMode === "disabled" ? ("not_configured" as const) : ("configured" as const),
        value: MODE_LABELS[serverEnv.n8nMode],
      };
    }
    return field;
  });
}

const MODE_LABELS = {
  disabled: "Not configured",
  simulated: "Development (simulated engine)",
  live: "Live instance",
} as const;

export const n8nServerAdapter: IntegrationAdapter = {
  provider: "n8n",

  async connect(ctx) {
    const probe = await probeHealth(ctx.now);
    const checkedAt = ctx.now.toISOString();

    if (!probe.reachable) {
      // A connect that cannot reach the engine has not connected anything.
      // Recording it as connected would make every downstream capability claim
      // an automation that is not there.
      return {
        connection: "error",
        health: "down",
        lastCheckedAt: checkedAt,
        lastError: probe.error,
        config: configFor(ctx),
        capabilities: capabilitiesFor(ctx, false),
      };
    }

    return {
      connection: "connected",
      health: "healthy",
      lastCheckedAt: checkedAt,
      lastSuccessfulSyncAt: checkedAt,
      lastError: null,
      config: configFor(ctx),
      capabilities: capabilitiesFor(ctx, true),
    };
  },

  async disconnect(ctx) {
    // History is kept — the last successful sync still happened — and the
    // credential is not deleted here. It lives outside the database entirely,
    // and removing a deployment-wide secret because one workspace was
    // disconnected would take every other workspace down with it.
    return {
      connection: "disconnected",
      health: "unknown",
      lastCheckedAt: ctx.now.toISOString(),
      lastError: null,
      capabilities: capabilitiesFor(ctx, false),
    };
  },

  async testConnection(ctx): Promise<TestResult> {
    const probe = await probeHealth(ctx.now);

    if (probe.reachable) {
      const missing = REQUIRED_CONFIG_KEYS.filter(
        (key) => configFor(ctx).find((c) => c.key === key)?.state !== "configured"
      );
      if (missing.length > 0) {
        return {
          outcome: "configuration_incomplete",
          health: "degraded",
          message: "Reachable, but not fully configured yet.",
          error: {
            code: "configuration_incomplete",
            category: "configuration",
            severity: "warning",
            message: "This connection is not finished being set up.",
            adminDetail: `Missing configuration: ${missing.join(", ")}.`,
            provider: "n8n",
            timestamp: ctx.now.toISOString(),
            retryable: false,
          },
        };
      }

      return {
        outcome: "healthy",
        health: "healthy",
        message:
          probe.mode === "simulated"
            ? `Simulated engine responding (${probe.latencyMs}ms).`
            : `Responding normally (${probe.latencyMs}ms).`,
        error: null,
      };
    }

    const error = probe.error;
    const outcome: TestResult["outcome"] =
      error?.category === "auth"
        ? "authentication_required"
        : error?.category === "configuration"
          ? "configuration_incomplete"
          : "unreachable";

    return {
      outcome,
      health: outcome === "configuration_incomplete" ? "degraded" : "down",
      // The normalized message. A raw upstream body never reaches this string.
      message: error?.message ?? "Could not reach the automation service.",
      error,
    };
  },

  getCapabilities(ctx) {
    return capabilitiesFor(ctx, ctx.record.connection === "connected" && serverEnv.n8nMode !== "disabled");
  },
};
