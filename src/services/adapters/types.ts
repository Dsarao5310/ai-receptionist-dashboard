import type {
  IntegrationCapabilityFlag,
  IntegrationRecord,
  ProviderId,
} from "@/types";
import type { TestResult } from "@/types";

export type { TestResult };

/**
 * The contract every provider integration is reached through.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Provider-specific knowledge stops here. Nothing above this boundary knows
 * that voice is Vapi or that SMS is Twilio — components read normalized
 * `IntegrationRecord`s and derived capability statuses. Swapping a provider is
 * then an adapter change, not a UI change.
 *
 * ── Two hard rules ──────────────────────────────────────────────────────────
 * 1. **Credentials never cross this boundary.** An adapter may report that a
 *    credential is configured; it must never return its value. In production
 *    these adapters run on the server and the browser calls an authenticated
 *    API — the browser must never hold a provider secret, and must never call a
 *    provider (or an automation webhook) directly.
 *
 * 2. **Timestamps are normalized here, through `provider-time.ts`.** Every
 *    inbound provider timestamp goes through `instantFromProvider`; no adapter
 *    parses dates itself. An offsetless timestamp with no stated zone throws
 *    rather than silently inheriting the server's clock. Business-day questions
 *    are then answered in the business timezone, further in.
 *
 * ── Current implementations ─────────────────────────────────────────────────
 * All adapters here are mocks operating on local demo state. They perform no
 * network calls. The signatures are async so that becoming real API calls later
 * changes nothing above them.
 */

export interface AdapterContext {
  /** The record as it currently stands. Adapters are pure with respect to it. */
  record: IntegrationRecord;
  /** Injected clock — adapters never read the ambient one. */
  now: Date;
}

/**
 * A patch an adapter asks the store to apply. Returning a patch rather than
 * mutating keeps adapters pure and the store the single writer.
 */
export type RecordPatch = Partial<
  Pick<
    IntegrationRecord,
    "connection" | "health" | "lastCheckedAt" | "lastSuccessfulSyncAt" | "capabilities" | "config" | "lastError"
  >
>;

export interface IntegrationAdapter {
  provider: ProviderId;
  /** Begin a connection. Real adapters would start OAuth or verify a credential. */
  connect(ctx: AdapterContext): Promise<RecordPatch>;
  /** Tear down. Never deletes history — the record stays, unconfigured. */
  disconnect(ctx: AdapterContext): Promise<RecordPatch>;
  /** Probe the provider and report a normalized outcome. */
  testConnection(ctx: AdapterContext): Promise<TestResult>;
  /** What this provider can currently do, given its configuration. */
  getCapabilities(ctx: AdapterContext): IntegrationCapabilityFlag[];
}
