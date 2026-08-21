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

  const n8nMode = validateMode(problems, env, "N8N_MODE");
  if (n8nMode === "simulated") problems.push("N8N_MODE is simulated, which is development-only");
  if (n8nMode === "live") {
    const baseUrl = read(env, "N8N_BASE_URL");
    if (!read(env, "N8N_REQUEST_SIGNING_SECRET")) problems.push("live n8n requires N8N_REQUEST_SIGNING_SECRET");
    if (!read(env, "N8N_WEBHOOK_SIGNING_SECRET")) problems.push("live n8n requires N8N_WEBHOOK_SIGNING_SECRET");
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

  return [...new Set(problems)];
}
