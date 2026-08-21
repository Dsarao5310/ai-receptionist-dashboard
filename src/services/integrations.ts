import type {
  IntegrationConfigField,
  CapabilityKey,
  CapabilityStatus,
  HealthStatus,
  IntegrationRecord,
} from "@/types";

/**
 * The client-safe half of the integration vocabulary.
 *
 * ── The line this file draws ────────────────────────────────────────────────
 * Above it: Voice, SMS, Email, Calendar, AI Receptionist, Business Knowledge —
 * what a business owner understands. Below it, in
 * `./integrations-providers.ts`: Vapi, Twilio, Gmail, Google Calendar, n8n,
 * Pinecone — an administrator's concern.
 *
 * Everything here is safe to import from a client-facing component. Nothing
 * here names a vendor, and nothing here imports a module that does.
 *
 * ── Why the split exists ────────────────────────────────────────────────────
 * These label maps and the vendor-bearing derivations were one module, and the
 * consequence was invisible in the source: /connections imports a badge label,
 * the bundler pulls in the module the label lives in, and a business owner's
 * browser downloads a chunk containing the list of providers behind each
 * capability. The rendered page never showed it and the page payload never
 * carried it — but anyone who opened the JavaScript could read it.
 *
 * A page's *payload* and a page's *bundle* are two different disclosures, and
 * only the first was being checked. Splitting the module fixes the second
 * structurally, rather than relying on a bundler to eliminate a constant it has
 * no reason to think is dead.
 */

/** Business-facing names for the capabilities. Never a vendor. */
export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  voice: "Voice",
  sms: "SMS",
  email: "Email",
  calendar: "Calendar",
  ai_receptionist: "AI Receptionist",
  knowledge: "Business Knowledge",
};

/**
 * What a business user is told about one capability.
 *
 * Derived on the server from the provider records and passed down already
 * resolved — which is why a client component never needs the records, and why
 * this type can live on the safe side of the line.
 */
export interface CapabilityStatusEntry {
  key: CapabilityKey;
  label: string;
  status: CapabilityStatus;
  /** One sentence, safe for a business audience. Never names a provider. */
  detail: string;
}

export type SystemHealthState = "operational" | "degraded" | "down" | "not_configured";

// ── Presentation helpers ────────────────────────────────────────────────────

export const CONNECTION_LABELS: Record<IntegrationRecord["connection"], string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  needs_attention: "Needs attention",
  error: "Error",
  not_configured: "Not configured",
};

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  needs_attention: "Needs attention",
  not_configured: "Not set up",
  offline: "Offline",
};

export const SYSTEM_HEALTH_LABELS: Record<SystemHealthState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  not_configured: "Not configured",
};

/**
 * Strip the value from any configuration line marked sensitive.
 *
 * The frontend may know *that* an API credential is configured, never what it
 * is. This runs on every write into `integration_records.config`, and the
 * database independently refuses a row where a sensitive field still carries a
 * value (see `config_has_no_sensitive_values`). Two refusals, because this is
 * the boundary that matters most: these rows are one join away from an admin
 * screen.
 *
 * It lives here rather than in the repository so the seed and any future
 * ingestion path can reuse it without importing a server-only module.
 */
export function sanitizeConfig(config: IntegrationConfigField[]): IntegrationConfigField[] {
  return config.map((field) => {
    if (!field.sensitive) return field;
    // Rebuilt without `value` rather than deleted from a copy, so the property
    // cannot survive as `undefined` and be serialised back in.
    const safe: IntegrationConfigField = {
      key: field.key,
      label: field.label,
      state: field.state,
      sensitive: true,
    };
    return safe;
  });
}
