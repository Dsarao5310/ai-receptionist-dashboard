/**
 * Pure production configuration validation.
 *
 * This module deliberately has no `server-only` import and no ambient reads at
 * module scope. The running application, unit tests, and the pre-deployment
 * command all call the same function, so deployment validation cannot drift
 * away from runtime validation.
 */

export type EnvironmentSource = Record<string, string | undefined>;

const ALLOWED_MODES = new Set(["disabled", "simulated", "live"]);
const PRODUCTION_SUPABASE_REF = "rkzwubwogtezqbuhieuo";
const STAGING_SUPABASE_REF = "jhkbsfsbnynysplvnwca";

function read(env: EnvironmentSource, name: string): string | undefined {
  const value = env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePublicHttpsUrl(
  problems: string[],
  name: string,
  value: string | undefined
): URL | null {
  if (!value) {
    problems.push(`${name} is not set`);
    return null;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") problems.push(`${name} must use HTTPS`);
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) {
      problems.push(`${name} must not use a local host`);
    }
    if (host.includes("ngrok")) problems.push(`${name} must not use ngrok in production`);
    if (url.username || url.password) problems.push(`${name} must not contain credentials`);
    return url;
  } catch {
    problems.push(`${name} is not a valid URL`);
    return null;
  }
}

function validateMode(problems: string[], env: EnvironmentSource, name: string): string | undefined {
  const mode = read(env, name);
  if (mode && !ALLOWED_MODES.has(mode)) {
    problems.push(`${name} must be one of disabled, simulated, live`);
  }
  return mode;
}

function validatePair(problems: string[], env: EnvironmentSource, first: string, second: string): boolean {
  const a = Boolean(read(env, first));
  const b = Boolean(read(env, second));
  if (a !== b) problems.push(`${first} and ${second} must be configured together`);
  return a && b;
}

function validateExactCallback(
  problems: string[],
  name: string,
  value: string | undefined,
  authOrigin: string | null,
  path: string
): void {
  const url = parsePublicHttpsUrl(problems, name, value);
  if (!url) return;
  if (url.pathname !== path || url.search || url.hash) {
    problems.push(`${name} must be exactly ${path} on the deployment origin`);
  }
  if (authOrigin && url.origin !== authOrigin) {
    problems.push(`${name} must use the same origin as AUTH_URL`);
  }
}

function databaseProjectRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const usernameParts = decodeURIComponent(url.username).split(".");
    if (usernameParts.length > 1) return usernameParts[usernameParts.length - 1] || null;
    const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return direct?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Returns every deployment blocker without exposing any configured value. */
export function productionConfigurationProblems(env: EnvironmentSource): string[] {
  const problems: string[] = [];

  const authSecret = read(env, "AUTH_SECRET");
  if (!authSecret) problems.push("AUTH_SECRET is not set");
  else if (authSecret === "development-only-insecure-secret-do-not-deploy") {
    problems.push("AUTH_SECRET is the development placeholder");
  } else if (authSecret.length < 32) {
    problems.push("AUTH_SECRET must contain at least 32 characters");
  }

  const authUrl = parsePublicHttpsUrl(problems, "AUTH_URL", read(env, "AUTH_URL") ?? read(env, "NEXTAUTH_URL"));
  let authOrigin: string | null = null;
  if (authUrl) {
    authOrigin = authUrl.origin;
    if ((authUrl.pathname !== "/" && authUrl.pathname !== "") || authUrl.search || authUrl.hash) {
      problems.push("AUTH_URL must be the canonical origin only, with no path, query, or fragment");
    }
  }

  const databaseUrl = read(env, "DATABASE_URL");
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set");
  } else {
    try {
      const url = new URL(databaseUrl);
      const username = decodeURIComponent(url.username).split(".")[0];
      if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
        problems.push("DATABASE_URL must be a Postgres connection string");
      }
      if (username !== "app_runtime") {
        problems.push("DATABASE_URL must authenticate as the least-privilege app_runtime role");
      }
    } catch {
      problems.push("DATABASE_URL is not a valid connection URL");
    }
  }

  const projectRef = databaseProjectRef(databaseUrl);
  const vercelEnvironment = read(env, "VERCEL_ENV");
  if (vercelEnvironment === "preview" && projectRef === PRODUCTION_SUPABASE_REF) {
    problems.push("Preview deployments must not use the production Supabase project");
  }
  if (vercelEnvironment === "production" && projectRef === STAGING_SUPABASE_REF) {
    problems.push("Production deployments must not use the staging Supabase project");
  }

  const googleAuthReady = validatePair(problems, env, "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET");
  if (!googleAuthReady) {
    problems.push("production requires Google sign-in via AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET");
  }

  // Auth.js email providers require durable verification-token persistence.
  // This repository intentionally has no Auth.js adapter yet, so accepting
  // SMTP configuration would advertise a sign-in path that fails at runtime.
  if (read(env, "EMAIL_SERVER") || read(env, "EMAIL_FROM")) {
    problems.push("email magic-link sign-in is disabled until a durable Auth.js adapter is implemented");
  }

  const emailProviderMode = validateMode(problems, env, "EMAIL_PROVIDER_MODE");
  if (emailProviderMode === "simulated") {
    problems.push("EMAIL_PROVIDER_MODE is simulated, which is development-only");
  }
  if (emailProviderMode === "live") {
    problems.push("live email is unavailable until Gmail OAuth and mailbox watches are implemented");
  }

  const n8nMode = validateMode(problems, env, "N8N_MODE");
  if (n8nMode === "simulated") problems.push("N8N_MODE is simulated, which is development-only");
  if (n8nMode === "live") {
    const baseUrl = read(env, "N8N_BASE_URL");
    const requestSecret = read(env, "N8N_REQUEST_SIGNING_SECRET");
    const webhookSecret = read(env, "N8N_WEBHOOK_SIGNING_SECRET");
    if (!requestSecret) problems.push("live n8n requires N8N_REQUEST_SIGNING_SECRET");
    else if (requestSecret.length < 32) problems.push("N8N_REQUEST_SIGNING_SECRET must contain at least 32 characters");
    if (!webhookSecret) problems.push("live n8n requires N8N_WEBHOOK_SIGNING_SECRET");
    else if (webhookSecret.length < 32) problems.push("N8N_WEBHOOK_SIGNING_SECRET must contain at least 32 characters");
    if (requestSecret && webhookSecret && requestSecret === webhookSecret) {
      problems.push("n8n inbound and outbound signing secrets must be different");
    }
    const timeout = read(env, "N8N_TIMEOUT_MS");
    if (timeout && (!/^\d+$/.test(timeout) || Number(timeout) <= 0)) {
      problems.push("N8N_TIMEOUT_MS must be a positive integer");
    }
    parsePublicHttpsUrl(problems, "N8N_BASE_URL", baseUrl);
  }

  const calendarMode = validateMode(problems, env, "GOOGLE_CALENDAR_MODE");
  if (calendarMode === "simulated") problems.push("GOOGLE_CALENDAR_MODE is simulated, which is development-only");
  if (calendarMode === "live") {
    if (!read(env, "CREDENTIAL_ENCRYPTION_KEY")) problems.push("live Google Calendar requires CREDENTIAL_ENCRYPTION_KEY");
    validatePair(problems, env, "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET");
    if (!read(env, "GOOGLE_CALENDAR_CLIENT_ID") || !read(env, "GOOGLE_CALENDAR_CLIENT_SECRET")) {
      problems.push("live Google Calendar requires its OAuth client");
    }
    validateExactCallback(
      problems,
      "GOOGLE_CALENDAR_REDIRECT_URI",
      read(env, "GOOGLE_CALENDAR_REDIRECT_URI"),
      authOrigin,
      "/api/admin/calendar/callback"
    );
  }

  const twilioMode = validateMode(problems, env, "TWILIO_MODE");
  if (twilioMode === "simulated") problems.push("TWILIO_MODE is simulated, which is development-only");
  if (twilioMode === "live") {
    if (!read(env, "TWILIO_ACCOUNT_SID")) problems.push("live Twilio requires TWILIO_ACCOUNT_SID");
    if (!read(env, "TWILIO_AUTH_TOKEN")) problems.push("live Twilio requires TWILIO_AUTH_TOKEN");
    validateExactCallback(
      problems,
      "TWILIO_PUBLIC_WEBHOOK_URL",
      read(env, "TWILIO_PUBLIC_WEBHOOK_URL"),
      authOrigin,
      "/api/internal/twilio/sms"
    );
    validateExactCallback(
      problems,
      "TWILIO_STATUS_CALLBACK_URL",
      read(env, "TWILIO_STATUS_CALLBACK_URL"),
      authOrigin,
      "/api/internal/twilio/status"
    );
  }

  const vapiMode = validateMode(problems, env, "VAPI_MODE");
  if (vapiMode === "simulated") problems.push("VAPI_MODE is simulated, which is development-only");
  if (vapiMode === "live") {
    if (!read(env, "VAPI_API_KEY")) problems.push("live Vapi requires VAPI_API_KEY");
    const webhookToken = read(env, "VAPI_WEBHOOK_BEARER_TOKEN");
    if (!webhookToken) problems.push("live Vapi requires VAPI_WEBHOOK_BEARER_TOKEN");
    else if (webhookToken.length < 32) {
      problems.push("VAPI_WEBHOOK_BEARER_TOKEN must contain at least 32 characters");
    }
    validateExactCallback(
      problems,
      "VAPI_PUBLIC_WEBHOOK_URL",
      read(env, "VAPI_PUBLIC_WEBHOOK_URL"),
      authOrigin,
      "/api/internal/vapi/events"
    );
  }

  const modelProviderMode = validateMode(problems, env, "MODEL_PROVIDER_MODE");
  if (modelProviderMode === "simulated") {
    problems.push("MODEL_PROVIDER_MODE is simulated, which is development-only");
  }
  if (modelProviderMode === "live") {
    if (!read(env, "AI_GATEWAY_API_KEY") && !read(env, "VERCEL_OIDC_TOKEN")) {
      problems.push("live model provider requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN");
    }
    const primary = read(env, "MODEL_PRIMARY_ID");
    const fallback = read(env, "MODEL_FALLBACK_ID");
    const allowedModels = new Set(["openai/gpt-5.4-mini", "anthropic/claude-haiku-4.5"]);
    if (!primary) problems.push("live model provider requires MODEL_PRIMARY_ID");
    else if (!allowedModels.has(primary)) problems.push("MODEL_PRIMARY_ID is not in the approved receptionist model allowlist");
    if (!fallback) problems.push("live model provider requires MODEL_FALLBACK_ID");
    else if (!allowedModels.has(fallback)) problems.push("MODEL_FALLBACK_ID is not in the approved receptionist model allowlist");
    if (primary && fallback && primary === fallback) {
      problems.push("MODEL_PRIMARY_ID and MODEL_FALLBACK_ID must be different");
    }

    const integerPolicy: Array<[string, number, number]> = [
      ["MODEL_TIMEOUT_MS", 1_000, 30_000],
      ["MODEL_MAX_INPUT_TOKENS", 256, 12_000],
      ["MODEL_MAX_OUTPUT_TOKENS", 64, 1_000],
      ["MODEL_MAX_COST_MICRO_USD", 1_000, 100_000],
    ];
    for (const [name, min, max] of integerPolicy) {
      const value = read(env, name);
      if (value && (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)) {
        problems.push(`${name} must be an integer between ${min} and ${max}`);
      }
    }
  }

  const privacyPurgeMode = read(env, "PRIVACY_PURGE_MODE") ?? "disabled";
  if (privacyPurgeMode !== "disabled" && privacyPurgeMode !== "scheduled") {
    problems.push("PRIVACY_PURGE_MODE must be disabled or scheduled");
  }
  if (privacyPurgeMode === "scheduled") {
    const cronSecret = read(env, "CRON_SECRET");
    if (!cronSecret) problems.push("scheduled privacy purge requires CRON_SECRET");
    else if (cronSecret.length < 32) problems.push("CRON_SECRET must contain at least 32 characters");
  }

  if (
    vercelEnvironment === "preview" &&
    [n8nMode, calendarMode, twilioMode, vapiMode, modelProviderMode, emailProviderMode].includes("live") &&
    read(env, "VERCEL_GIT_COMMIT_REF") !== "staging"
  ) {
    problems.push("live providers in Preview are restricted to the staging branch");
  }

  return [...new Set(problems)];
}
