import "server-only";

import type { ProviderId, WorkflowOperation } from "@/types";
import { newId } from "../ids";
import { bool, nullableIso, nullableStr, num, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Operations we asked a workflow to carry out, and events it sent us back.
 *
 * ── Why an operation is a row and not a variable ────────────────────────────
 * Everything else in this schema records something that happened. This records
 * something that was *attempted across a process boundary*, which is a
 * different kind of fact: it has an interval, it can be in progress, and it can
 * end in a state where nobody knows what happened. A local function call has
 * none of those properties, so nothing else in the codebase needed this shape.
 *
 * The row is written before the call goes out. An operation that hangs and is
 * abandoned by the timeout therefore leaves evidence; if the row were written
 * on the way back, the requests most worth investigating would be exactly the
 * ones that left no trace.
 */

export type OperationStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "retryable_failure"
  | "sync_required";

export interface IntegrationOperation {
  id: string;
  workspaceId: string;
  operation: WorkflowOperation;
  idempotencyKey: string;
  requestDigest: string;
  status: OperationStatus;
  attempts: number;
  targetType: string | null;
  targetId: string | null;
  workflowMappingId: string | null;
  /** Admin diagnostics only — never rendered to a business user. */
  workflowRef: string | null;
  executionRef: string | null;
  error: {
    code: string | null;
    category: string | null;
    message: string | null;
    detail: string | null;
  };
  retryable: boolean;
  schemaVersion: number;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** The states from which an operation may still be retried or reconciled. */
export const UNSETTLED_STATUSES: OperationStatus[] = [
  "pending",
  "processing",
  "retryable_failure",
  "sync_required",
];

export class OrchestrationRepository extends WorkspaceScopedRepository {
  // ── Outbound operations ───────────────────────────────────────────────────

  /**
   * Claim an idempotency key, or report who already holds it.
   *
   * The insert is the claim, and the unique constraint is the arbiter. Two
   * concurrent requests carrying the same key both attempt it; one inserts and
   * the other's `on conflict do nothing` returns no row, at which point it reads
   * the winner and reports it. There is no window between checking and acting,
   * because there is no check — a `select` followed by an `insert` is exactly
   * the race this avoids.
   *
   * `existing` carries the prior row so the caller can decide: return its result
   * if it settled, refuse if the same key arrived with different inputs, or
   * resume it if it is still unfinished.
   */
  async claim(input: {
    operation: WorkflowOperation;
    idempotencyKey: string;
    requestDigest: string;
    targetType?: string | null;
    targetId?: string | null;
    initiatedBy: string | null;
    schemaVersion: number;
  }): Promise<{ claimed: true; operation: IntegrationOperation } | { claimed: false; existing: IntegrationOperation }> {
    const id = newId("op");
    const [row] = await this.sql`
      insert into integration_operations (
        id, workspace_id, operation, idempotency_key, request_digest,
        status, target_type, target_id, initiated_by, schema_version
      ) values (
        ${id}, ${this.ws}, ${input.operation}, ${input.idempotencyKey}, ${input.requestDigest},
        'pending', ${input.targetType ?? null}, ${input.targetId ?? null},
        ${input.initiatedBy}, ${input.schemaVersion}
      )
      on conflict (workspace_id, idempotency_key) do nothing
      returning *`;

    if (row) return { claimed: true, operation: toOperation(row) };

    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    // The conflict fired, so a row exists. If it has vanished between the two
    // statements something is deleting operation history, which is worth an
    // error rather than a silent second dispatch.
    if (!existing) throw new Error("Idempotency conflict resolved to no row.");
    return { claimed: false, existing };
  }

  async findByIdempotencyKey(key: string): Promise<IntegrationOperation | null> {
    const [row] = await this.sql`
      select * from integration_operations
      where workspace_id = ${this.ws} and idempotency_key = ${key}`;
    return row ? toOperation(row) : null;
  }

  async findById(id: string): Promise<IntegrationOperation | null> {
    const [row] = await this.sql`
      select * from integration_operations where id = ${id} and workspace_id = ${this.ws}`;
    return row ? toOperation(row) : null;
  }

  /** Mark an attempt as under way. Increments the attempt counter. */
  async markProcessing(id: string, workflow: { mappingId: string; ref: string } | null): Promise<void> {
    await this.sql`
      update integration_operations set
        status              = 'processing',
        attempts            = attempts + 1,
        workflow_mapping_id = ${workflow?.mappingId ?? null},
        workflow_ref        = ${workflow?.ref ?? null}
      where id = ${id} and workspace_id = ${this.ws}`;
  }

  async settle(
    id: string,
    input: {
      status: OperationStatus;
      executionRef?: string | null;
      error?: { code: string; category: string; message: string; detail?: string } | null;
      retryable?: boolean;
      completedAt: Date;
    }
  ): Promise<IntegrationOperation | null> {
    const [row] = await this.sql`
      update integration_operations set
        status         = ${input.status},
        execution_ref  = ${input.executionRef ?? null},
        error_code     = ${input.error?.code ?? null},
        error_category = ${input.error?.category ?? null},
        error_message  = ${input.error?.message ?? null},
        error_detail   = ${input.error?.detail ?? null},
        retryable      = ${input.retryable ?? false},
        completed_at   = ${input.completedAt}
      where id = ${id} and workspace_id = ${this.ws}
      returning *`;
    return row ? toOperation(row) : null;
  }

  async listRecent(limit = 50): Promise<IntegrationOperation[]> {
    const rows = await this.sql`
      select * from integration_operations where workspace_id = ${this.ws}
      order by created_at desc limit ${limit}`;
    return rows.map(toOperation);
  }

  /**
   * Operations that need someone to look at them.
   *
   * The reconciliation queue is this query rather than a second table — "needs
   * attention" is a property of an operation's status, and duplicating it would
   * create the possibility of the two disagreeing.
   */
  async listUnsettled(limit = 50): Promise<IntegrationOperation[]> {
    const rows = await this.sql`
      select * from integration_operations
      where workspace_id = ${this.ws} and status = any(${UNSETTLED_STATUSES})
      order by created_at desc limit ${limit}`;
    return rows.map(toOperation);
  }

  // ── Inbound receipts ──────────────────────────────────────────────────────

  /**
   * Record that an event arrived, or report that it already had.
   *
   * Same mechanism as `claim`, for the same reason: two deliveries of one event
   * can be in flight simultaneously, and only the database can adjudicate that
   * without a race.
   */
  async receiveEvent(input: {
    /**
     * Which provider sent this. Widened from the literal `"n8n"` when the
     * inbound pipeline was generalized: the database's own check constraint
     * now accepts the same provider vocabulary the rest of the schema uses
     * (migration 0008), and the unique key `(workspace_id, source,
     * external_event_id)` is what keeps two providers' identifiers from
     * colliding.
     */
    source: ProviderId;
    externalEventId: string;
    eventType: string;
    schemaVersion: number;
    receivedAt: Date;
    operationId?: string | null;
  }): Promise<{ accepted: true; id: string } | { accepted: false; existing: InboundEventReceipt }> {
    const id = newId("inev");
    const [row] = await this.sql`
      insert into integration_inbound_events (
        id, workspace_id, source, external_event_id, event_type, schema_version,
        received_at, outcome, operation_id
      ) values (
        ${id}, ${this.ws}, ${input.source}, ${input.externalEventId}, ${input.eventType},
        ${input.schemaVersion}, ${input.receivedAt}, 'received', ${input.operationId ?? null}
      )
      on conflict (workspace_id, source, external_event_id) do nothing
      returning id`;

    if (row) return { accepted: true, id: str(row.id) };

    const existing = await this.findEvent(input.source, input.externalEventId);
    if (!existing) throw new Error("Inbound event conflict resolved to no row.");
    return { accepted: false, existing };
  }

  async findEvent(source: string, externalEventId: string): Promise<InboundEventReceipt | null> {
    const [row] = await this.sql`
      select * from integration_inbound_events
      where workspace_id = ${this.ws} and source = ${source} and external_event_id = ${externalEventId}`;
    return row ? toReceipt(row) : null;
  }

  async settleEvent(
    id: string,
    input: {
      outcome: InboundEventReceipt["outcome"];
      detail: string;
      retryable?: boolean;
      processedAt: Date;
      operationId?: string | null;
    }
  ): Promise<void> {
    await this.sql`
      update integration_inbound_events set
        outcome      = ${input.outcome},
        detail       = ${input.detail},
        retryable    = ${input.retryable ?? false},
        processed_at = ${input.processedAt},
        operation_id = coalesce(${input.operationId ?? null}, operation_id)
      where id = ${id} and workspace_id = ${this.ws}`;
  }

  async listEvents(limit = 50): Promise<InboundEventReceipt[]> {
    const rows = await this.sql`
      select * from integration_inbound_events where workspace_id = ${this.ws}
      order by received_at desc limit ${limit}`;
    return rows.map(toReceipt);
  }
}

export interface InboundEventReceipt {
  id: string;
  workspaceId: string;
  source: string;
  externalEventId: string;
  eventType: string;
  schemaVersion: number;
  receivedAt: string;
  processedAt: string | null;
  outcome: "received" | "accepted" | "duplicate" | "rejected" | "failed";
  retryable: boolean;
  detail: string | null;
  operationId: string | null;
}

function toOperation(row: Row): IntegrationOperation {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    operation: str(row.operation) as WorkflowOperation,
    idempotencyKey: str(row.idempotency_key),
    requestDigest: str(row.request_digest),
    status: str(row.status) as OperationStatus,
    attempts: num(row.attempts),
    targetType: nullableStr(row.target_type),
    targetId: nullableStr(row.target_id),
    workflowMappingId: nullableStr(row.workflow_mapping_id),
    workflowRef: nullableStr(row.workflow_ref),
    executionRef: nullableStr(row.execution_ref),
    error: {
      code: nullableStr(row.error_code),
      category: nullableStr(row.error_category),
      message: nullableStr(row.error_message),
      detail: nullableStr(row.error_detail),
    },
    retryable: bool(row.retryable),
    schemaVersion: num(row.schema_version),
    initiatedBy: nullableStr(row.initiated_by),
    createdAt: nullableIso(row.created_at) ?? "",
    updatedAt: nullableIso(row.updated_at) ?? "",
    completedAt: nullableIso(row.completed_at),
  };
}

function toReceipt(row: Row): InboundEventReceipt {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    source: str(row.source),
    externalEventId: str(row.external_event_id),
    eventType: str(row.event_type),
    schemaVersion: num(row.schema_version),
    receivedAt: nullableIso(row.received_at) ?? "",
    processedAt: nullableIso(row.processed_at),
    outcome: str(row.outcome) as InboundEventReceipt["outcome"],
    retryable: bool(row.retryable),
    detail: nullableStr(row.detail),
    operationId: nullableStr(row.operation_id),
  };
}
