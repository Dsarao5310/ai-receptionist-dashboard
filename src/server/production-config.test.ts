import { describe, expect, it } from "vitest";
import { productionConfigurationProblems, type EnvironmentSource } from "./production-config";

function valid(overrides: EnvironmentSource = {}): EnvironmentSource {
  return {
    AUTH_SECRET: "a-production-secret-with-more-than-32-characters",
    AUTH_URL: "https://app.example.com",
    AUTH_GOOGLE_ID: "google-client-id",
    AUTH_GOOGLE_SECRET: "google-client-secret",
    DATABASE_URL: "postgresql://app_runtime.project:password@pooler.example.com:6543/postgres",
    N8N_MODE: "disabled",
    GOOGLE_CALENDAR_MODE: "disabled",
    TWILIO_MODE: "disabled",
    ...overrides,
  };
}

describe("production configuration", () => {
  it("accepts the fail-closed deployment foundation", () => {
    expect(productionConfigurationProblems(valid())).toEqual([]);
  });

  it("requires a canonical HTTPS origin, a strong secret, and the runtime role", () => {
    const problems = productionConfigurationProblems(
      valid({ AUTH_SECRET: "short", AUTH_URL: "http://localhost:3000/api/auth", DATABASE_URL: "postgres://postgres:x@db/x" })
    );
    expect(problems).toContain("AUTH_SECRET must contain at least 32 characters");
    expect(problems).toContain("AUTH_URL must use HTTPS");
    expect(problems).toContain("AUTH_URL must not use a local host");
    expect(problems).toContain("AUTH_URL must be the canonical origin only, with no path, query, or fragment");
    expect(problems).toContain("DATABASE_URL must authenticate as the least-privilege app_runtime role");
  });

  it("refuses development providers and the unbacked email magic-link path", () => {
    const problems = productionConfigurationProblems(
      valid({ N8N_MODE: "simulated", GOOGLE_CALENDAR_MODE: "simulated", TWILIO_MODE: "simulated", EMAIL_SERVER: "smtp://mail", EMAIL_FROM: "hello@example.com" })
    );
    expect(problems).toContain("N8N_MODE is simulated, which is development-only");
    expect(problems).toContain("GOOGLE_CALENDAR_MODE is simulated, which is development-only");
    expect(problems).toContain("TWILIO_MODE is simulated, which is development-only");
    expect(problems).toContain("email magic-link sign-in is disabled until a durable Auth.js adapter is implemented");
  });

  it("pins live callback routes to the canonical deployment origin", () => {
    const problems = productionConfigurationProblems(
      valid({
        GOOGLE_CALENDAR_MODE: "live",
        GOOGLE_CALENDAR_CLIENT_ID: "calendar-id",
        GOOGLE_CALENDAR_CLIENT_SECRET: "calendar-secret",
        CREDENTIAL_ENCRYPTION_KEY: "key",
        GOOGLE_CALENDAR_REDIRECT_URI: "https://other.example.com/wrong",
      })
    );
    expect(problems).toContain("GOOGLE_CALENDAR_REDIRECT_URI must be exactly /api/admin/calendar/callback on the deployment origin");
    expect(problems).toContain("GOOGLE_CALENDAR_REDIRECT_URI must use the same origin as AUTH_URL");
  });

  it("requires a complete Google sign-in provider pair", () => {
    const problems = productionConfigurationProblems(valid({ AUTH_GOOGLE_SECRET: undefined }));
    expect(problems).toContain("AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be configured together");
    expect(problems).toContain("production requires Google sign-in via AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET");
  });

  it("requires strong independent n8n secrets and a positive timeout", () => {
    const problems = productionConfigurationProblems(
      valid({
        N8N_MODE: "live",
        N8N_BASE_URL: "https://automation.example.com",
        N8N_REQUEST_SIGNING_SECRET: "same-short-secret",
        N8N_WEBHOOK_SIGNING_SECRET: "same-short-secret",
        N8N_TIMEOUT_MS: "0",
      })
    );
    expect(problems).toContain("N8N_REQUEST_SIGNING_SECRET must contain at least 32 characters");
    expect(problems).toContain("N8N_WEBHOOK_SIGNING_SECRET must contain at least 32 characters");
    expect(problems).toContain("n8n inbound and outbound signing secrets must be different");
    expect(problems).toContain("N8N_TIMEOUT_MS must be a positive integer");
  });

  it("rejects production and staging database cross-wiring", () => {
    const previewProblems = productionConfigurationProblems(
      valid({
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://app_runtime.rkzwubwogtezqbuhieuo:x@pooler.example.com:6543/postgres",
      })
    );
    expect(previewProblems).toContain("Preview deployments must not use the production Supabase project");

    const productionProblems = productionConfigurationProblems(
      valid({
        VERCEL_ENV: "production",
        DATABASE_URL: "postgresql://app_runtime.jhkbsfsbnynysplvnwca:x@pooler.example.com:6543/postgres",
      })
    );
    expect(productionProblems).toContain("Production deployments must not use the staging Supabase project");
  });

  it("allows live providers only on the dedicated staging Preview branch", () => {
    const common = {
      VERCEL_ENV: "preview",
      N8N_MODE: "live",
      N8N_BASE_URL: "https://automation.example.com",
      N8N_REQUEST_SIGNING_SECRET: "request-signing-secret-with-32-characters",
      N8N_WEBHOOK_SIGNING_SECRET: "webhook-signing-secret-with-32-characters",
    };
    expect(
      productionConfigurationProblems(valid({ ...common, VERCEL_GIT_COMMIT_REF: "feature/demo" }))
    ).toContain("live providers in Preview are restricted to the staging branch");
    expect(
      productionConfigurationProblems(valid({ ...common, VERCEL_GIT_COMMIT_REF: "staging" }))
    ).not.toContain("live providers in Preview are restricted to the staging branch");
  });
});
