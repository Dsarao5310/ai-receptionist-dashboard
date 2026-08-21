import { describe, expect, it } from "vitest";
import type { IntegrationRecord, ProviderId } from "@/types";
import { buildIntegrations } from "@/data/integrations-seed";
import { DEFAULT_CONFIGURATION } from "@/data/default-config";
import { getReceptionistStatus } from "./ai-receptionist";
import {
  CAPABILITY_DEPENDENCIES,
  getAffectedCapabilities,
  getCapabilityStatus,
  getCapabilityStatuses,
  getOverallHealth,
  getSystemHealth,
  getWorkspaceIntegrations,
} from "./integrations-providers";

const WORKSPACE = "ws_test";
const NOW = new Date("2026-08-17T20:00:00Z");

function records(): IntegrationRecord[] {
  return buildIntegrations(NOW, WORKSPACE);
}

/** All providers healthy and connected — the baseline the tests degrade from. */
function allHealthy(): IntegrationRecord[] {
  return records().map((r) => ({
    ...r,
    connection: "connected",
    health: "healthy",
    lastError: null,
    config: r.config.map((c) => ({ ...c, state: "configured" as const })),
  }));
}

function withProvider(base: IntegrationRecord[], provider: ProviderId, patch: Partial<IntegrationRecord>) {
  return base.map((r) => (r.provider === provider ? { ...r, ...patch } : r));
}

describe("client capability status is derived, never stored", () => {
  it("reports every capability as connected when all providers are healthy", () => {
    const statuses = getCapabilityStatuses(allHealthy());
    expect(statuses.map((s) => s.status)).toEqual(Array(statuses.length).fill("connected"));
  });

  it("degrades the right capability when one provider errors", () => {
    // Twilio failing must read as "SMS needs attention" to the business owner.
    const broken = withProvider(allHealthy(), "twilio", { connection: "error", health: "down" });
    const statuses = Object.fromEntries(getCapabilityStatuses(broken).map((s) => [s.key, s.status]));

    expect(statuses.sms).toBe("needs_attention");
    // And nothing else is dragged down with it.
    expect(statuses.voice).toBe("connected");
    expect(statuses.email).toBe("connected");
    expect(statuses.calendar).toBe("connected");
  });

  it("degrades every channel when the shared workflow engine fails", () => {
    const broken = withProvider(allHealthy(), "n8n", { connection: "error", health: "down" });
    const statuses = Object.fromEntries(getCapabilityStatuses(broken).map((s) => [s.key, s.status]));

    for (const key of ["voice", "sms", "email", "calendar", "ai_receptionist"] as const) {
      expect(statuses[key], key).toBe("needs_attention");
    }
    // Knowledge does not depend on the engine, so it survives.
    expect(statuses.knowledge).toBe("connected");
  });

  it("takes the worst dependency, not the average", () => {
    const degraded = withProvider(allHealthy(), "gmail", { health: "degraded" });
    expect(getCapabilityStatus(degraded, "email").status).toBe("needs_attention");
  });

  it("distinguishes a connection that is missing from one that is broken", () => {
    const missing = withProvider(allHealthy(), "google_calendar", { connection: "not_configured" });
    expect(getCapabilityStatus(missing, "calendar").status).toBe("not_configured");

    const broken = withProvider(allHealthy(), "google_calendar", { connection: "error", health: "down" });
    expect(getCapabilityStatus(broken, "calendar").status).toBe("needs_attention");
  });

  it("never names a provider in anything a business user reads", () => {
    const vendors = /vapi|twilio|pinecone|n8n|gmail|google/i;
    const broken = withProvider(records(), "twilio", { connection: "error", health: "down" });

    for (const entry of getCapabilityStatuses(broken)) {
      expect(entry.label, entry.key).not.toMatch(vendors);
      expect(entry.detail, entry.key).not.toMatch(vendors);
    }
  });

  it("reflects the seeded calendar outage rather than a hard-coded flag", () => {
    // The seed ships the calendar disconnected after an expired authorisation.
    // That is a broken connection, not an absent one, so the owner is told it
    // needs attention rather than that it was never set up.
    const seeded = getWorkspaceIntegrations(records(), WORKSPACE);
    expect(seeded.find((r) => r.provider === "google_calendar")?.connection).toBe("disconnected");
    expect(getCapabilityStatus(seeded, "calendar").status).toBe("needs_attention");
  });
});

describe("the receptionist's channel status comes from the same records", () => {
  const config = DEFAULT_CONFIGURATION;

  /**
   * The status is derived from the *capability* view, not from provider records
   * — which is what lets a business user see it without ever being sent the
   * records. Going through `getCapabilityStatuses` here keeps the test on the
   * real path rather than a parallel one.
   */
  const capabilitiesOf = (records: IntegrationRecord[]) => getCapabilityStatuses(records);

  it("marks a channel connected only when its providers are healthy", () => {
    const status = getReceptionistStatus(config, capabilitiesOf(allHealthy()));
    expect(status.voice).toBe("connected");
    expect(status.sms).toBe("connected");
    expect(status.calendar).toBe("connected");
    expect(status.overall).toBe("online");
  });

  it("moves the calendar to needs_attention when the provider breaks", () => {
    const broken = withProvider(allHealthy(), "google_calendar", { connection: "error", health: "down" });
    expect(getReceptionistStatus(config, capabilitiesOf(broken)).calendar).toBe("needs_attention");
  });

  it("keeps a switched-off channel disconnected regardless of provider health", () => {
    const offConfig = { ...config, ai: { ...config.ai, channels: { ...config.ai.channels, sms: false } } };
    const status = getReceptionistStatus(offConfig, capabilitiesOf(allHealthy()));
    expect(status.sms).toBe("disconnected");
    expect(status.voice).toBe("connected");
  });

  it("goes offline when the receptionist itself is switched off", () => {
    const offConfig = { ...config, ai: { ...config.ai, enabled: false } };
    expect(getReceptionistStatus(offConfig, capabilitiesOf(allHealthy())).overall).toBe("offline");
  });
});

describe("admin health rollup", () => {
  it("summarises to operational only when everything is", () => {
    expect(getOverallHealth(allHealthy())).toBe("operational");
  });

  it("summarises to degraded when a single provider is unwell", () => {
    expect(getOverallHealth(withProvider(allHealthy(), "gmail", { health: "degraded" }))).toBe("degraded");
  });

  it("summarises to down when a capability has no working provider at all", () => {
    const gone = withProvider(allHealthy(), "pinecone", { connection: "disconnected" });
    expect(getOverallHealth(gone)).toBe("down");
  });

  it("includes the workflow engine as its own row", () => {
    const rows = getSystemHealth(allHealthy());
    expect(rows.map((r) => r.key)).toContain("workflow");
    expect(rows.find((r) => r.key === "workflow")?.state).toBe("operational");
  });
});

describe("dependency mapping", () => {
  it("names the capabilities a provider would take down", () => {
    expect(getAffectedCapabilities("twilio")).toEqual(["sms"]);
    expect(getAffectedCapabilities("n8n")).toEqual(["voice", "sms", "email", "calendar", "ai_receptionist"]);
    expect(getAffectedCapabilities("pinecone")).toEqual(["knowledge"]);
  });

  it("only depends on providers the seed actually creates", () => {
    const available = new Set(records().map((r) => r.provider));
    for (const [capability, deps] of Object.entries(CAPABILITY_DEPENDENCIES)) {
      for (const dep of deps) {
        expect(available.has(dep), `${capability} depends on missing provider ${dep}`).toBe(true);
      }
    }
  });
});

describe("no secret reaches the browser", () => {
  it("never carries a value for a sensitive configuration field", () => {
    for (const record of records()) {
      for (const field of record.config) {
        if (field.sensitive) {
          expect(field.value, `${record.provider}.${field.key}`).toBeUndefined();
        }
      }
    }
  });

  it("keeps normalized errors free of anything credential-shaped", () => {
    const suspicious = /sk-|key=|token|secret|password|bearer|https?:\/\//i;
    for (const record of records()) {
      if (!record.lastError) continue;
      expect(record.lastError.message).not.toMatch(suspicious);
      expect(record.lastError.adminDetail ?? "").not.toMatch(suspicious);
    }
  });

  it("scopes every record to a workspace", () => {
    for (const record of records()) {
      expect(record.workspaceId).toBe(WORKSPACE);
      expect(record.id.startsWith(WORKSPACE)).toBe(true);
    }
  });
});
