import type { EnvironmentSource } from "./production-config";

export const N8N_CERTIFICATION_OPERATIONS = [
  "appointment.reschedule",
  "appointment.cancel",
  "customer.message",
  "business.sync",
] as const;

const PRODUCTION_SUPABASE_REF = "rkzwubwogtezqbuhieuo";
const TEMPORARY_HOST_MARKERS = ["ngrok", "trycloudflare.com", "loca.lt", "localtunnel"];

export interface N8nPreflightOptions {
  workspaceId: string;
  expectedOrigin: string;
  expectedProjectRef: string;
}

export interface N8nMappingRow {
  operation: string | null;
  capability: string;
  environment: string;
  status: string;
}

function read(env: EnvironmentSource, name: string): string | undefined {
  const value = env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function publicHttpsOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) {
      return null;
    }
    if (TEMPORARY_HOST_MARKERS.some((marker) => host.includes(marker))) return null;
    return url;
  } catch {
    return null;
  }
}

export function databaseProjectRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const usernameParts = decodeURIComponent(url.username).split(".");
    if (usernameParts.length > 1) return usernameParts.at(-1) || null;
    return /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function n8nConfigurationProblems(
  env: EnvironmentSource,
  options: N8nPreflightOptions
): string[] {
  const problems: string[] = [];
  const expectedOrigin = publicHttpsOrigin(options.expectedOrigin);
  if (!options.workspaceId.trim()) problems.push("--workspace is required");
  if (!expectedOrigin || expectedOrigin.pathname !== "/" || expectedOrigin.search || expectedOrigin.hash) {
    problems.push("--expected-origin must be a stable public HTTPS origin with no path");
  }
  if (!/^[a-z0-9]{20}$/i.test(options.expectedProjectRef)) {
    problems.push("--expected-project-ref must be a Supabase project reference");
  }
  if (options.expectedProjectRef === PRODUCTION_SUPABASE_REF) {
    problems.push("the production Supabase project cannot be used for n8n staging certification");
  }

  if (read(env, "N8N_MODE") !== "live") problems.push("N8N_MODE must be live");

  const authUrl = publicHttpsOrigin(read(env, "AUTH_URL") ?? read(env, "NEXTAUTH_URL"));
  if (!authUrl || authUrl.pathname !== "/" || authUrl.search || authUrl.hash) {
    problems.push("AUTH_URL must be a stable public HTTPS origin with no path");
  } else if (expectedOrigin && authUrl.origin !== expectedOrigin.origin) {
    problems.push("AUTH_URL does not match --expected-origin");
  }

  if (!publicHttpsOrigin(read(env, "N8N_BASE_URL"))) {
    problems.push("N8N_BASE_URL must be a permanent public HTTPS URL");
  }

  const requestSecret = read(env, "N8N_REQUEST_SIGNING_SECRET");
  const webhookSecret = read(env, "N8N_WEBHOOK_SIGNING_SECRET");
  if (!requestSecret || requestSecret.length < 32) {
    problems.push("N8N_REQUEST_SIGNING_SECRET must contain at least 32 characters");
  }
  if (!webhookSecret || webhookSecret.length < 32) {
    problems.push("N8N_WEBHOOK_SIGNING_SECRET must contain at least 32 characters");
  }
  if (requestSecret && webhookSecret && requestSecret === webhookSecret) {
    problems.push("n8n inbound and outbound signing secrets must be different");
  }

  const timeout = read(env, "N8N_TIMEOUT_MS");
  if (timeout && (!/^\d+$/.test(timeout) || Number(timeout) <= 0)) {
    problems.push("N8N_TIMEOUT_MS must be a positive integer");
  }

  const databaseUrl = read(env, "DATABASE_URL");
  if (!databaseUrl) {
    problems.push("DATABASE_URL is required");
  } else {
    try {
      const url = new URL(databaseUrl);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) {
        problems.push("DATABASE_URL must be a Postgres connection string");
      }
      if (decodeURIComponent(url.username).split(".")[0] !== "app_runtime") {
        problems.push("DATABASE_URL must authenticate as app_runtime");
      }
    } catch {
      problems.push("DATABASE_URL is not a valid connection URL");
    }
    if (databaseProjectRef(databaseUrl) !== options.expectedProjectRef) {
      problems.push("DATABASE_URL does not use --expected-project-ref");
    }
  }

  const vercelEnvironment = read(env, "VERCEL_ENV");
  if (vercelEnvironment && vercelEnvironment !== "preview") {
    problems.push("n8n staging certification requires VERCEL_ENV=preview");
  }
  const branch = read(env, "VERCEL_GIT_COMMIT_REF");
  if (branch && branch !== "staging") {
    problems.push("n8n staging certification requires the staging Git branch");
  }

  return [...new Set(problems)];
}

export function n8nMappingProblems(rows: N8nMappingRow[]): string[] {
  const active = rows.filter((row) => row.status === "active");
  const problems: string[] = [];
  for (const operation of N8N_CERTIFICATION_OPERATIONS) {
    if (!active.some((row) => row.operation === operation)) {
      problems.push(`missing active mapping for ${operation}`);
    }
  }
  if (!active.some((row) => row.operation === null && row.capability === "voice")) {
    problems.push("missing active voice mapping for signed inbound booking events");
  }
  if (active.some((row) => row.environment !== "staging")) {
    problems.push("every active certification mapping must be marked staging");
  }
  return problems;
}

export function n8nCallbackUrl(expectedOrigin: string): string {
  return new URL("/api/internal/n8n/events", expectedOrigin).toString();
}
