import "server-only";

import { createHash } from "node:crypto";
import type { NormalizedError, WorkflowOperation } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { recordAuditEvent } from "@/server/audit";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { IntegrationOperation } from "@/server/db/repositories/orchestration";
import { INTEGRATION_SCHEMA_VERSION, type OutboundEnvelope } from "./contract";
import { dispatch, N8N_ERRORS } from "./client";

/**
 * The orchestration boundary: an application operation, carried out by a
 * workflow, recorded durably either way.
 *
 * ── What a caller may ask for, and what it may not ──────────────────────────
 * A caller names an *operation* — "reschedule this appointment". It does not
 * name a workflow, a webhook, a URL, an execution, or an engine. Those are
 * resolved here, from the authorized workspace's own mapping. There is no
 * argument through which a browser, a server action or a future contributor
 * could smuggle a workflow identifier in, because the parameter does not exist.
 *
 * ── Why "no workflow mapped" is a success, not an error ─────────────────────
 * A workspace with no mapping for an operation has no external system that
 * needs to agree with it. Its database *is* the whole truth, and the operation
 * should proceed exactly as it did before this phase existed. Returning
 * `no_workflow` says that plainly and leaves the decision with the caller,
 * rather than inventing a fake success — or blocking a business's bookings
 * because an integration nobody asked for is not configured.
 *
 * ── The one genuinely hard case ─────────────────────────────────────────────
 * A workflow can succeed and our own write can then fail. The external world
 * has moved and our record has not. That is `sync_required`: not retried
 * automatically, not hidden, and not resolved by guessing which side is right.
 * It is recorded, audited, and surfaced to an operator. See `markSyncRequired`.
 */

export type OperationDisposition =
  /** Nothing is mapped. The caller should proceed against the database alone. */
  | { kind: "no_workflow" }
  /** The workflow confirmed success. Safe to commit the durable change. */
  | { kind: "succeeded"; operation: IntegrationOperation }
  /** This exact request already succeeded. Commit nothing new; report success. */
  | { kind: "duplicate"; operation: IntegrationOperation }
  /** The workflow refused, or could not be reached. Do not commit. */
  | { kind: "failed"; operation: IntegrationOperation | null; error: NormalizedError };

export interface RunOperationInput {
  operation: WorkflowOperation;
  /**
   * The inputs that make this request *this* request. Hashed into a stable
   * idempotency key, so a retry of the same logical action — a double-clicked
   * button, a replayed action, a client that lost the response — reaches the
   * same operation row rather than starting a second one.
   *
   * Server-derived, always. A key supplied by a browser would let a caller
   * either collide with someone else's operation or evade deduplication by
   * varying it.
   */
  idempotencyParts: (string | number)[];
  /** The payload the workflow receives. No credentials, ever. */
  data: Record<string, unknown>;
  target?: { type: string; id: string };
  now: Date;
  /**
   * What performs the external action when no workflow is mapped.
   *
   * ── Why the spine has two executors and not two architectures ─────────────
   * A deployment can put the external system behind n8n (the workflow holds the
   * provider credential and orchestrates several steps) or behind a server-side
   * adapter (this application holds the credential and calls the provider
   * itself). Both are legitimate, and which one is in use is a configuration
   * question, not a reason for a second idempotency mechanism, a second state
   * machine and a second audit trail.
   *
   * So the executor is a parameter. Everything around it — the operation row,
   * the idempotency key, the states, the integration events, the audit entries,
   * the reconciliation queue — is shared, and a reader can answer "what
   * happened to this request?" in one place regardless of which path ran it.
   *
   * A mapped workflow always wins: if an administrator has pointed an operation
   * at n8n, that is the deployment's answer and the fallback stays unused.
   */
  executor?: (context: { operationId: string; now: Date }) => Promise<ExecutorResult>;
}

/** What a direct executor reports back. Deliberately the same shape n8n returns. */
export type ExecutorResult =
  | { ok: true; reference?: string | null }
  | { ok: false; error: NormalizedError };

/**
 * The error code an executor uses to say "the external effect already
 * happened; only my own bookkeeping write failed, and I have already
 * settled the operation myself."
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * An executor does two things: cause the external effect, then persist a
 * mapping or a sync flag for it. Only the executor knows which of those two
 * failed. If its own persistence write throws, the *external* action still
 * happened — patching or creating a calendar event is not undone by a local
 * database error — so this must never be reported as a plain failure (which
 * would tell a caller, wrongly, that nothing happened) or as a
 * `retryable_failure` (which would let a retry repeat a mutation that
 * already succeeded, real-Google-verified to produce a duplicate event on
 * the create path). It has to become `sync_required`, the one state that
 * already refuses a retry under the same idempotency key.
 *
 * An executor reporting this code has already called `markSyncRequired`
 * itself (typically via `commitWithSyncGuard`) — `runWorkflowOperation`
 * recognizes the code below and does not settle the operation a second time.
 */
export const LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS = "local_write_failed_after_external_success";

function digest(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * Run a direct executor, in the shape the dispatcher returns.
 *
 * Wrapped in a catch because an executor is ordinary application code and may
 * throw, and an exception escaping here would leave the operation row stuck in
 * `processing` forever — the one state that means "we genuinely do not know".
 * A thrown error is a failure we *do* know about, so it is recorded as one.
 */
async function runExecutor(
  executor: NonNullable<RunOperationInput["executor"]>,
  operationId: string,
  now: Date
): Promise<{ outcome: "succeeded"; result: { executionRef?: string }; latencyMs: number } | { outcome: "failed"; error: NormalizedError; latencyMs: number }> {
  const started = Date.now();
  try {
    const result = await executor({ operationId, now });
    return result.ok
      ? { outcome: "succeeded", result: { executionRef: result.reference ?? undefined }, latencyMs: Date.now() - started }
      : { outcome: "failed", error: result.error, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      outcome: "failed",
      latencyMs: Date.now() - started,
      error: {
        code: "executor_threw",
        category: "unknown",
        severity: "critical",
        message: "That action could not be completed.",
        // The class name only. An exception message can carry a URL or an id
        // from whatever it was talking to.
        adminDetail: `Executor threw ${error instanceof Error ? error.constructor.name : "an unknown error"}.`,
        provider: "n8n",
        timestamp: now.toISOString(),
        retryable: true,
      },
    };
  }
}

/**
 * The idempotency key.
 *
 * Scoped by workspace *and* operation before hashing, so two tenants performing
 * the same action on same-numbered records cannot collide — and so a
 * reschedule and a cancellation of one appointment are never the same key.
 */
function idempotencyKey(workspaceId: string, operation: WorkflowOperation, parts: (string | number)[]): string {
  return digest([workspaceId, operation, ...parts]);
}

export async function runWorkflowOperation(
  context: AuthContext,
  input: RunOperationInput
): Promise<OperationDisposition> {
  const scope = workspaceScope(context);

  // Resolution happens against the authorized workspace, and only there. This
  // is the single point where an operation becomes a workflow.
  const mapping = await scope.integrations.findWorkflowForOperation(input.operation);

  // Nothing mapped and nothing to fall back to: the operation has no external
  // side, so the caller proceeds against the database alone.
  if (!mapping && !input.executor) return { kind: "no_workflow" };

  const key = idempotencyKey(context.workspaceId, input.operation, input.idempotencyParts);
  const requestDigest = digest([input.data]);

  const claim = await scope.orchestration.claim({
    operation: input.operation,
    idempotencyKey: key,
    requestDigest,
    targetType: input.target?.type ?? null,
    targetId: input.target?.id ?? null,
    initiatedBy: context.user.id,
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
  });

  let operationRow: IntegrationOperation;

  if (claim.claimed) {
    operationRow = claim.operation;
  } else {
    const existing = claim.existing;

    // Same key, different inputs. This is not a retry — it is two different
    // requests that computed the same key, which means either a collision or a
    // bug. Returning the first one's result would answer a question nobody
    // asked, so it is refused instead.
    if (existing.requestDigest !== requestDigest) {
      return {
        kind: "failed",
        operation: existing,
        error: conflictError(input.now),
      };
    }

    switch (existing.status) {
      case "succeeded":
        // The definitive idempotency outcome: one logical action, one external
        // effect, however many times it was asked for.
        return { kind: "duplicate", operation: existing };

      case "pending":
      case "processing":
        // An attempt is in flight. Dispatching again would be exactly the
        // duplicate this whole mechanism exists to prevent.
        return { kind: "failed", operation: existing, error: inProgressError(input.now) };

      case "sync_required":
        return { kind: "failed", operation: existing, error: syncRequiredError(input.now) };

      case "failed":
      case "retryable_failure":
        // A settled failure may be attempted again under the same key.
        operationRow = existing;
        break;
    }
  }

  await scope.orchestration.markProcessing(
    operationRow.id,
    mapping ? { mappingId: mapping.id, ref: mapping.workflowRef } : null
  );

  const envelope: OutboundEnvelope = {
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    operationId: operationRow.id,
    operation: input.operation,
    idempotencyKey: key,
    workspaceId: context.workspaceId,
    // Server time. The workflow is told what "now" is; it never tells us.
    issuedAt: input.now.toISOString(),
    data: input.data,
  };

  const result = mapping
    ? await dispatch({ workflowRef: mapping.workflowRef, envelope, now: input.now })
    : await runExecutor(input.executor!, operationRow.id, input.now);

  // The executor already settled this operation to `sync_required` itself
  // (see `LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS`) — settling it again
  // below, to `failed` or `retryable_failure`, would overwrite that with a
  // status that (wrongly) permits a retry to repeat an external mutation
  // that already succeeded.
  if (result.outcome === "failed" && result.error.code === LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS) {
    return { kind: "failed", operation: operationRow, error: syncRequiredError(input.now) };
  }

  if (result.outcome === "failed") {
    const settled = await scope.orchestration.settle(operationRow.id, {
      status: result.error.retryable ? "retryable_failure" : "failed",
      error: {
        code: result.error.code,
        category: result.error.category,
        message: result.error.message,
        detail: result.error.adminDetail,
      },
      retryable: result.error.retryable,
      completedAt: input.now,
    });

    if (mapping) await scope.integrations.recordWorkflowExecution(mapping.id, { at: input.now, succeeded: false });
    await scope.integrations.recordEvent({
      provider: "n8n",
      type: "operation_failed",
      message: `${input.operation} could not be completed: ${result.error.message}`,
      severity: result.error.severity,
      occurredAt: input.now,
    });
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "workflow.operation_failed",
      targetType: input.target?.type ?? "workflow_operation",
      targetId: input.target?.id ?? operationRow.id,
      // Codes and identifiers only. `sanitizeMetadata` would drop a
      // credential-shaped key, but the real defence is not putting one here.
      metadata: { operation: input.operation, code: result.error.code, attempts: operationRow.attempts + 1 },
    });

    return { kind: "failed", operation: settled ?? operationRow, error: result.error };
  }

  const settled = await scope.orchestration.settle(operationRow.id, {
    status: "succeeded",
    executionRef: result.result.executionRef ?? null,
    completedAt: input.now,
  });

  if (mapping) await scope.integrations.recordWorkflowExecution(mapping.id, { at: input.now, succeeded: true });
  await scope.integrations.recordEvent({
    provider: "n8n",
    type: "operation_succeeded",
    message: `${input.operation} completed.`,
    severity: "info",
    occurredAt: input.now,
  });
  await recordAuditEvent({
    actorUserId: context.user.id,
    workspaceId: context.workspaceId,
    action: "workflow.operation_invoked",
    targetType: input.target?.type ?? "workflow_operation",
    targetId: input.target?.id ?? operationRow.id,
    metadata: { operation: input.operation, latencyMs: result.latencyMs },
  });

  return { kind: "succeeded", operation: settled ?? operationRow };
}

/**
 * The workflow succeeded and our write did not.
 *
 * Called from the caller's catch, because only the caller knows whether its own
 * durable change landed. Nothing is rolled back — there is nothing we *can* roll
 * back, since the external effect already happened — and nothing is retried,
 * because retrying would repeat the external action. The operation is marked so
 * that an operator can see a real, specific inconsistency instead of a vague
 * report that something went wrong.
 */
export async function markSyncRequired(
  context: AuthContext,
  operationId: string,
  detail: string,
  now: Date
): Promise<void> {
  const scope = workspaceScope(context);

  await scope.orchestration.settle(operationId, {
    status: "sync_required",
    error: {
      code: "sync_required",
      category: "unknown",
      message: "This action was completed externally but could not be saved here.",
      detail,
    },
    retryable: false,
    completedAt: now,
  });

  await scope.integrations.recordEvent({
    provider: "n8n",
    type: "sync_required",
    message: "A workflow completed but the change could not be saved. Needs reconciliation.",
    severity: "critical",
    occurredAt: now,
  });

  await recordAuditEvent({
    actorUserId: context.user.id,
    workspaceId: context.workspaceId,
    action: "workflow.operation_requires_sync",
    targetType: "workflow_operation",
    targetId: operationId,
  });
}

// ── Errors raised by this layer rather than by the transport ────────────────

function localError(
  partial: Omit<NormalizedError, "provider" | "timestamp">,
  now: Date
): NormalizedError {
  return { ...partial, provider: "n8n", timestamp: now.toISOString() };
}

function conflictError(now: Date): NormalizedError {
  return localError(
    {
      code: "idempotency_conflict",
      category: "unknown",
      severity: "warning",
      message: "That request conflicts with one already in progress. Please try again.",
      adminDetail: "An operation with this idempotency key exists with a different request digest.",
      retryable: false,
    },
    now
  );
}

function inProgressError(now: Date): NormalizedError {
  return localError(
    {
      code: "operation_in_progress",
      category: "rate_limit",
      severity: "info",
      message: "That change is still being processed. Give it a moment.",
      adminDetail: "A prior attempt for this idempotency key has not settled.",
      retryable: true,
    },
    now
  );
}

function syncRequiredError(now: Date): NormalizedError {
  return localError(
    {
      code: "sync_required",
      category: "unknown",
      severity: "critical",
      message: "This needs to be checked before it can be changed again.",
      adminDetail: "A previous attempt left external and local state out of step.",
      retryable: false,
    },
    now
  );
}

export { N8N_ERRORS };
