import "server-only";

import type { IntegrationCapabilityFlag, NormalizedError } from "@/types";
import { requireWorkspace } from "@/server/auth/guards";
import { workspaceScope } from "@/server/db/workspace-scope";
import { serverEnv } from "@/server/env";
import { credentialStore } from "@/server/integrations/credential-store";
import type { AdapterContext, IntegrationAdapter, TestResult } from "@/services/adapters/types";

function capabilitiesFor(ctx: AdapterContext, enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    ["inbound_calls", "transcription"].includes(capability.key)
      ? { ...capability, enabled }
      : capability
  );
}

function notConfigured(now: Date, detail: string): NormalizedError {
  return {
    code: "vapi_not_configured",
    category: "configuration",
    severity: "warning",
    message: "Voice calling is not fully configured.",
    adminDetail: detail,
    provider: "vapi",
    timestamp: now.toISOString(),
    retryable: false,
  };
}

function deploymentConfigured(): boolean {
  if (serverEnv.vapiMode === "disabled") return false;
  if (serverEnv.vapiMode === "simulated") return true;
  return credentialStore.isFullyConfigured("vapi") && Boolean(serverEnv.vapiPublicWebhookUrl);
}

export const vapiServerAdapter: IntegrationAdapter = {
  provider: "vapi",

  async connect(ctx) {
    if (!deploymentConfigured()) {
      return {
        connection: "not_configured",
        health: "degraded",
        lastCheckedAt: ctx.now.toISOString(),
        lastError: notConfigured(
          ctx.now,
          "Live Vapi requires VAPI_API_KEY, VAPI_WEBHOOK_BEARER_TOKEN, and VAPI_PUBLIC_WEBHOOK_URL."
        ),
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
    if (serverEnv.vapiMode === "disabled") {
      return {
        outcome: "configuration_incomplete",
        health: "unknown",
        message: "Voice calling is switched off for this deployment.",
        error: notConfigured(ctx.now, "VAPI_MODE is disabled."),
      };
    }
    if (!deploymentConfigured()) {
      return {
        outcome: "configuration_incomplete",
        health: "degraded",
        message: "Voice calling is not fully configured.",
        error: notConfigured(ctx.now, "The deployment is missing a required Vapi credential or callback URL."),
      };
    }

    const context = await requireWorkspace();
    const resources = await workspaceScope(context).vapi.listResourceCounts();
    if (resources.assistants === 0 && resources.phoneNumbers === 0) {
      return {
        outcome: "configuration_incomplete",
        health: "degraded",
        message: "No voice assistant or phone number is assigned to this business yet.",
        error: notConfigured(
          ctx.now,
          "This workspace has no active vapi_assistants row or voice-enabled Vapi provider_phone_numbers row."
        ),
      };
    }

    return {
      outcome: "healthy",
      health: "healthy",
      message: serverEnv.vapiMode === "simulated"
        ? "Ready to receive simulated voice-call events."
        : "Voice-call webhook configuration and tenant mappings are present.",
      error: null,
    };
  },

  getCapabilities(ctx) {
    return capabilitiesFor(
      ctx,
      ctx.record.connection === "connected" && serverEnv.vapiMode !== "disabled"
    );
  },
};
