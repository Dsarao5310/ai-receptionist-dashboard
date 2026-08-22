import { describe, expect, it } from "vitest";
import {
  databaseProjectRef,
  n8nCallbackUrl,
  n8nConfigurationProblems,
  n8nMappingProblems,
  type N8nMappingRow,
} from "./n8n-preflight";

const OPTIONS = {
  workspaceId: "ws_coastal_bloom",
  expectedOrigin: "https://ai-receptionist-dashboard-git-staging-dilpreet2.vercel.app",
  expectedProjectRef: "jhkbsfsbnynysplvnwca",
};

function validEnv() {
  return {
    AUTH_URL: OPTIONS.expectedOrigin,
    DATABASE_URL:
      "postgresql://app_runtime.jhkbsfsbnynysplvnwca:password@pooler.example.com:6543/postgres",
    N8N_MODE: "live",
    N8N_BASE_URL: "https://automation.example.com",
    N8N_REQUEST_SIGNING_SECRET: "request-signing-secret-with-32-characters",
    N8N_WEBHOOK_SIGNING_SECRET: "webhook-signing-secret-with-32-characters",
    N8N_TIMEOUT_MS: "10000",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
  };
}

const mappings: N8nMappingRow[] = [
  { operation: "appointment.reschedule", capability: "calendar", environment: "staging", status: "active" },
  { operation: "appointment.cancel", capability: "calendar", environment: "staging", status: "active" },
  { operation: "customer.message", capability: "sms", environment: "staging", status: "active" },
  { operation: "business.sync", capability: "calendar", environment: "staging", status: "active" },
  { operation: null, capability: "voice", environment: "staging", status: "active" },
];

describe("n8n staging preflight", () => {
  it("accepts isolated live staging configuration without exposing values", () => {
    expect(n8nConfigurationProblems(validEnv(), OPTIONS)).toEqual([]);
    expect(n8nMappingProblems(mappings)).toEqual([]);
  });

  it("rejects production, temporary URLs, weak or shared secrets, and a non-staging branch", () => {
    const problems = n8nConfigurationProblems(
      {
        ...validEnv(),
        AUTH_URL: "https://temporary.ngrok.app",
        DATABASE_URL:
          "postgresql://app_runtime.rkzwubwogtezqbuhieuo:password@pooler.example.com:6543/postgres",
        N8N_BASE_URL: "http://localhost:5678",
        N8N_REQUEST_SIGNING_SECRET: "same",
        N8N_WEBHOOK_SIGNING_SECRET: "same",
        N8N_TIMEOUT_MS: "never",
        VERCEL_GIT_COMMIT_REF: "feature/test",
      },
      OPTIONS
    );
    expect(problems).toContain("AUTH_URL must be a stable public HTTPS origin with no path");
    expect(problems).toContain("N8N_BASE_URL must be a permanent public HTTPS URL");
    expect(problems).toContain("DATABASE_URL does not use --expected-project-ref");
    expect(problems).toContain("n8n inbound and outbound signing secrets must be different");
    expect(problems).toContain("N8N_TIMEOUT_MS must be a positive integer");
    expect(problems).toContain("n8n staging certification requires the staging Git branch");
  });

  it("requires every certifiable mapping and an inbound voice mapping to be active in staging", () => {
    const problems = n8nMappingProblems([
      ...mappings.filter((row) => row.operation !== "appointment.cancel" && row.operation !== null),
      { operation: null, capability: "voice", environment: "production", status: "inactive" },
    ]);
    expect(problems).toContain("missing active mapping for appointment.cancel");
    expect(problems).toContain("missing active voice mapping for signed inbound booking events");
  });

  it("derives project references and the fixed inbound callback without secrets", () => {
    expect(databaseProjectRef(validEnv().DATABASE_URL)).toBe(OPTIONS.expectedProjectRef);
    expect(n8nCallbackUrl(OPTIONS.expectedOrigin)).toBe(`${OPTIONS.expectedOrigin}/api/internal/n8n/events`);
  });
});
