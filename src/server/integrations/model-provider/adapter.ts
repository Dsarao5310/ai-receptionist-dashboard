import "server-only";

import type { IntegrationCapabilityFlag, NormalizedError } from "@/types";
import { serverEnv } from "@/server/env";
import type { IntegrationAdapter, TestResult } from "@/services/adapters/types";
import { resolveModelPolicy } from "./policy";

function capabilities(ctx: Parameters<IntegrationAdapter["getCapabilities"]>[0], enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    ["chat", "summarise"].includes(capability.key) ? { ...capability, enabled } : capability
  );
}

function notConfigured(now: Date, detail: string): NormalizedError {
  return {
    code: "model_provider_not_configured",
    category: "configuration",
    severity: "warning",
    message: "The AI receptionist model is not fully configured.",
    adminDetail: detail,
    provider: "model_provider",
    timestamp: now.toISOString(),
    retryable: false,
  };
}

function configured(): boolean {
  if (serverEnv.modelProviderMode === "disabled") return false;
  if (serverEnv.modelProviderMode === "simulated") return true;
  try {
    const policy = resolveModelPolicy();
    return policy.primaryModel !== policy.fallbackModel && serverEnv.modelGatewayAuthConfigured;
  } catch {
    return false;
  }
}

export const modelProviderServerAdapter: IntegrationAdapter = {
  provider: "model_provider",
  async connect(ctx) {
    const ready = configured();
    return ready
      ? { connection: "connected", health: "healthy", lastCheckedAt: ctx.now.toISOString(), lastError: null, capabilities: capabilities(ctx, true) }
      : { connection: "not_configured", health: "unknown", lastCheckedAt: ctx.now.toISOString(), lastError: notConfigured(ctx.now, "Model mode, approved primary/fallback policy, or gateway authentication is missing."), capabilities: capabilities(ctx, false) };
  },
  async disconnect(ctx) {
    return { connection: "disconnected", health: "unknown", lastCheckedAt: ctx.now.toISOString(), lastError: null, capabilities: capabilities(ctx, false) };
  },
  async testConnection(ctx): Promise<TestResult> {
    if (!configured()) {
      return { outcome: "configuration_incomplete", health: "unknown", message: "The AI receptionist model is not fully configured.", error: notConfigured(ctx.now, "No live request is made by this configuration check.") };
    }
    return {
      outcome: "healthy",
      health: "healthy",
      message: serverEnv.modelProviderMode === "simulated"
        ? "Ready to run deterministic simulated model evaluations."
        : "The server-only model policy and gateway authentication are configured.",
      error: null,
    };
  },
  getCapabilities(ctx) {
    return capabilities(ctx, ctx.record.connection === "connected" && configured());
  },
};
