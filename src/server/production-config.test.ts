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
});
