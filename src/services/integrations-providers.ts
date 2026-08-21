import type {
  CapabilityKey,
  CapabilityStatus,
  IntegrationEvent,
  IntegrationRecord,
  ProviderId,
  WorkflowMapping,
} from "@/types";
import {
  CAPABILITY_LABELS,
  type CapabilityStatusEntry,
  type SystemHealthState,
} from "./integrations";

/**
 * Provider-level derivation. Vendor names live here.
 *
 * ── Who may import this ─────────────────────────────────────────────────────
 * Server code, and admin screens. Not a client-facing component — and the rule
 * is enforced by a test that walks the import graph from the business-facing
 * pages and fails if it reaches this file.
 *
 * That test exists because the failure is otherwise invisible. The functions
 * below and the label maps in `./integrations.ts` were one module, so
 * /connections importing a badge label was enough to put
 * `voice: ["vapi", "n8n", "model_provider"]` into a chunk that a business
 * owner's browser downloads. Nothing rendered it and no payload contained it;
 * it was simply readable in the source. Splitting the module means a page that
 * does not import this one cannot ship its contents, regardless of what the
 * bundler decides is reachable.
 *
 * A client-facing component that finds itself wanting something from here is
 * asking the wrong question: it wants `capabilities` from the dashboard
 * payload, which the server has already derived.
 */

// ── Dependencies ────────────────────────────────────────────────────────────

/**
 * Which providers a capability needs.
 *
 * Kept as a flat list rather than a graph: the real relationships are shallow,
 * and a dependency engine would be more machinery than the problem deserves.
 * What matters is that one provider failing degrades the right capability —
 * Twilio erroring shows the owner "SMS needs attention", never "Twilio".
 *
 * The automation engine is a dependency of every channel, because that is what
 * actually runs their workflows.
 */
export const CAPABILITY_DEPENDENCIES: Record<CapabilityKey, ProviderId[]> = {
  voice: ["vapi", "n8n", "model_provider"],
  sms: ["twilio", "n8n"],
  email: ["gmail", "n8n"],
  calendar: ["google_calendar", "n8n"],
  ai_receptionist: ["model_provider", "n8n"],
  knowledge: ["pinecone"],
};


// ── Client-facing capability status ─────────────────────────────────────────


const CAPABILITY_HINTS: Record<CapabilityKey, { down: string; missing: string; ok: string }> = {
  voice: {
    down: "Calls may not be answered until this is working again.",
    missing: "Set this up to let the receptionist answer calls.",
    ok: "Answering calls normally.",
  },
  sms: {
    down: "Text messages may not be delivered until this is working again.",
    missing: "Set this up to handle text messages.",
    ok: "Handling text messages normally.",
  },
  email: {
    down: "Email replies may be delayed until this is working again.",
    missing: "Set this up to handle customer email.",
    ok: "Handling email normally.",
  },
  calendar: {
    down: "New bookings may not reach your calendar until this is reconnected.",
    missing: "Connect a calendar before live appointment availability can be checked.",
    ok: "Bookings are syncing to your calendar.",
  },
  ai_receptionist: {
    down: "The receptionist may be unable to reply until this is working again.",
    missing: "Finish setup to bring the receptionist online.",
    ok: "Online and answering.",
  },
  knowledge: {
    down: "The receptionist may not be able to look up answers right now.",
    missing: "Add business knowledge so the receptionist can answer questions.",
    ok: "Answering from your business knowledge.",
  },
};

/** The worst state wins: a capability is only as good as its weakest dependency. */
function combine(records: IntegrationRecord[]): CapabilityStatus {
  if (records.length === 0) return "not_configured";
  if (records.some((r) => r.connection === "not_configured")) return "not_configured";
  if (records.some((r) => r.connection === "error" || r.connection === "disconnected")) return "needs_attention";
  if (records.some((r) => r.connection === "needs_attention")) return "needs_attention";
  if (records.some((r) => r.health === "down")) return "needs_attention";
  if (records.some((r) => r.connection === "connecting")) return "connecting";
  if (records.some((r) => r.health === "degraded")) return "needs_attention";
  return "connected";
}

export function getCapabilityStatus(records: IntegrationRecord[], key: CapabilityKey): CapabilityStatusEntry {
  const deps = CAPABILITY_DEPENDENCIES[key];
  const relevant = records.filter((r) => deps.includes(r.provider));
  const status = combine(relevant);
  const hints = CAPABILITY_HINTS[key];

  const detail =
    status === "connected"
      ? hints.ok
      : status === "connecting"
        ? "Finishing setup."
        : status === "not_configured"
          ? hints.missing
          : hints.down;

  return { key, label: CAPABILITY_LABELS[key], status, detail };
}

export function getCapabilityStatuses(records: IntegrationRecord[]): CapabilityStatusEntry[] {
  return (Object.keys(CAPABILITY_DEPENDENCIES) as CapabilityKey[]).map((key) => getCapabilityStatus(records, key));
}

// ── Admin health rollup ─────────────────────────────────────────────────────


export interface SystemHealthEntry {
  key: CapabilityKey | "workflow";
  label: string;
  state: SystemHealthState;
  /** Providers behind this row — admin surfaces only. */
  providers: ProviderId[];
}

const HEALTH_FROM_CAPABILITY: Record<CapabilityStatus, SystemHealthState> = {
  connected: "operational",
  connecting: "degraded",
  needs_attention: "degraded",
  not_configured: "not_configured",
  offline: "down",
};

/**
 * The admin overview. Deliberately coarse — a high-level card is the wrong
 * place for a raw provider error, so it says "degraded" and the detail lives
 * one click deeper.
 */
export function getSystemHealth(records: IntegrationRecord[]): SystemHealthEntry[] {
  const rows: SystemHealthEntry[] = (Object.keys(CAPABILITY_DEPENDENCIES) as CapabilityKey[]).map((key) => {
    const capability = getCapabilityStatus(records, key);
    const providers = CAPABILITY_DEPENDENCIES[key];
    const relevant = records.filter((r) => providers.includes(r.provider));
    const state: SystemHealthState =
      relevant.length > 0 && relevant.every((r) => r.connection === "disconnected" || r.connection === "not_configured")
        ? "down"
        : HEALTH_FROM_CAPABILITY[capability.status];
    return { key, label: CAPABILITY_LABELS[key], state, providers };
  });

  const engine = records.find((r) => r.provider === "n8n");
  rows.push({
    key: "workflow",
    label: "Workflow engine",
    state: !engine
      ? "not_configured"
      : engine.connection === "connected" && engine.health === "healthy"
        ? "operational"
        : engine.connection === "disconnected" || engine.connection === "not_configured"
          ? "down"
          : "degraded",
    providers: ["n8n"],
  });

  return rows;
}

/** A single word for the whole system, for headers and badges. */
export function getOverallHealth(records: IntegrationRecord[]): SystemHealthState {
  const states = getSystemHealth(records).map((r) => r.state);
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  if (states.every((s) => s === "not_configured")) return "not_configured";
  return "operational";
}

// ── Provider-level selectors (admin) ────────────────────────────────────────

export function getWorkspaceIntegrations(records: IntegrationRecord[], workspaceId: string): IntegrationRecord[] {
  return records.filter((r) => r.workspaceId === workspaceId);
}

export function getIntegration(records: IntegrationRecord[], id: string): IntegrationRecord | null {
  return records.find((r) => r.id === id) ?? null;
}

/** Which capabilities a given provider would take down with it. */
export function getAffectedCapabilities(provider: ProviderId): CapabilityKey[] {
  return (Object.keys(CAPABILITY_DEPENDENCIES) as CapabilityKey[]).filter((key) =>
    CAPABILITY_DEPENDENCIES[key].includes(provider)
  );
}

export function getProviderEvents(
  events: IntegrationEvent[],
  workspaceId: string,
  provider?: ProviderId
): IntegrationEvent[] {
  return events
    .filter((e) => e.workspaceId === workspaceId && (!provider || e.provider === provider))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getWorkflows(workflows: WorkflowMapping[], workspaceId: string): WorkflowMapping[] {
  return workflows.filter((w) => w.workspaceId === workspaceId);
}

