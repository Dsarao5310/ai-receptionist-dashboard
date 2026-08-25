import { describe, expect, it, vi } from "vitest";
import type { IntegrationRecord, ProviderId } from "@/types";
import { effectiveIntegrationRecord, getServerAdapter, isLiveProvider } from "./registry";

vi.mock("server-only", () => ({}));
vi.mock("./n8n/adapter", () => ({ n8nServerAdapter: { provider: "n8n" } }));
vi.mock("./google-calendar/adapter", () => ({ googleCalendarServerAdapter: { provider: "google_calendar" } }));
vi.mock("./twilio/adapter", () => ({ twilioServerAdapter: { provider: "twilio" } }));
vi.mock("./vapi/adapter", () => ({
  vapiServerAdapter: {
    provider: "vapi",
    getCapabilities: ({ record }: { record: IntegrationRecord }) => record.capabilities,
  },
}));
vi.mock("./model-provider/adapter", () => ({
  modelProviderServerAdapter: {
    provider: "model_provider",
    getCapabilities: ({ record }: { record: IntegrationRecord }) => record.capabilities,
  },
}));
vi.mock("./email/adapter", () => ({
  emailServerAdapter: {
    provider: "gmail",
    getCapabilities: ({ record }: { record: IntegrationRecord }) =>
      record.capabilities.map((capability) => ({
        ...capability,
        enabled:
          record.connection === "connected" &&
          record.admin.environment === "sandbox",
      })),
  },
}));

const NOW = new Date("2026-08-20T20:00:00.000Z");
const unavailable: ProviderId[] = ["pinecone"];

function record(provider: ProviderId): IntegrationRecord {
  return {
    id: `integration_${provider}`,
    workspaceId: "ws_test",
    type: provider === "gmail" ? "email" : provider === "pinecone" ? "knowledge" : provider === "model_provider" ? "model" : "voice",
    provider,
    displayName: provider,
    purpose: "test",
    connection: "connected",
    health: "healthy",
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
    capabilities: [{ key: "example", label: "Example", enabled: true }],
    config: [],
    admin: { environment: "production" },
    lastError: null,
  };
}

describe("server provider registry", () => {
  it.each(unavailable)("fails closed for unimplemented provider %s", async (provider) => {
    expect(isLiveProvider(provider)).toBe(false);
    const adapter = getServerAdapter(provider);
    const ctx = { record: record(provider), now: NOW };
    const patch = await adapter.connect(ctx);
    const test = await adapter.testConnection(ctx);

    expect(patch).toMatchObject({ connection: "not_configured", health: "unknown" });
    expect(patch.capabilities?.every((capability) => !capability.enabled)).toBe(true);
    expect(test).toMatchObject({ outcome: "configuration_incomplete", health: "unknown" });
    expect(test.error?.code).toBe("provider_unavailable");
  });

  it("registers Vapi as an application-side server implementation", () => {
    expect(isLiveProvider("vapi")).toBe(true);
    expect(getServerAdapter("vapi").provider).toBe("vapi");
  });

  it("registers the model provider as an application-side server implementation", () => {
    expect(isLiveProvider("model_provider")).toBe(true);
    expect(getServerAdapter("model_provider").provider).toBe("model_provider");
  });

  it("registers the email foundation without projecting a production-shaped seed as live", () => {
    expect(isLiveProvider("gmail")).toBe(true);
    expect(getServerAdapter("gmail").provider).toBe("gmail");

    const projected = effectiveIntegrationRecord(record("gmail"), NOW);
    expect(projected.connection).toBe("not_configured");
    expect(projected.health).toBe("unknown");
    expect(projected.capabilities.every((capability) => !capability.enabled)).toBe(true);
  });

  it("does not project a stale connected seed row for an unavailable provider as operational", () => {
    const projected = effectiveIntegrationRecord(record("pinecone"), NOW);

    expect(projected.connection).toBe("not_configured");
    expect(projected.health).toBe("unknown");
    expect(projected.capabilities.every((capability) => !capability.enabled)).toBe(true);
  });
});
