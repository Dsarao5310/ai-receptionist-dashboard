import { describe, expect, it, vi } from "vitest";
import type { IntegrationRecord, ProviderId } from "@/types";
import { effectiveIntegrationRecord, getServerAdapter, isLiveProvider } from "./registry";

vi.mock("server-only", () => ({}));
vi.mock("./n8n/adapter", () => ({ n8nServerAdapter: { provider: "n8n" } }));
vi.mock("./google-calendar/adapter", () => ({ googleCalendarServerAdapter: { provider: "google_calendar" } }));
vi.mock("./twilio/adapter", () => ({ twilioServerAdapter: { provider: "twilio" } }));

const NOW = new Date("2026-08-20T20:00:00.000Z");
const unavailable: ProviderId[] = ["vapi", "gmail", "pinecone", "model_provider"];

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

  it("does not project a stale connected seed row as operational", () => {
    const projected = effectiveIntegrationRecord(record("vapi"), NOW);

    expect(projected.connection).toBe("not_configured");
    expect(projected.health).toBe("unknown");
    expect(projected.capabilities.every((capability) => !capability.enabled)).toBe(true);
  });
});
