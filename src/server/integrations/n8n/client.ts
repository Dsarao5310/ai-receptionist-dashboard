import "server-only";

import type { NormalizedError } from "@/types";
import { serverEnv, type N8nMode } from "@/server/env";
import { credentialStore, n8nBaseUrl } from "@/server/integrations/credential-store";
import { instantFromProvider } from "@/services/adapters/provider-time";
import { parseOutboundResult, type OutboundEnvelope, type OutboundResult } from "./contract";
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./signing";

/**
 * The transport: one HTTP call to n8n, made safely.
 *
 * ── What "safely" means here, concretely ────────────────────────────────────
 *   • It always ends. Every request carries an `AbortSignal` with an explicit
 *     deadline, because a server action awaiting a hung socket holds a request,
 *     a connection and a person watching a spinner. There is no "no timeout"
 *     option — only a chosen one.
 *   • It is authenticated in a way that cannot be replayed. The body and a
 *     timestamp are signed together; see ./signing.ts.
 *   • It never returns something ambiguous. Every outcome — refusal, timeout,
 *     unreachable host, HTML error page where JSON was expected — leaves here
 *     as the same normalized shape, so no caller has to interpret an upstream
 *     error and none of them ever sees one.
 *
 * ── Three modes, none of them silent ────────────────────────────────────────
 * `simulated` is a real, deterministic engine that runs in-process: it lets the
 * whole orchestration path — signing, idempotency, state transitions, failure
 * handling — be exercised end to end without a live n8n. It is refused in
 * production by `assertProductionConfiguration`, so it can never become an
 * accidental deployment claiming automation that did not happen.
 */

export interface DispatchSuccess {
  outcome: "succeeded";
  result: OutboundResult;
  latencyMs: number;
}

export interface DispatchFailure {
  outcome: "failed";
  error: NormalizedError;
  latencyMs: number;
}

export type DispatchResult = DispatchSuccess | DispatchFailure;

function normalizedError(
  partial: Omit<NormalizedError, "provider" | "timestamp">,
  now: Date
): NormalizedError {
  return {
    ...partial,
    provider: "n8n",
    // Through the provider-time boundary like every other provider timestamp,
    // rather than stamping `new Date().toISOString()` directly. It costs
    // nothing and keeps the rule on the executed path.
    timestamp: instantFromProvider({ value: now.toISOString() }).toISOString(),
  };
}

/** Transport-level problems, in the vocabulary the rest of the app speaks. */
export const N8N_ERRORS = {
  notConfigured: (now: Date) =>
    normalizedError(
      {
        code: "n8n_not_configured",
        category: "configuration",
        severity: "warning",
        message: "Automation is not set up for this workspace yet.",
        adminDetail: "N8N_MODE is live but the base URL or signing credential is missing.",
        retryable: false,
      },
      now
    ),

  timeout: (ms: number, now: Date) =>
    normalizedError(
      {
        code: "n8n_timeout",
        category: "network",
        severity: "warning",
        message: "The automation service took too long to respond. Please try again.",
        adminDetail: `No response within ${ms}ms.`,
        // Retryable, and safe to retry *because* the idempotency key is stable:
        // a second attempt reaches the same operation rather than starting one.
        retryable: true,
      },
      now
    ),

  unreachable: (detail: string, now: Date) =>
    normalizedError(
      {
        code: "n8n_unreachable",
        category: "network",
        severity: "critical",
        message: "The automation service could not be reached. Please try again shortly.",
        adminDetail: detail,
        retryable: true,
      },
      now
    ),

  unauthorized: (status: number, now: Date) =>
    normalizedError(
      {
        code: "n8n_unauthorized",
        category: "auth",
        severity: "critical",
        message: "Automation is not authorised right now. Support has been notified.",
        adminDetail: `Workflow engine rejected the request signature (HTTP ${status}).`,
        // Retrying with the same rejected credential produces the same refusal.
        retryable: false,
      },
      now
    ),

  upstream: (status: number, now: Date) =>
    normalizedError(
      {
        code: "n8n_upstream_error",
        category: "provider",
        severity: "critical",
        message: "The automation service reported a problem. Please try again shortly.",
        adminDetail: `Workflow engine returned HTTP ${status}.`,
        retryable: status >= 500,
      },
      now
    ),

  malformed: (detail: string, now: Date) =>
    normalizedError(
      {
        code: "n8n_malformed_response",
        category: "provider",
        severity: "critical",
        message: "The automation service returned something unexpected.",
        adminDetail: `Response failed validation: ${detail}`,
        retryable: false,
      },
      now
    ),

  refused: (reason: string | undefined, now: Date) =>
    normalizedError(
      {
        code: "n8n_workflow_failed",
        category: "provider",
        severity: "warning",
        message: reason ?? "The automation step could not be completed.",
        adminDetail: "The workflow reported status: failed.",
        retryable: false,
      },
      now
    ),

  noMapping: (now: Date) =>
    normalizedError(
      {
        code: "workflow_not_mapped",
        category: "configuration",
        severity: "warning",
        message: "This action has no automation set up.",
        adminDetail: "No active workflow mapping exists for this operation in this workspace.",
        retryable: false,
      },
      now
    ),
} as const;

export interface DispatchInput {
  /** Path segment of the workflow, resolved by the server from a mapping. */
  workflowRef: string;
  envelope: OutboundEnvelope;
  now: Date;
}

/**
 * Send one envelope to one workflow.
 *
 * Note what this signature does *not* accept: a URL, a host, a header, or an
 * arbitrary body. A caller supplies an operation's envelope and a workflow
 * reference the server itself resolved. There is deliberately no
 * `post(url, payload)` in this module for anything else to reach for.
 */
export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  const mode: N8nMode = serverEnv.n8nMode;
  const started = Date.now();

  if (mode === "disabled") {
    return { outcome: "failed", error: N8N_ERRORS.notConfigured(input.now), latencyMs: 0 };
  }

  if (mode === "simulated") {
    const result = simulate(input);
    return result.outcome === "succeeded"
      ? { ...result, latencyMs: Date.now() - started }
      : { ...result, latencyMs: Date.now() - started };
  }

  const base = n8nBaseUrl();
  const secret = credentialStore.resolve("n8n", "request_signing_secret");
  if (!base || !secret) {
    return { outcome: "failed", error: N8N_ERRORS.notConfigured(input.now), latencyMs: 0 };
  }

  const body = JSON.stringify(input.envelope);
  const { signature, timestamp } = sign(body, secret, input.now);

  // Built from the configured base plus an encoded reference, so a reference
  // containing `../` or a scheme cannot navigate anywhere else. The URL is
  // never assembled from anything a client sent.
  const url = new URL(`webhook/${encodeURIComponent(input.workflowRef)}`, ensureTrailingSlash(base));

  const timeoutMs = serverEnv.n8nTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: String(timestamp),
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    const latencyMs = Date.now() - started;

    if (response.status === 401 || response.status === 403) {
      return { outcome: "failed", error: N8N_ERRORS.unauthorized(response.status, input.now), latencyMs };
    }
    if (!response.ok) {
      return { outcome: "failed", error: N8N_ERRORS.upstream(response.status, input.now), latencyMs };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // A proxy returning an HTML error page with a 200 is a real thing that
      // happens, and it must not be mistaken for a workflow that succeeded.
      return { outcome: "failed", error: N8N_ERRORS.malformed("body was not JSON", input.now), latencyMs };
    }

    const parsed = parseOutboundResult(payload);
    if (!parsed.ok) {
      return { outcome: "failed", error: N8N_ERRORS.malformed(parsed.error, input.now), latencyMs };
    }
    if (parsed.value.status === "failed") {
      return { outcome: "failed", error: N8N_ERRORS.refused(parsed.value.reason, input.now), latencyMs };
    }

    return { outcome: "succeeded", result: parsed.value, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      return { outcome: "failed", error: N8N_ERRORS.timeout(timeoutMs, input.now), latencyMs };
    }
    // Only the error's class name is kept. A fetch failure's message can carry
    // the full request URL, and the URL is infrastructure.
    const detail = error instanceof Error ? error.constructor.name : "unknown transport failure";
    return { outcome: "failed", error: N8N_ERRORS.unreachable(detail, input.now), latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

// ── Health ──────────────────────────────────────────────────────────────────

export interface ProbeResult {
  reachable: boolean;
  latencyMs: number;
  error: NormalizedError | null;
  /** Which engine answered. Admin diagnostics only. */
  mode: N8nMode;
}

/**
 * Is the workflow engine there?
 *
 * ── Non-destructive by construction ─────────────────────────────────────────
 * A `GET` to the engine's own health endpoint. It creates nothing, books
 * nothing, and messages nobody. A "test" that proved the integration worked by
 * running a real booking workflow would leave a fake customer and a fake
 * appointment in a real business's records every time an administrator clicked
 * it — which is why this deliberately does not exercise a workflow at all. What
 * it answers is "is the engine reachable and is our credential present", and
 * that is the honest scope of a health check.
 *
 * ── Deterministic ───────────────────────────────────────────────────────────
 * Same inputs, same answer. In `simulated` mode it reports healthy without a
 * socket; in `disabled` mode it reports a configuration problem rather than a
 * network one, because that is the truth.
 */
export async function probeHealth(now: Date): Promise<ProbeResult> {
  const mode = serverEnv.n8nMode;
  const started = Date.now();

  if (mode === "disabled") {
    return { reachable: false, latencyMs: 0, error: N8N_ERRORS.notConfigured(now), mode };
  }

  if (mode === "simulated") {
    return { reachable: true, latencyMs: 0, error: null, mode };
  }

  const base = n8nBaseUrl();
  if (!base || !credentialStore.isFullyConfigured("n8n")) {
    return { reachable: false, latencyMs: 0, error: N8N_ERRORS.notConfigured(now), mode };
  }

  const timeoutMs = serverEnv.n8nTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL("healthz", ensureTrailingSlash(base)), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;

    if (response.status === 401 || response.status === 403) {
      return { reachable: false, latencyMs, error: N8N_ERRORS.unauthorized(response.status, now), mode };
    }
    if (!response.ok) {
      return { reachable: false, latencyMs, error: N8N_ERRORS.upstream(response.status, now), mode };
    }
    return { reachable: true, latencyMs, error: null, mode };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      return { reachable: false, latencyMs, error: N8N_ERRORS.timeout(timeoutMs, now), mode };
    }
    const detail = error instanceof Error ? error.constructor.name : "unknown transport failure";
    return { reachable: false, latencyMs, error: N8N_ERRORS.unreachable(detail, now), mode };
  } finally {
    clearTimeout(timer);
  }
}

// ── The simulated engine ────────────────────────────────────────────────────

/**
 * A deterministic stand-in for n8n.
 *
 * Deterministic on purpose: an engine that failed one call in ten would make
 * every test flaky and every QA session unreproducible. Instead the *workflow
 * reference* decides — a reference containing `fail` always refuses, one
 * containing `timeout` always times out — so a test can choose an outcome by
 * choosing a mapping, and clicking around the seeded workspaces always behaves
 * the same way.
 *
 * It signs nothing and sends nothing. What it exercises is everything above the
 * socket: envelope construction, state transitions, idempotency, error
 * normalization and the audit trail.
 */
function simulate(input: DispatchInput): DispatchResult {
  const ref = input.workflowRef.toLowerCase();

  if (ref.includes("timeout")) {
    return { outcome: "failed", error: N8N_ERRORS.timeout(serverEnv.n8nTimeoutMs, input.now), latencyMs: 0 };
  }
  if (ref.includes("unauthorized")) {
    return { outcome: "failed", error: N8N_ERRORS.unauthorized(401, input.now), latencyMs: 0 };
  }
  if (ref.includes("fail")) {
    return {
      outcome: "failed",
      error: N8N_ERRORS.refused("The automation step could not be completed.", input.now),
      latencyMs: 0,
    };
  }

  return {
    outcome: "succeeded",
    // Derived from our own operation id rather than random, so a simulated run
    // is reproducible and the correlation shown to an admin is stable.
    result: { status: "succeeded", executionRef: `sim_${input.envelope.operationId}` },
    latencyMs: 0,
  };
}
