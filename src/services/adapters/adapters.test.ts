import { describe, expect, it } from "vitest";
import type { IntegrationRecord, ProviderId } from "@/types";
import { buildIntegrations } from "@/data/integrations-seed";
import { getAdapter } from "./index";
import { renderProviderTimestamp, type ProviderTimeStyle } from "./mock/core";
import { instantFromProvider } from "./provider-time";

const WORKSPACE = "ws_test";
const NOW = new Date("2026-08-17T20:00:00Z");

/**
 * The process timezone is UTC, and the zoned provider style below is not, so an
 * adapter that fell back to the process clock would fail here.
 */

function recordFor(provider: ProviderId): IntegrationRecord {
  return buildIntegrations(NOW, WORKSPACE).find((r) => r.provider === provider)!;
}

const ALL_PROVIDERS: ProviderId[] = [
  "vapi",
  "twilio",
  "google_calendar",
  "gmail",
  "n8n",
  "pinecone",
  "model_provider",
];

describe("every provider has an adapter", () => {
  it("resolves an adapter for each provider, matching its own id", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(getAdapter(provider).provider, provider).toBe(provider);
    }
  });
});

describe("the connect lifecycle", () => {
  it("moves a disconnected provider to connected and healthy", async () => {
    const record = recordFor("google_calendar");
    expect(record.connection).toBe("disconnected");

    const patch = await getAdapter("google_calendar").connect({ record, now: NOW });
    expect(patch.connection).toBe("connected");
    expect(patch.health).toBe("healthy");
    expect(patch.lastError).toBeNull();
    // Its capabilities come back with it.
    expect(patch.capabilities?.filter((c) => c.enabled).length).toBeGreaterThan(0);
  });

  it("clears configuration on disconnect without erasing history", async () => {
    const record = { ...recordFor("vapi") };
    const patch = await getAdapter("vapi").disconnect({ record, now: NOW });

    expect(patch.connection).toBe("disconnected");
    expect(patch.config?.every((c) => c.state === "not_configured")).toBe(true);
    // The last successful sync is not part of the patch, so it survives.
    expect(patch.lastSuccessfulSyncAt).toBeUndefined();
  });

  it("never returns a value for a sensitive field, even after connecting", async () => {
    for (const provider of ALL_PROVIDERS) {
      const record = recordFor(provider);
      const patch = await getAdapter(provider).connect({ record, now: NOW });
      for (const field of patch.config ?? []) {
        if (field.sensitive) expect(field.value, `${provider}.${field.key}`).toBeUndefined();
      }
    }
  });
});

describe("connection tests are deterministic", () => {
  it("gives the same answer for the same state, every time", async () => {
    const record = recordFor("gmail");
    const first = await getAdapter("gmail").testConnection({ record, now: NOW });
    const second = await getAdapter("gmail").testConnection({ record, now: NOW });
    expect(first.outcome).toBe(second.outcome);
    expect(first.message).toBe(second.message);
  });

  it("reports authentication required for a disconnected provider", async () => {
    const record = recordFor("google_calendar");
    const result = await getAdapter("google_calendar").testConnection({ record, now: NOW });
    expect(result.outcome).toBe("authentication_required");
    expect(result.health).toBe("down");
    expect(result.error?.category).toBe("auth");
  });

  it("reports incomplete configuration before it reports anything else", async () => {
    const base = recordFor("vapi");
    const record = {
      ...base,
      config: base.config.map((c) => (c.key === "assistant" ? { ...c, state: "not_configured" as const } : c)),
    };
    const result = await getAdapter("vapi").testConnection({ record, now: NOW });
    expect(result.outcome).toBe("configuration_incomplete");
    expect(result.error?.category).toBe("configuration");
  });

  it("recovers a transient fault — a rate limit clears on a good check", async () => {
    const record = recordFor("gmail");
    expect(record.lastError?.category).toBe("rate_limit");

    const result = await getAdapter("gmail").testConnection({ record, now: NOW });
    expect(result.outcome).toBe("healthy");
    expect(result.health).toBe("healthy");
    expect(result.error).toBeNull();
  });

  it("passes a healthy provider", async () => {
    const record = recordFor("vapi");
    const result = await getAdapter("vapi").testConnection({ record, now: NOW });
    expect(result).toMatchObject({ outcome: "healthy", health: "healthy", error: null });
  });

  it("never puts anything credential-shaped in a message", async () => {
    const suspicious = /sk-|key=|token|secret|password|bearer|https?:\/\//i;
    for (const provider of ALL_PROVIDERS) {
      const record = recordFor(provider);
      const result = await getAdapter(provider).testConnection({ record, now: NOW });
      expect(result.message, provider).not.toMatch(suspicious);
      expect(result.error?.adminDetail ?? "", provider).not.toMatch(suspicious);
    }
  });
});

describe("the provider time boundary is on the executed path", () => {
  it("round-trips each provider's wire format back to the same instant", () => {
    const styles: ProviderTimeStyle[] = [
      { kind: "utc" },
      { kind: "offset", offsetMinutes: 0 },
      { kind: "offset", offsetMinutes: -480 },
      { kind: "zoned", timeZone: "America/Los_Angeles" },
    ];

    for (const style of styles) {
      const wire = renderProviderTimestamp(NOW, style);
      const parsed = instantFromProvider(wire);
      // Seconds are the finest granularity these formats carry.
      expect(Math.abs(parsed.getTime() - NOW.getTime()), JSON.stringify(style)).toBeLessThan(1000);
    }
  });

  it("stamps adapters' timestamps as canonical UTC instants", async () => {
    for (const provider of ALL_PROVIDERS) {
      const record = recordFor(provider);
      const patch = await getAdapter(provider).connect({ record, now: NOW });
      expect(patch.lastCheckedAt, provider).toMatch(/Z$/);
      expect(Math.abs(new Date(patch.lastCheckedAt!).getTime() - NOW.getTime()), provider).toBeLessThan(1000);
    }
  });

  it("refuses a bare provider timestamp that arrives without a zone", () => {
    // The calendar adapter's format is a bare wall-clock reading; it is only
    // legal because the zone travels with it. Strip the zone and it must throw
    // rather than quietly adopting the server's clock.
    const wire = renderProviderTimestamp(NOW, { kind: "zoned", timeZone: "America/Los_Angeles" });
    expect(wire.timeZone).toBe("America/Los_Angeles");
    expect(() => instantFromProvider({ value: wire.value })).toThrow(/no UTC offset/);
  });

  it("resolves a zoned provider timestamp to a different instant than a naive read would", () => {
    const wire = renderProviderTimestamp(NOW, { kind: "zoned", timeZone: "America/Los_Angeles" });
    const correct = instantFromProvider(wire);
    // Reading the same string as if it were UTC — the bug this boundary prevents.
    const naive = new Date(`${wire.value}Z`);
    expect(correct.getTime()).not.toBe(naive.getTime());
    expect(correct.getTime()).toBe(NOW.getTime());
  });
});
