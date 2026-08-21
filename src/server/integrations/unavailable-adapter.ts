import "server-only";

import type { ProviderId } from "@/types";
import type { IntegrationAdapter, TestResult } from "@/services/adapters/types";

export function unavailableServerAdapter(provider: ProviderId): IntegrationAdapter {
  const error = (now: Date) => ({
    code: "provider_unavailable",
    category: "configuration" as const,
    severity: "warning" as const,
    message: "This provider is not available on this deployment.",
    adminDetail: `No live server adapter is registered for ${provider}. Development mocks cannot be used here.`,
    provider,
    timestamp: now.toISOString(),
    retryable: false,
  });

  const capabilities = (ctx: Parameters<IntegrationAdapter["getCapabilities"]>[0]) =>
    ctx.record.capabilities.map((capability) => ({ ...capability, enabled: false }));

  return {
    provider,
    async connect(ctx) {
      return {
        connection: "not_configured",
        health: "unknown",
        lastCheckedAt: ctx.now.toISOString(),
        lastError: error(ctx.now),
        capabilities: capabilities(ctx),
      };
    },
    async disconnect(ctx) {
      return {
        connection: "disconnected",
        health: "unknown",
        lastCheckedAt: ctx.now.toISOString(),
        lastError: null,
        capabilities: capabilities(ctx),
      };
    },
    async testConnection(ctx): Promise<TestResult> {
      return {
        outcome: "configuration_incomplete",
        health: "unknown",
        message: "This provider is not available on this deployment.",
        error: error(ctx.now),
      };
    },
    getCapabilities: capabilities,
  };
}
