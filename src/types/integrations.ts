/**
 * The normalized integration model.
 *
 * Two vocabularies exist in this product and they must not be mixed:
 *
 *   • **Business capabilities** — Voice, SMS, Email, Calendar, AI Receptionist,
 *     Business Knowledge. What the owner of the business understands and cares
 *     about. Nothing here names a vendor.
 *   • **Providers** — Vapi, Twilio, Google Calendar, Gmail, n8n, Pinecone. The
 *     infrastructure behind a capability, and an administrator's concern.
 *
 * `IntegrationRecord` is the provider-level truth. Everything the client-facing
 * UI shows is *derived* from those records (see `services/integrations.ts`), so
 * there is never a second "voice is connected" flag to fall out of sync.
 *
 * No secret ever belongs in this model. A credential is represented by whether
 * it is configured, never by its value — see `IntegrationConfigField`.
 */

export type CapabilityKey = "voice" | "sms" | "email" | "calendar" | "ai_receptionist" | "knowledge";

export type IntegrationType = "voice" | "sms" | "email" | "calendar" | "workflow" | "knowledge" | "model";

export type ProviderId = "vapi" | "twilio" | "google_calendar" | "gmail" | "n8n" | "pinecone" | "model_provider";

/** Whether the connection exists. Kept separate from whether it is *working*. */
export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "needs_attention"
  | "error"
  | "not_configured";

/** Whether a connection that exists is actually functioning. */
export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

/** What the business owner is shown. Deliberately fewer, softer states. */
export type CapabilityStatus = "connected" | "connecting" | "needs_attention" | "not_configured" | "offline";

// ── Errors ──────────────────────────────────────────────────────────────────

export type ErrorCategory = "auth" | "permission" | "network" | "configuration" | "rate_limit" | "provider" | "unknown";

export type ErrorSeverity = "info" | "warning" | "critical";

/**
 * A provider failure, already made safe.
 *
 * Raw provider payloads never reach a component: they are normalized at the
 * adapter boundary into this shape. `message` is written for a business owner;
 * `adminDetail` may carry extra diagnostic context but is still sanitised — no
 * tokens, keys, URLs with credentials, or raw upstream bodies.
 */
export interface NormalizedError {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  /** Safe for any audience. */
  message: string;
  /** Safe, but only shown in admin surfaces. */
  adminDetail?: string;
  provider: ProviderId;
  timestamp: string;
  retryable: boolean;
}

// ── Integration records ─────────────────────────────────────────────────────

export interface IntegrationCapabilityFlag {
  key: string;
  label: string;
  enabled: boolean;
}

/**
 * One line of a provider's configuration.
 *
 * `sensitive` fields carry no `value` — ever. The frontend is allowed to know
 * *that* an API credential is configured, never what it is. Credentials live on
 * the server; see `services/README.md`.
 */
export interface IntegrationConfigField {
  key: string;
  label: string;
  state: "configured" | "not_configured";
  /** Non-sensitive display value only: a calendar name, a mailbox label. */
  value?: string;
  sensitive: boolean;
}

export interface IntegrationRecord {
  id: string;
  /** Every record is scoped to a workspace from the outset, so multi-tenant
   *  admin views need no migration later. */
  workspaceId: string;
  type: IntegrationType;
  provider: ProviderId;
  /** Provider name, for admin surfaces only. */
  displayName: string;
  purpose: string;
  connection: ConnectionStatus;
  health: HealthStatus;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  capabilities: IntegrationCapabilityFlag[];
  config: IntegrationConfigField[];
  /** Admin-only metadata. Never rendered in a client-facing surface. */
  admin: {
    environment: "production" | "staging" | "sandbox";
    region?: string;
    notes?: string;
  };
  lastError: NormalizedError | null;
}

/**
 * The outcome of a connection check, already normalized.
 *
 * Part of the integration *model* rather than the adapter machinery, because a
 * client store needs this shape to render a result and must not have to reach
 * into the adapter layer to get it. A type-only import is erased at build time,
 * but one dropped  keyword would pull every provider adapter into a
 * browser bundle - so the type lives where the browser is allowed to look.
 */
export interface TestResult {
  outcome:
    | "healthy"
    | "authentication_required"
    | "unreachable"
    | "permission_missing"
    | "configuration_incomplete";
  health: HealthStatus;
  /** Present unless the outcome is healthy. Already sanitised. */
  error: NormalizedError | null;
  message: string;
}

// ── Events ──────────────────────────────────────────────────────────────────

export type IntegrationEventType =
  | "connected"
  | "disconnected"
  | "test_passed"
  | "test_failed"
  | "recovered"
  | "config_changed"
  | "sync_failed"
  | "workflow_failed"
  // Orchestration: what we asked a workflow to do, and what it sent back.
  | "operation_dispatched"
  | "operation_succeeded"
  | "operation_failed"
  | "event_received"
  | "event_rejected"
  | "sync_required"
  // Messaging: a carrier accepting a message and a handset receiving one are
  // different facts, arriving at different times. Both are worth showing.
  | "message_delivered"
  | "message_undelivered";

/**
 * A lightweight internal audit trail — enough to explain what happened to an
 * administrator, not a logging platform. Client users get notifications and
 * status instead; these are never surfaced to them.
 */
export interface IntegrationEvent {
  id: string;
  workspaceId: string;
  provider: ProviderId;
  type: IntegrationEventType;
  message: string;
  severity: ErrorSeverity;
  timestamp: string;
}

// ── Workflows ───────────────────────────────────────────────────────────────

export type WorkflowStatus = "active" | "inactive" | "error";

/**
 * Something the application knows how to do that a workflow may carry out.
 *
 * These are *application* capabilities, not automation engine concepts. The
 * server resolves an operation to a workflow for the authorized workspace; no
 * caller anywhere — client or server — names a workflow directly. That is what
 * keeps "reschedule this appointment" from degenerating into "run this webhook
 * with this payload", which is far too much power at far too low a layer.
 */
export type WorkflowOperation =
  | "appointment.book"
  | "appointment.reschedule"
  | "appointment.cancel"
  | "customer.message"
  | "business.sync";

export const WORKFLOW_OPERATIONS: readonly WorkflowOperation[] = [
  "appointment.book",
  "appointment.reschedule",
  "appointment.cancel",
  "customer.message",
  "business.sync",
] as const;

/** Business-facing wording for an operation. Never names a vendor or a workflow. */
export const WORKFLOW_OPERATION_LABELS: Record<WorkflowOperation, string> = {
  "appointment.book": "Book an appointment",
  "appointment.reschedule": "Reschedule an appointment",
  "appointment.cancel": "Cancel an appointment",
  "customer.message": "Send a customer message",
  "business.sync": "Sync business configuration",
};

/**
 * A workflow assignment. `workflowRef` is an opaque identifier, deliberately
 * not a webhook URL: an editable endpoint in the browser would be an open door
 * into the automation engine.
 */
export interface WorkflowMapping {
  id: string;
  workspaceId: string;
  name: string;
  /** Which business capability this workflow serves. */
  capability: CapabilityKey;
  /**
   * Which application operation invokes it, if any. Null means the workflow
   * runs on the engine's own triggers and is not something the dashboard calls.
   */
  operation: WorkflowOperation | null;
  workflowRef: string;
  version: string;
  environment: "production" | "staging" | "sandbox";
  status: WorkflowStatus;
  lastExecutionAt: string | null;
  lastSuccessAt: string | null;
  failedExecutions: number;
}

// ── Workspaces ──────────────────────────────────────────────────────────────

export type SubscriptionTier = "starter" | "professional" | "scale";

export interface Workspace {
  id: string;
  name: string;
  /** The business this workspace represents; matches the configuration document. */
  businessName: string;
  tier: SubscriptionTier;
  createdAt: string;
  featureFlags: Record<string, boolean>;
  usage: {
    conversationsThisPeriod: number;
    conversationsIncluded: number;
    minutesThisPeriod: number;
    minutesIncluded: number;
  };
  internalNotes: string;
}
