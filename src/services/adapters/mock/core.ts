import type { IntegrationCapabilityFlag, NormalizedError, ProviderId } from "@/types";
import { instantFromProvider } from "../provider-time";
import type { AdapterContext, IntegrationAdapter } from "../types";

/**
 * Shared behaviour for the mock provider adapters.
 *
 * Every provider gets its own thin adapter module so the boundary is real, but
 * the demo mechanics — how a connection progresses, what a test reports — are
 * defined once here rather than copied seven times.
 *
 * ── Deterministic by design ─────────────────────────────────────────────────
 * Test outcomes are a pure function of the record's current state. No randomness
 * anywhere: a flaky demo makes QA impossible to trust, and a "sometimes fails"
 * button teaches nobody anything.
 *
 * ── The timestamp boundary is exercised, not just documented ────────────────
 * These adapters do not stamp `new Date().toISOString()` directly. They build a
 * provider-shaped timestamp string — the way each real provider would actually
 * send one — and put it through `instantFromProvider`. That keeps the rule from
 * `services/README.md` on the executed path: if the normalization boundary ever
 * regressed, these adapters would break rather than quietly drift.
 */

/** How each provider expresses time on the wire, mirroring real payload shapes. */
export type ProviderTimeStyle =
  | { kind: "utc" }
  | { kind: "offset"; offsetMinutes: number }
  /** Bare wall-clock plus a stated zone — legal only because the zone comes with it. */
  | { kind: "zoned"; timeZone: string };

export interface MockProviderSpec {
  provider: ProviderId;
  timeStyle: ProviderTimeStyle;
  /** Config keys that must be `configured` before the provider can work at all. */
  requiredConfig: string[];
  /** Capability keys that only become available once fully connected. */
  capabilitiesWhenConnected: string[];
}

function pad(n: number, width = 2) {
  return String(Math.abs(n)).padStart(width, "0");
}

/**
 * Renders an instant the way this provider would put it on the wire, so the
 * adapter has something realistic to normalize back.
 */
export function renderProviderTimestamp(instant: Date, style: ProviderTimeStyle): { value: string; timeZone?: string } {
  if (style.kind === "utc") return { value: instant.toISOString() };

  if (style.kind === "offset") {
    const shifted = new Date(instant.getTime() + style.offsetMinutes * 60_000);
    const sign = style.offsetMinutes < 0 ? "-" : "+";
    const hh = pad(Math.trunc(style.offsetMinutes / 60));
    const mm = pad(style.offsetMinutes % 60);
    return { value: `${shifted.toISOString().slice(0, 19)}${sign}${hh}:${mm}` };
  }

  // A bare wall-clock reading, valid only because the provider also states its zone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: style.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    value: `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}:${get("second")}`,
    timeZone: style.timeZone,
  };
}

/** The provider's reported time, normalized to a canonical instant. */
function normalizedNow(now: Date, style: ProviderTimeStyle): string {
  const stamped = renderProviderTimestamp(now, style);
  return instantFromProvider(stamped).toISOString();
}

function missingConfig(ctx: AdapterContext, required: string[]): string[] {
  return required.filter((key) => ctx.record.config.find((c) => c.key === key)?.state !== "configured");
}

function errorFor(
  provider: ProviderId,
  timestamp: string,
  partial: Omit<NormalizedError, "provider" | "timestamp">
): NormalizedError {
  return { ...partial, provider, timestamp };
}

export function createMockAdapter(spec: MockProviderSpec): IntegrationAdapter {
  const capabilitiesFor = (ctx: AdapterContext, connected: boolean): IntegrationCapabilityFlag[] =>
    ctx.record.capabilities.map((cap) =>
      spec.capabilitiesWhenConnected.includes(cap.key) ? { ...cap, enabled: connected } : cap
    );

  return {
    provider: spec.provider,

    async connect(ctx) {
      const checked = normalizedNow(ctx.now, spec.timeStyle);
      return {
        connection: "connected",
        health: "healthy",
        lastCheckedAt: checked,
        lastSuccessfulSyncAt: checked,
        lastError: null,
        // Connecting marks previously unconfigured fields as configured. Real
        // adapters would learn these from the provider; none of them is a secret.
        config: ctx.record.config.map((field) =>
          field.state === "configured" ? field : { ...field, state: "configured" as const, value: field.sensitive ? undefined : field.value }
        ),
        capabilities: capabilitiesFor(ctx, true),
      };
    },

    async disconnect(ctx) {
      return {
        connection: "disconnected",
        health: "unknown",
        lastCheckedAt: normalizedNow(ctx.now, spec.timeStyle),
        // History is kept: the last successful sync still happened.
        lastError: null,
        config: ctx.record.config.map((field) => ({ ...field, state: "not_configured" as const, value: undefined })),
        capabilities: capabilitiesFor(ctx, false),
      };
    },

    async testConnection(ctx) {
      const checked = normalizedNow(ctx.now, spec.timeStyle);

      // A provider that was connected and has been dropped needs authorising
      // again — reporting its now-empty configuration as the problem would
      // describe a symptom rather than the cause.
      if (ctx.record.connection === "disconnected") {
        return {
          outcome: "authentication_required",
          health: "down",
          message: "Needs to be connected again before it can be checked.",
          error: errorFor(spec.provider, checked, {
            code: "not_connected",
            category: "auth",
            severity: "critical",
            message: "This connection needs to be authorised again.",
            adminDetail: "No active authorisation is stored for this workspace.",
            retryable: false,
          }),
        };
      }

      const missing = missingConfig(ctx, spec.requiredConfig);
      if (missing.length > 0 || ctx.record.connection === "not_configured") {
        const labels = missing.map((key) => ctx.record.config.find((c) => c.key === key)?.label ?? key);
        return {
          outcome: "configuration_incomplete",
          health: "down",
          message: labels.length > 0 ? `Not set up yet — still needs ${labels.join(" and ")}.` : "Not set up yet.",
          error: errorFor(spec.provider, checked, {
            code: "configuration_incomplete",
            category: "configuration",
            severity: "warning",
            message: "This connection is not finished being set up.",
            adminDetail: `Missing configuration: ${missing.join(", ") || "none recorded"}.`,
            retryable: false,
          }),
        };
      }

      // An existing fault decides the outcome, so the same button always gives
      // the same answer for the same state.
      switch (ctx.record.lastError?.category) {
        case "auth":
          return {
            outcome: "authentication_required",
            health: "down",
            message: "The provider rejected the stored authorisation.",
            error: { ...ctx.record.lastError, timestamp: checked },
          };
        case "permission":
          return {
            outcome: "permission_missing",
            health: "degraded",
            message: "Connected, but missing a permission it needs.",
            error: { ...ctx.record.lastError, timestamp: checked },
          };
        case "network":
          return {
            outcome: "unreachable",
            health: "down",
            message: "Could not reach the provider.",
            error: { ...ctx.record.lastError, timestamp: checked },
          };
        default:
          // Anything else — including a transient rate limit — clears on a
          // successful check. This is the recovery path.
          return { outcome: "healthy", health: "healthy", message: "Everything is responding normally.", error: null };
      }
    },

    getCapabilities(ctx) {
      return capabilitiesFor(ctx, ctx.record.connection === "connected");
    },
  };
}
