import "server-only";

import type {
  IntegrationCapabilityFlag,
  IntegrationConfigField,
  IntegrationEvent,
  IntegrationRecord,
  NormalizedError,
  ProviderId,
  WorkflowMapping,
  WorkflowOperation,
} from "@/types";
import { sanitizeConfig } from "@/services/integrations";
import { newId } from "../ids";
import { num, nullableIso, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Provider integrations for one workspace.
 *
 * ── No secret reaches this table ────────────────────────────────────────────
 * `config` describes a provider's configuration one line at a time: what the
 * line is, whether it is configured, and — for non-sensitive lines only — its
 * value. A sensitive line carries no value at all.
 *
 * That is not left to discipline. `sanitizeConfig` strips a value from any
 * sensitive field on the way in, and the database has a CHECK constraint that
 * rejects the row if one survives. Two independent refusals, because this is the
 * boundary that matters most: everything in these rows is one join away from an
 * admin screen.
 *
 * Where a credential actually lives is `provider_credentials`, which has no
 * value column either — only a reference to the vault entry holding it.
 */
export class IntegrationRepository extends WorkspaceScopedRepository {
  async list(): Promise<IntegrationRecord[]> {
    const rows = await this.sql`
      select * from integration_records where workspace_id = ${this.ws} order by type, provider`;
    return rows.map(toIntegrationRecord);
  }

  async findById(id: string): Promise<IntegrationRecord | null> {
    const [row] = await this.sql`
      select * from integration_records where id = ${id} and workspace_id = ${this.ws}`;
    return row ? toIntegrationRecord(row) : null;
  }

  /**
   * Apply an adapter's patch.
   *
   * Adapters are pure: they return what changed and this writes it. Keeping the
   * only write here means an adapter can never reach into unrelated state, and
   * when the mock adapters are replaced by real providers, the thing that
   * touches the database is unchanged.
   */
  async applyPatch(id: string, patch: Partial<IntegrationRecord>): Promise<IntegrationRecord | null> {
    const columns: Record<string, unknown> = {
      connection: patch.connection,
      health: patch.health,
      last_checked_at: patch.lastCheckedAt,
      last_successful_sync_at: patch.lastSuccessfulSyncAt,
      admin_notes: patch.admin?.notes,
    };
    if (patch.capabilities !== undefined) columns.capabilities = this.sql.json(patch.capabilities as never);
    if (patch.config !== undefined) columns.config = this.sql.json(sanitizeConfig(patch.config) as never);
    if (patch.lastError !== undefined) {
      columns.last_error = patch.lastError === null ? null : this.sql.json(patch.lastError as never);
    }

    const entries = Object.entries(columns).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return this.findById(id);

    const [row] = await this.sql`
      update integration_records set ${this.sql(Object.fromEntries(entries))}
      where id = ${id} and workspace_id = ${this.ws}
      returning *`;
    return row ? toIntegrationRecord(row) : null;
  }

  async upsert(record: Omit<IntegrationRecord, "workspaceId">): Promise<void> {
    await this.sql`
      insert into integration_records (
        id, workspace_id, type, provider, display_name, purpose, connection, health,
        last_checked_at, last_successful_sync_at, capabilities, config,
        admin_environment, admin_region, admin_notes, last_error
      ) values (
        ${record.id}, ${this.ws}, ${record.type}, ${record.provider}, ${record.displayName},
        ${record.purpose}, ${record.connection}, ${record.health},
        ${record.lastCheckedAt}, ${record.lastSuccessfulSyncAt},
        ${this.sql.json(record.capabilities as never)},
        ${this.sql.json(sanitizeConfig(record.config) as never)},
        ${record.admin.environment}, ${record.admin.region ?? null}, ${record.admin.notes ?? null},
        ${record.lastError === null ? null : this.sql.json(record.lastError as never)}
      )
      on conflict (workspace_id, provider) do update set
        connection              = excluded.connection,
        health                  = excluded.health,
        last_checked_at         = excluded.last_checked_at,
        last_successful_sync_at = excluded.last_successful_sync_at,
        capabilities            = excluded.capabilities,
        config                  = excluded.config,
        last_error              = excluded.last_error`;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  async listEvents(limit = 100): Promise<IntegrationEvent[]> {
    const rows = await this.sql`
      select * from integration_events where workspace_id = ${this.ws}
      order by occurred_at desc limit ${limit}`;
    return rows.map(toIntegrationEvent);
  }

  async recordEvent(input: {
    provider: ProviderId;
    type: IntegrationEvent["type"];
    message: string;
    severity: IntegrationEvent["severity"];
    occurredAt: Date;
  }): Promise<void> {
    await this.sql`
      insert into integration_events (id, workspace_id, provider, type, message, severity, occurred_at)
      values (${newId("iev")}, ${this.ws}, ${input.provider}, ${input.type},
              ${input.message}, ${input.severity}, ${input.occurredAt})`;
  }

  // ── Workflows ─────────────────────────────────────────────────────────────

  async listWorkflows(): Promise<WorkflowMapping[]> {
    const rows = await this.sql`
      select * from workflow_mappings where workspace_id = ${this.ws} order by capability, name`;
    return rows.map(toWorkflow);
  }

  /**
   * The workflow that serves an application operation here.
   *
   * This is the entire caller-facing workflow vocabulary: an operation name in,
   * a mapping out. No code above this layer passes a workflow id, and none
   * could — the orchestration service takes an operation, and the mapping is
   * looked up against the *authorized* workspace rather than a requested one.
   * Workspace A asking to reschedule can only ever reach the workflow Workspace
   * A has mapped.
   *
   * Inactive and errored mappings are excluded. A mapping an administrator has
   * switched off should behave as though it were absent, not as though it were
   * a workflow that happens to fail.
   */
  async findWorkflowForOperation(operation: WorkflowOperation): Promise<WorkflowMapping | null> {
    const [row] = await this.sql`
      select * from workflow_mappings
      where workspace_id = ${this.ws} and operation = ${operation} and status = 'active'`;
    return row ? toWorkflow(row) : null;
  }

  /**
   * Fold an execution's outcome into a mapping's health counters.
   *
   * A success resets the failure count rather than decrementing it: the useful
   * question is "is this workflow failing *now*", and a run of nine failures
   * followed by a success is a workflow that recovered, not one that is still
   * eight-tenths broken.
   */
  async recordWorkflowExecution(workflowId: string, input: { at: Date; succeeded: boolean }): Promise<void> {
    if (input.succeeded) {
      await this.sql`
        update workflow_mappings set
          last_execution_at = ${input.at},
          last_success_at   = ${input.at},
          failed_executions = 0,
          status            = 'active'
        where id = ${workflowId} and workspace_id = ${this.ws}`;
      return;
    }
    await this.sql`
      update workflow_mappings set
        last_execution_at = ${input.at},
        failed_executions = failed_executions + 1
      where id = ${workflowId} and workspace_id = ${this.ws}`;
  }

  async upsertWorkflow(workflow: Omit<WorkflowMapping, "workspaceId">): Promise<void> {
    await this.sql`
      insert into workflow_mappings (
        id, workspace_id, name, capability, operation, workflow_ref, version, environment, status,
        last_execution_at, last_success_at, failed_executions
      ) values (
        ${workflow.id}, ${this.ws}, ${workflow.name}, ${workflow.capability}, ${workflow.operation},
        ${workflow.workflowRef}, ${workflow.version}, ${workflow.environment}, ${workflow.status},
        ${workflow.lastExecutionAt}, ${workflow.lastSuccessAt}, ${workflow.failedExecutions}
      )
      on conflict (id) do update set
        operation         = excluded.operation,
        status            = excluded.status,
        last_execution_at = excluded.last_execution_at,
        last_success_at   = excluded.last_success_at,
        failed_executions = excluded.failed_executions`;
  }
}

function toIntegrationRecord(row: Row): IntegrationRecord {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    type: str(row.type) as IntegrationRecord["type"],
    provider: str(row.provider) as ProviderId,
    displayName: str(row.display_name),
    purpose: str(row.purpose),
    connection: str(row.connection) as IntegrationRecord["connection"],
    health: str(row.health) as IntegrationRecord["health"],
    lastCheckedAt: nullableIso(row.last_checked_at),
    lastSuccessfulSyncAt: nullableIso(row.last_successful_sync_at),
    capabilities: (row.capabilities ?? []) as IntegrationCapabilityFlag[],
    config: (row.config ?? []) as IntegrationConfigField[],
    admin: {
      environment: str(row.admin_environment) as IntegrationRecord["admin"]["environment"],
      region: row.admin_region ? str(row.admin_region) : undefined,
      notes: row.admin_notes ? str(row.admin_notes) : undefined,
    },
    lastError: (row.last_error ?? null) as NormalizedError | null,
  };
}

function toIntegrationEvent(row: Row): IntegrationEvent {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    provider: str(row.provider) as ProviderId,
    type: str(row.type) as IntegrationEvent["type"],
    message: str(row.message),
    severity: str(row.severity) as IntegrationEvent["severity"],
    timestamp: nullableIso(row.occurred_at) ?? "",
  };
}

function toWorkflow(row: Row): WorkflowMapping {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    name: str(row.name),
    capability: str(row.capability) as WorkflowMapping["capability"],
    operation: row.operation ? (str(row.operation) as WorkflowOperation) : null,
    workflowRef: str(row.workflow_ref),
    version: str(row.version),
    environment: str(row.environment) as WorkflowMapping["environment"],
    status: str(row.status) as WorkflowMapping["status"],
    lastExecutionAt: nullableIso(row.last_execution_at),
    lastSuccessAt: nullableIso(row.last_success_at),
    failedExecutions: num(row.failed_executions),
  };
}
