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
    VAPI_MODE: "disabled",
    MODEL_PROVIDER_MODE: "disabled",
    KNOWLEDGE_PROVIDER_MODE: "disabled",
    EMAIL_PROVIDER_MODE: "disabled",
    PRIVACY_PURGE_MODE: "disabled",
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
      valid({ N8N_MODE: "simulated", GOOGLE_CALENDAR_MODE: "simulated", TWILIO_MODE: "simulated", VAPI_MODE: "simulated", MODEL_PROVIDER_MODE: "simulated", KNOWLEDGE_PROVIDER_MODE: "simulated", EMAIL_PROVIDER_MODE: "simulated", EMAIL_SERVER: "smtp://mail", EMAIL_FROM: "hello@example.com" })
    );
    expect(problems).toContain("N8N_MODE is simulated, which is development-only");
    expect(problems).toContain("GOOGLE_CALENDAR_MODE is simulated, which is development-only");
    expect(problems).toContain("TWILIO_MODE is simulated, which is development-only");
    expect(problems).toContain("VAPI_MODE is simulated, which is development-only");
    expect(problems).toContain("MODEL_PROVIDER_MODE is simulated, which is development-only");
    expect(problems).toContain("KNOWLEDGE_PROVIDER_MODE is simulated, which is development-only");
    expect(problems).toContain("EMAIL_PROVIDER_MODE is simulated, which is development-only");
    expect(problems).toContain("email magic-link sign-in is disabled until a durable Auth.js adapter is implemented");
  });

  it("fails closed when live customer email is requested before Gmail OAuth and watches exist", () => {
    expect(productionConfigurationProblems(valid({ EMAIL_PROVIDER_MODE: "live" }))).toContain(
      "live email is unavailable until Gmail OAuth and mailbox watches are implemented"
    );
  });

  it("requires complete live Pinecone credentials", () => {
    const incomplete = productionConfigurationProblems(valid({ KNOWLEDGE_PROVIDER_MODE: "live" }));
    expect(incomplete).toContain("live Business Knowledge requires PINECONE_API_KEY");
    expect(incomplete).toContain("live Business Knowledge requires PINECONE_INDEX_HOST");

    expect(
      productionConfigurationProblems(
        valid({
          KNOWLEDGE_PROVIDER_MODE: "live",
          PINECONE_API_KEY: "private-pinecone-api-key",
          PINECONE_INDEX_HOST: "ai-receptionist-knowledge-staging-0b2bbjx.svc.aped-4627-b74a.pinecone.io",
        })
      )
    ).toEqual([]);
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

  it("requires complete live Vapi credentials and the canonical callback", () => {
    const incomplete = productionConfigurationProblems(
      valid({
        VAPI_MODE: "live",
        VAPI_WEBHOOK_BEARER_TOKEN: "short",
        VAPI_PUBLIC_WEBHOOK_URL: "https://other.example.com/vapi",
      })
    );
    expect(incomplete).toContain("live Vapi requires VAPI_API_KEY");
    expect(incomplete).toContain("VAPI_WEBHOOK_BEARER_TOKEN must contain at least 32 characters");
    expect(incomplete).toContain("VAPI_PUBLIC_WEBHOOK_URL must be exactly /api/internal/vapi/events on the deployment origin");

    expect(
      productionConfigurationProblems(
        valid({
          VAPI_MODE: "live",
          VAPI_API_KEY: "private-vapi-api-key",
          VAPI_WEBHOOK_BEARER_TOKEN: "vapi-webhook-token-with-32-characters",
          VAPI_PUBLIC_WEBHOOK_URL: "https://app.example.com/api/internal/vapi/events",
        })
      )
    ).toEqual([]);
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

  it("requires approved distinct models, gateway auth, and bounded live policy", () => {
    const incomplete = productionConfigurationProblems(valid({
      MODEL_PROVIDER_MODE: "live",
      MODEL_PRIMARY_ID: "other/unknown",
      MODEL_FALLBACK_ID: "other/unknown",
      MODEL_TIMEOUT_MS: "999",
      MODEL_MAX_COST_MICRO_USD: "100001",
    }));
    expect(incomplete).toContain("live model provider requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN");
    expect(incomplete).toContain("MODEL_PRIMARY_ID is not in the approved receptionist model allowlist");
    expect(incomplete).toContain("MODEL_FALLBACK_ID is not in the approved receptionist model allowlist");
    expect(incomplete).toContain("MODEL_PRIMARY_ID and MODEL_FALLBACK_ID must be different");
    expect(incomplete).toContain("MODEL_TIMEOUT_MS must be an integer between 1000 and 30000");
    expect(incomplete).toContain("MODEL_MAX_COST_MICRO_USD must be an integer between 1000 and 100000");

    expect(productionConfigurationProblems(valid({
      MODEL_PROVIDER_MODE: "live",
      AI_GATEWAY_API_KEY: "private-gateway-key",
      MODEL_PRIMARY_ID: "openai/gpt-5.4-mini",
      MODEL_FALLBACK_ID: "anthropic/claude-haiku-4.5",
      MODEL_TIMEOUT_MS: "8000",
      MODEL_MAX_INPUT_TOKENS: "6000",
      MODEL_MAX_OUTPUT_TOKENS: "350",
      MODEL_MAX_COST_MICRO_USD: "10000",
    }))).toEqual([]);
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

  it("keeps privacy purge disabled by default and requires a dedicated strong cron secret", () => {
    expect(productionConfigurationProblems(valid({ PRIVACY_PURGE_MODE: undefined }))).toEqual([]);

    const missing = productionConfigurationProblems(valid({ PRIVACY_PURGE_MODE: "scheduled" }));
    expect(missing).toContain("scheduled privacy purge requires CRON_SECRET");

    const short = productionConfigurationProblems(valid({ PRIVACY_PURGE_MODE: "scheduled", CRON_SECRET: "short" }));
    expect(short).toContain("CRON_SECRET must contain at least 32 characters");

    expect(productionConfigurationProblems(valid({
      PRIVACY_PURGE_MODE: "scheduled",
      CRON_SECRET: "privacy-cron-secret-with-32-characters",
    }))).toEqual([]);
  });
});
