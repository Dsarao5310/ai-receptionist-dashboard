import "server-only";

import { serverEnv } from "@/server/env";
import type { ProviderId } from "@/types";

/**
 * Where provider secrets are resolved, and the only place they exist as values.
 *
 * ── The two questions, deliberately answered by different methods ───────────
 * "Is this configured?" is a question anyone with admin access may ask, and its
 * answer travels: it reaches an admin screen and is written to
 * `provider_credentials`. "What is it?" is a question only the module about to
 * make an authenticated request may ask, and its answer never leaves the
 * server.
 *
 * `describe()` answers the first. `resolve()` answers the second, and returns a
 * `Secret` rather than a string so that the answer cannot be logged, serialised
 * or returned by accident — see below.
 *
 * ── Rotation without touching the frontend ──────────────────────────────────
 * A credential is stored as a *reference* (`env:N8N_REQUEST_SIGNING_SECRET`),
 * never a value. Rotating means changing what the reference points at, or
 * repointing it at a different vault entry. The database row does not change
 * shape, no API response changes shape, and the frontend — which only ever sees
 * `configured` or `not_configured` — does not change at all.
 *
 * Environment variables are the backing store today because that is what this
 * deployment has. `resolveReference` is the seam: pointing `vault:` references
 * at a real secrets manager later is a new branch in one function.
 */

/**
 * A secret that refuses to render itself.
 *
 * Every accidental disclosure route runs through string conversion: a template
 * literal in a log line, `JSON.stringify` on an error object, a console dump
 * during debugging, an object spread into a response. Each of those calls one
 * of the methods below, and each of them returns `[redacted]`. Getting the real
 * value requires writing `.expose()`, which is greppable, and which reads at
 * the call site like the deliberate act it should be.
 *
 * The value lives in a `#private` field, so it is not enumerable, not
 * reachable by `Object.keys`, and invisible to structured cloning.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The real value. Only for the code that is about to authenticate with it. */
  expose(): string {
    return this.#value;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  /** `console.log` and Node's inspector go through this. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "[redacted]";
  }
}

/** What a credential is for, and where its value is kept. Never the value. */
export interface CredentialDescriptor {
  provider: ProviderId;
  key: string;
  label: string;
  /** Opaque pointer, e.g. `env:N8N_REQUEST_SIGNING_SECRET`. Safe to display. */
  reference: string;
}

/** The safe half: what an admin surface may be told. */
export interface CredentialStatus extends CredentialDescriptor {
  state: "configured" | "not_configured";
}

/**
 * The credentials this deployment knows how to resolve.
 *
 * Declared rather than discovered, so "which secrets does this application
 * expect?" is answerable by reading one list instead of grepping for
 * `process.env`.
 */
const CREDENTIALS: CredentialDescriptor[] = [
  {
    provider: "n8n",
    key: "request_signing_secret",
    label: "Outbound request signature",
    reference: "env:N8N_REQUEST_SIGNING_SECRET",
  },
  {
    provider: "n8n",
    key: "webhook_signing_secret",
    label: "Inbound webhook signature",
    reference: "env:N8N_WEBHOOK_SIGNING_SECRET",
  },
  {
    provider: "twilio",
    key: "auth_token",
    label: "Account auth token",
    // Twilio signs `X-Twilio-Signature` with the account auth token — an API
    // key secret cannot verify it. So this one credential authenticates both
    // directions, and a deployment missing it can send but can never trust
    // anything it receives.
    reference: "env:TWILIO_AUTH_TOKEN",
  },
];

function resolveReference(reference: string): string | undefined {
  const [scheme, name] = reference.split(":", 2);
  if (scheme !== "env" || !name) return undefined;
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export interface CredentialStore {
  /** Safe metadata for every credential this provider needs. */
  describe(provider: ProviderId): CredentialStatus[];
  /** The value, wrapped. Null when not configured — never an empty string. */
  resolve(provider: ProviderId, key: string): Secret | null;
  /** Whether every credential the provider needs is present. */
  isFullyConfigured(provider: ProviderId): boolean;
}

export const credentialStore: CredentialStore = {
  describe(provider) {
    return CREDENTIALS.filter((c) => c.provider === provider).map((c) => ({
      ...c,
      state: resolveReference(c.reference) ? "configured" : "not_configured",
    }));
  },

  resolve(provider, key) {
    const descriptor = CREDENTIALS.find((c) => c.provider === provider && c.key === key);
    if (!descriptor) return null;
    const value = resolveReference(descriptor.reference);
    return value ? new Secret(value) : null;
  },

  isFullyConfigured(provider) {
    const described = credentialStore.describe(provider);
    return described.length > 0 && described.every((c) => c.state === "configured");
  },
};

/**
 * Where n8n is, if anywhere.
 *
 * A base URL is configuration rather than a secret — it names a host, not a way
 * in — but it is resolved here beside the credentials so that "can we talk to
 * n8n at all?" has one answer. It is never returned to a browser: the endpoint
 * of the automation engine is infrastructure, and a client that knew it would
 * be one CORS policy away from calling it directly.
 */
export function n8nBaseUrl(): string | null {
  return serverEnv.n8nBaseUrl ?? null;
}
