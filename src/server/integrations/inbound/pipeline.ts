import "server-only";

import type { ProviderId } from "@/types";
import type { AuditAction, User } from "@/types/identity";
import type { AuthContext } from "@/server/auth/policy";
import { recordAuditEvent } from "@/server/audit";
import { serverNow } from "@/server/clock";
import { getDb, type Sql } from "@/server/db/client";
import { workspaceScope } from "@/server/db/workspace-scope";

/**
 * The inbound gate sequence, once, for every provider.
 *
 * ── What this is, and what it deliberately is not ───────────────────────────
 * This owns the part of webhook ingestion that is identical no matter who is
 * calling: the *order of the gates*, the idempotency receipt, the transaction
 * boundary, the settle/audit/event writes, and the rule about which failures
 * may be retried. It owns none of the provider's semantics — not its signature
 * algorithm, not its payload shape, not how its events map to our domain.
 *
 * It was extracted from the n8n ingestion path after that path had been through
 * a full security review and 32 tests, rather than designed up front. The shape
 * below is that reviewed shape; the extraction exists so a second provider
 * inherits it instead of re-deriving it, because the failure modes here are the
 * expensive kind — a webhook endpoint that authenticates loosely, or trusts a
 * tenant claim in a payload, is a cross-tenant write waiting to happen.
 *
 * ── The order of the gates, and why it is this order ────────────────────────
 *
 *     signature  →  schema  →  tenant  →  idempotency  →  transaction
 *
 * Signature first, because an unauthenticated caller must not be able to cost
 * us a database query, let alone reach one. Schema next, because the tenant is
 * resolved from a field and that field must be a sane string before it is used.
 * Tenant third — and never from a workspace id supplied in the payload. Then
 * idempotency, then a single transaction so a partially-applied event cannot
 * exist.
 *
 * ── Why the ordering is structure rather than a comment ─────────────────────
 * Each gate is a separate method on the provider module, and this function is
 * the only thing that calls them. A provider cannot accidentally resolve a
 * tenant before verifying a signature, because it never gets to choose.
 */

// ── What a provider must supply ─────────────────────────────────────────────

/**
 * The request, as bytes and metadata rather than as a parsed object.
 *
 * `rawBody` is the exact text received. It must not be parsed and
 * re-serialised before verification: JSON.stringify does not preserve key
 * order or whitespace, and every body-signing scheme would then fail. Twilio
 * signs something else again — the full URL concatenated with its sorted form
 * parameters — which is why `url` is carried here too rather than assumed
 * irrelevant.
 */
export interface InboundRequest {
  url: string;
  headers: Headers;
  rawBody: string;
  now: Date;
}

export type Verification = { valid: true } | { valid: false; reason: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

export type TenantResolution =
  | { ok: true; workspaceId: string }
  | { ok: false; reason: string };

/** What the idempotency receipt is claimed against. */
export interface EventIdentity {
  /** The sender's own id for this event. Trusted as a dedupe label only. */
  externalEventId: string;
  eventType: string;
  schemaVersion: number;
}

export type ApplyResult =
  | { ok: true; detail: string; operationId: string | null }
  | { ok: false; detail: string };

export type Scope = ReturnType<typeof workspaceScope>;

export interface InboundProvider<TEnvelope> {
  /** Which provider's receipts these are. Written to `integration_inbound_events.source`. */
  source: ProviderId;

  /**
   * Gate 1. Prove the request came from this provider.
   *
   * The reason is returned so the *server* can log precisely; the pipeline
   * never returns it to the caller. Telling an unauthenticated caller whether
   * their signature was malformed, stale or simply wrong is three free hints
   * toward a valid one.
   */
  verify(request: InboundRequest): Verification | Promise<Verification>;

  /** Gate 2. Is this a shape we understand? Runs only after verification. */
  parse(request: InboundRequest): Parsed<TEnvelope>;

  /**
   * Gate 3. Whose event is this?
   *
   * Must resolve from a mapping *we* issued — a workflow reference, a phone
   * number, an assistant id, a provider account id. A `workspaceId` read out
   * of the payload is not tenant resolution; a signature proves only that the
   * sender holds a secret, never which business the event is for.
   */
  resolveTenant(envelope: TEnvelope): Promise<TenantResolution>;

  /** Gate 4's input: what the idempotency claim is made against. */
  identity(envelope: TEnvelope): EventIdentity;

  /** The business effect, inside the pipeline's transaction and workspace scope. */
  apply(scope: Scope, envelope: TEnvelope, now: Date): Promise<ApplyResult>;

  /** Audit vocabulary for this provider's accepted and rejected events. */
  audit: { accepted: AuditAction; rejected: AuditAction };
}

// ── What the pipeline returns ───────────────────────────────────────────────

export type IngestionOutcome =
  | { status: "accepted"; eventId: string; detail: string }
  | { status: "duplicate"; eventId: string; detail: string }
  | { status: "rejected"; reason: string }
  | { status: "unauthorized" }
  | { status: "failed"; reason: string };

/**
 * A context that authorizes scoping and nothing else.
 *
 * Repositories require an `AuthContext` because tenant data should be
 * unreachable without one. An inbound webhook has no user, so this constructs
 * the minimum that satisfies the type — and deliberately constructs it *weak*:
 * `platformRole: "member"` with `workspaceRole: null` resolves to the empty
 * permission set, so if this context ever reaches `can()` the answer is always
 * no. It grants a workspace to scope by, never an authority to act.
 *
 * The synthetic id is not a real user, so it is never written as an audit
 * actor — those rows carry a null actor, which is what "the system did this"
 * means.
 */
function systemUser(source: ProviderId): User {
  return {
    id: `system:${source}`,
    name: "Integration",
    email: "",
    avatarUrl: null,
    jobTitle: "",
    platformRole: "member",
    status: "active",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function systemContext(source: ProviderId, workspaceId: string): AuthContext {
  return { user: systemUser(source), workspaceId, workspaceRole: null };
}

/**
 * Run one inbound event through every gate.
 *
 * ── Why failures mostly leave no receipt ────────────────────────────────────
 * A receipt is a claim on an event id: once written, that id is spent and a
 * redelivery is answered as a duplicate. That is exactly right for events we
 * *finished* with — accepted, or permanently rejected — and exactly wrong for
 * ones that failed transiently, which need to stay retryable. So a transient
 * failure rolls the receipt back with the rest of the transaction, and the
 * sender gets a 5xx-shaped outcome it is expected to retry.
 */
export async function ingestInboundEvent<TEnvelope>(
  provider: InboundProvider<TEnvelope>,
  request: Omit<InboundRequest, "now"> & { now?: Date }
): Promise<IngestionOutcome> {
  const now = request.now ?? serverNow();
  const fullRequest: InboundRequest = { ...request, now };

  // ── Gate 1: is this actually from the provider it claims to be? ───────────
  const verification = await provider.verify(fullRequest);
  if (!verification.valid) return { status: "unauthorized" };

  // ── Gate 2: is it a shape we understand? ──────────────────────────────────
  const parsed = provider.parse(fullRequest);
  if (!parsed.ok) return { status: "rejected", reason: parsed.reason };

  // ── Gate 3: whose event is it? ────────────────────────────────────────────
  const tenant = await provider.resolveTenant(parsed.value);
  if (!tenant.ok) return { status: "rejected", reason: tenant.reason };

  const identity = provider.identity(parsed.value);
  const context = systemContext(provider.source, tenant.workspaceId);

  // ── Gates 4 and 5: idempotency and the transaction ────────────────────────
  //
  // Both inside one `begin`, so the receipt and the business change commit
  // together or not at all. A crash between them cannot leave an event id
  // spent with nothing to show for it.
  try {
    return await getDb().begin(async (tx) => {
      const scope = workspaceScope(context, tx as unknown as Sql);

      const claim = await scope.orchestration.receiveEvent({
        source: provider.source,
        externalEventId: identity.externalEventId,
        eventType: identity.eventType,
        schemaVersion: identity.schemaVersion,
        receivedAt: now,
      });

      if (!claim.accepted) {
        // Already seen. The business effect happened at most once, which is
        // the guarantee; the sender gets a success so it stops retrying.
        return {
          status: "duplicate" as const,
          eventId: claim.existing.id,
          detail: claim.existing.detail ?? "Already processed.",
        };
      }

      const applied = await provider.apply(scope, parsed.value, now);

      await scope.orchestration.settleEvent(claim.id, {
        outcome: applied.ok ? "accepted" : "rejected",
        detail: applied.detail,
        processedAt: now,
        operationId: applied.ok ? applied.operationId : null,
      });

      await scope.integrations.recordEvent({
        provider: provider.source,
        type: applied.ok ? "event_received" : "event_rejected",
        message: `${identity.eventType}: ${applied.detail}`,
        severity: applied.ok ? "info" : "warning",
        occurredAt: now,
      });

      await recordAuditEvent({
        // Null actor: the system did this, and no user row exists for it.
        actorUserId: null,
        workspaceId: tenant.workspaceId,
        action: applied.ok ? provider.audit.accepted : provider.audit.rejected,
        targetType: "integration_event",
        targetId: identity.externalEventId,
        metadata: { eventType: identity.eventType, schemaVersion: identity.schemaVersion },
      });

      // A payload that failed *validation* is settled as rejected and
      // committed — it will never become valid, so the receipt should stand
      // and stop the redelivery loop.
      return applied.ok
        ? { status: "accepted" as const, eventId: claim.id, detail: applied.detail }
        : { status: "rejected" as const, reason: applied.detail };
    });
  } catch {
    // A transient failure: the transaction rolled back, including the receipt,
    // so the sender may retry and will get a clean attempt. No internal detail
    // is returned.
    return { status: "failed", reason: "the event could not be processed" };
  }
}
