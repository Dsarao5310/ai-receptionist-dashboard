import "server-only";
import { productionConfigurationProblems } from "./production-config";

/**
 * Server configuration, validated in one place.
 *
 * ── Why this is a module and not scattered `process.env` reads ──────────────
 * A missing secret should be a startup failure with a name attached, not a
 * confusing runtime error three layers down — and a *placeholder* secret in
 * production should be impossible rather than merely unlikely. Every server
 * module reads configuration from here so there is exactly one place where
 * "is this deployable?" is decided.
 *
 * ── The credential model ────────────────────────────────────────────────────
 * Two database credentials, deliberately unequal:
 *
 *   • `DATABASE_URL` — the application runtime. The role behind it
 *     (`app_runtime`) has SELECT/INSERT/UPDATE/DELETE on schema `app` and
 *     nothing else: no DDL, no access to `auth` or `storage`, not a superuser,
 *     no BYPASSRLS.
 *   • `MIGRATION_DATABASE_URL` — schema changes and test setup only. The role
 *     behind it (`app_migrator`) owns schema `app`. The application never reads
 *     this variable; `db/client.ts` reads only the runtime one.
 *
 * There is no Supabase service-role key anywhere in this application, and no
 * `NEXT_PUBLIC_` database configuration. Nothing here is prefixed `NEXT_PUBLIC_`,
 * so none of it can be inlined into a browser bundle even by accident.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * The value Auth.js falls back to when no secret is configured.
 *
 * Named so it is obvious in a stack trace, and rejected outright in production
 * by `assertProductionConfiguration` — a deployment signing sessions with a
 * value published in this repository would be trivially forgeable.
 */
export const INSECURE_DEV_AUTH_SECRET = "development-only-insecure-secret-do-not-deploy";

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

/** Throws with the variable's name rather than returning something unusable. */
function require_(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(
      `Missing required server configuration: ${name}. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

export const serverEnv = {
  isProduction: IS_PRODUCTION,

  get authSecret(): string {
    return read("AUTH_SECRET") ?? INSECURE_DEV_AUTH_SECRET;
  },

  get authUrl(): string | undefined {
    return read("AUTH_URL") ?? read("NEXTAUTH_URL");
  },

  /** The least-privilege runtime connection. Required everywhere, including development. */
  get databaseUrl(): string {
    return require_("DATABASE_URL");
  },

  /** DDL connection. Only migrations and test setup may read this. */
  get migrationDatabaseUrl(): string {
    return require_("MIGRATION_DATABASE_URL");
  },

  get googleConfigured(): boolean {
    return Boolean(read("AUTH_GOOGLE_ID") && read("AUTH_GOOGLE_SECRET"));
  },

  get emailConfigured(): boolean {
    // Reserved for a future Auth.js adapter with durable verification tokens.
    // SMTP variables alone are deliberately not enough to expose a broken UI.
    return false;
  },

  // ── Customer email channel ───────────────────────────────────────────────
  // This is separate from Auth.js email sign-in. The current foundation has a
  // deterministic simulator only; live Gmail OAuth and mailbox watches remain
  // intentionally unavailable.
  get emailProviderMode(): ProviderMode {
    const raw = read("EMAIL_PROVIDER_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) {
      throw new Error(`EMAIL_PROVIDER_MODE must be one of disabled, simulated, live — received "${raw}".`);
    }
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  // ── Workflow orchestration ────────────────────────────────────────────────
  //
  // `N8N_MODE` is explicit rather than inferred from whether a URL happens to
  // be set, because "we quietly fell back to the simulator" is precisely the
  // failure this phase must not ship. Three honest states:
  //
  //   disabled  — no orchestration. Operations that would be handed to a
  //               workflow simply complete against the database, and nothing
  //               anywhere claims an external system was involved.
  //   simulated — a deterministic in-process engine. Development and tests
  //               only; `assertProductionConfiguration` refuses it in
  //               production, so it cannot become an accidental deployment.
  //   live      — real HTTP to a real n8n instance, requiring a base URL and
  //               both signing secrets.
  //
  // None of these is prefixed `NEXT_PUBLIC_`, so none can reach a browser
  // bundle even by accident.
  get n8nMode(): N8nMode {
    const raw = read("N8N_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) throw new Error(`N8N_MODE must be one of disabled, simulated, live — received "${raw}".`);
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  get n8nBaseUrl(): string | undefined {
    return read("N8N_BASE_URL");
  },

  /** Signs requests we send to n8n. Read only by the credential store. */
  get n8nRequestSigningSecret(): string | undefined {
    return read("N8N_REQUEST_SIGNING_SECRET");
  },

  /** Verifies requests n8n sends us. Read only by the credential store. */
  get n8nWebhookSigningSecret(): string | undefined {
    return read("N8N_WEBHOOK_SIGNING_SECRET");
  },

  /**
   * How long an outbound workflow call may take before it is abandoned.
   *
   * A server action that hangs holds a connection, a request, and a person
   * waiting for a spinner, so there is no such thing as "no timeout" here —
   * only a chosen one.
   */
  get n8nTimeoutMs(): number {
    const raw = read("N8N_TIMEOUT_MS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
  },

  // ── Provider secrets ──────────────────────────────────────────────────────
  //
  // The key that encrypts every stored OAuth token. Base64 of 32 random bytes:
  //   openssl rand -base64 32
  //
  // It is deliberately not derived from AUTH_SECRET. Those two protect
  // different things with different lifetimes — rotating a session secret
  // should log people out, not render every business's calendar connection
  // undecryptable.
  get credentialEncryptionKey(): string | undefined {
    return read("CREDENTIAL_ENCRYPTION_KEY");
  },

  // ── Google Calendar ───────────────────────────────────────────────────────
  //
  // Same three honest states as the workflow engine, for the same reason:
  //   disabled  — no calendar integration; the product says so.
  //   simulated — an in-process calendar for development and tests. Refused in
  //               production, so it can never claim a booking reached a real
  //               calendar when it did not.
  //   live      — real Google APIs, requiring an OAuth client.
  get googleCalendarMode(): ProviderMode {
    const raw = read("GOOGLE_CALENDAR_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) {
      throw new Error(`GOOGLE_CALENDAR_MODE must be one of disabled, simulated, live — received "${raw}".`);
    }
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  get googleClientId(): string | undefined {
    return read("GOOGLE_CALENDAR_CLIENT_ID");
  },

  get googleClientSecret(): string | undefined {
    return read("GOOGLE_CALENDAR_CLIENT_SECRET");
  },

  /**
   * Where Google sends the browser back after consent.
   *
   * Configured rather than derived from the request, because the redirect URI
   * has to match the one registered with Google exactly — and because deriving
   * it from a `Host` header would let that header choose where an authorization
   * code is delivered.
   */
  get googleRedirectUri(): string | undefined {
    return read("GOOGLE_CALENDAR_REDIRECT_URI");
  },

  get googleTimeoutMs(): number {
    const raw = read("GOOGLE_CALENDAR_TIMEOUT_MS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
  },

  // ── Twilio ────────────────────────────────────────────────────────────────
  //
  // The same three states, and the same refusal in production, for the same
  // reason: a simulated carrier that reported "sent" would be claiming a
  // customer received a text message that was never transmitted.
  get twilioMode(): ProviderMode {
    const raw = read("TWILIO_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) {
      throw new Error(`TWILIO_MODE must be one of disabled, simulated, live — received "${raw}".`);
    }
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  get twilioAccountSid(): string | undefined {
    return read("TWILIO_ACCOUNT_SID");
  },

  /**
   * The number this deployment sends from, in E.164.
   *
   * Configuration rather than a secret. It is also *not* the tenant mapping:
   * which workspace a number belongs to is a database row
   * (`provider_phone_numbers`), because one deployment may serve many numbers
   * and a single environment variable cannot express that.
   */
  get twilioPhoneNumber(): string | undefined {
    return read("TWILIO_PHONE_NUMBER");
  },

  /**
   * The exact public URL Twilio posts to.
   *
   * Configured rather than derived from the request, for a sharper reason than
   * Google's redirect URI: Twilio's signature is computed over the **full URL**
   * plus the sorted form parameters. Behind a tunnel, a proxy or a load
   * balancer the URL the server sees is not the URL Twilio signed, and
   * verification would fail for entirely legitimate requests. Reading it from
   * a `Host` header would also let that header change what gets verified.
   */
  get twilioPublicWebhookUrl(): string | undefined {
    return read("TWILIO_PUBLIC_WEBHOOK_URL");
  },

  /**
   * Where Twilio reports delivery outcomes.
   *
   * A separate URL from the inbound-message webhook, and therefore a separate
   * signed value: the signature covers whichever URL Twilio was told to call,
   * so verifying a status callback against the inbound URL would fail every
   * legitimate request. Falls back to the inbound URL only so a deployment that
   * genuinely uses one endpoint for both is not forced to set it twice.
   */
  get twilioStatusCallbackUrl(): string | undefined {
    return read("TWILIO_STATUS_CALLBACK_URL");
  },

  get twilioTimeoutMs(): number {
    const raw = read("TWILIO_TIMEOUT_MS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
  },

  // ── Vapi voice calls ─────────────────────────────────────────────────────
  //
  // The application foundation can be exercised with signed simulated events.
  // Live mode additionally requires the private API key, an independently
  // generated inbound bearer token, and the exact registered callback URL.
  get vapiMode(): ProviderMode {
    const raw = read("VAPI_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) {
      throw new Error(`VAPI_MODE must be one of disabled, simulated, live — received "${raw}".`);
    }
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  get vapiApiKey(): string | undefined {
    return read("VAPI_API_KEY");
  },

  get vapiPublicWebhookUrl(): string | undefined {
    return read("VAPI_PUBLIC_WEBHOOK_URL");
  },

  // ── Receptionist model provider ──────────────────────────────────────────
  //
  // Live generation is routed through Vercel AI Gateway so model choice,
  // cross-provider fallback, usage attribution, and data-handling policy stay
  // behind one server-only boundary. The simulator exercises the same bounded
  // application contract without network access or credentials.
  get modelProviderMode(): ProviderMode {
    const raw = read("MODEL_PROVIDER_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) {
      throw new Error(`MODEL_PROVIDER_MODE must be one of disabled, simulated, live — received "${raw}".`);
    }
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  get modelPrimaryId(): string | undefined {
    return read("MODEL_PRIMARY_ID");
  },

  get modelFallbackId(): string | undefined {
    return read("MODEL_FALLBACK_ID");
  },

  get modelTimeoutMs(): number {
    const raw = read("MODEL_TIMEOUT_MS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 30_000 ? parsed : 8_000;
  },

  get modelMaxInputTokens(): number {
    const raw = read("MODEL_MAX_INPUT_TOKENS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 256 && parsed <= 12_000 ? parsed : 6_000;
  },

  get modelMaxOutputTokens(): number {
    const raw = read("MODEL_MAX_OUTPUT_TOKENS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 64 && parsed <= 1_000 ? parsed : 350;
  },

  get modelMaxCostMicroUsd(): number {
    const raw = read("MODEL_MAX_COST_MICRO_USD");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 100_000 ? parsed : 10_000;
  },

  get modelGatewayAuthConfigured(): boolean {
    return Boolean(read("AI_GATEWAY_API_KEY") || read("VERCEL_OIDC_TOKEN"));
  },

  // ── Business Knowledge retrieval ────────────────────────────────────────
  // Live mode is deliberately unavailable in this foundation. Development
  // can exercise the exact tenant/sync contract with a deterministic simulator.
  get knowledgeProviderMode(): ProviderMode {
    const raw = read("KNOWLEDGE_PROVIDER_MODE");
    if (raw === "disabled" || raw === "simulated" || raw === "live") return raw;
    if (raw) {
      throw new Error(`KNOWLEDGE_PROVIDER_MODE must be one of disabled, simulated, live — received "${raw}".`);
    }
    return IS_PRODUCTION ? "disabled" : "simulated";
  },

  /**
   * The Pinecone index's data-plane host, e.g. `my-index-abc123.svc.pinecone.io`.
   * Not a secret — resolving an index by host (rather than by name, which
   * costs an extra `describeIndex` call) is Pinecone's own recommended
   * production pattern. One shared index; each workspace gets its own
   * namespace within it via the existing server-issued namespace mapping.
   */
  get pineconeIndexHost(): string | undefined {
    return read("PINECONE_INDEX_HOST");
  },

  // ── Privacy retention maintenance ───────────────────────────────────────
  // Disabled by default even in production. Enabling scheduled execution also
  // requires a dedicated bearer secret; it is never inferred from deployment.
  get privacyPurgeMode(): PrivacyPurgeMode {
    const raw = read("PRIVACY_PURGE_MODE");
    if (raw === "disabled" || raw === "scheduled") return raw;
    if (raw) throw new Error(`PRIVACY_PURGE_MODE must be disabled or scheduled — received "${raw}".`);
    return "disabled";
  },

  get cronSecret(): string | undefined {
    return read("CRON_SECRET");
  },
} as const;

export type N8nMode = "disabled" | "simulated" | "live";
export type ProviderMode = "disabled" | "simulated" | "live";
export type PrivacyPurgeMode = "disabled" | "scheduled";

/**
 * Refuse to run a production build with development configuration.
 *
 * Called from the database client's module scope, which every server request
 * path reaches — so a misconfigured production deployment fails on its first
 * request rather than quietly serving traffic with a forgeable session secret.
 */
export function assertProductionConfiguration(): void {
  if (!IS_PRODUCTION) return;
  const problems = productionConfigurationProblems(process.env);

  if (problems.length > 0) {
    throw new Error(`Refusing to start in production: ${problems.join("; ")}.`);
  }
}
