import "server-only";

import type { IntegrationCapabilityFlag, NormalizedError } from "@/types";
import { serverEnv } from "@/server/env";
import type { IntegrationAdapter, TestResult } from "@/services/adapters/types";

function capabilities(ctx: Parameters<IntegrationAdapter["getCapabilities"]>[0], enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    ["search", "reindex"].includes(capability.key) ? { ...capability, enabled } : capability
  );
}

function notConfigured(now: Date): NormalizedError {
  return {
    code: "knowledge_provider_not_configured",
    category: "configuration",
    severity: "warning",
    message: "Business Knowledge retrieval is not configured.",
    adminDetail: "Only the deterministic simulator is application-ready; live Pinecone access is intentionally unavailable.",
    provider: "pinecone",
    timestamp: now.toISOString(),
    retryable: false,
  };
}

const configured = () => serverEnv.knowledgeProviderMode === "simulated";

export const knowledgeProviderServerAdapter: IntegrationAdapter = {
  provider: "pinecone",
  async connect(ctx) {
    return configured()
      ? { connection: "connected", health: "healthy", lastCheckedAt: ctx.now.toISOString(), lastError: null, capabilities: capabilities(ctx, true) }
      : { connection: "not_configured", health: "unknown", lastCheckedAt: ctx.now.toISOString(), lastError: notConfigured(ctx.now), capabilities: capabilities(ctx, false) };
  },
  async disconnect(ctx) {
    return { connection: "disconnected", health: "unknown", lastCheckedAt: ctx.now.toISOString(), lastError: null, capabilities: capabilities(ctx, false) };
  },
  async testConnection(ctx): Promise<TestResult> {
    if (!configured()) {
      return { outcome: "configuration_incomplete", health: "unknown", message: "Business Knowledge retrieval is not configured.", error: notConfigured(ctx.now) };
    }
    return { outcome: "healthy", health: "healthy", message: "Ready for deterministic simulated knowledge indexing and retrieval.", error: null };
  },
  getCapabilities(ctx) {
    return capabilities(ctx, ctx.record.connection === "connected" && configured());
  },
};
