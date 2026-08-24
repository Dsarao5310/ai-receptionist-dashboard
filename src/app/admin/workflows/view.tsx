"use client";

import { Workflow } from "lucide-react";
import type { ConnectionStatus, HealthStatus, NormalizedError, WorkflowMapping } from "@/types";
import { WORKFLOW_OPERATION_LABELS } from "@/types";
import type { IntegrationOperation, InboundEventReceipt } from "@/server/db/repositories/orchestration";
import { useBusinessFormat } from "@/lib/business-format";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { CAPABILITY_LABELS } from "@/services/integrations";

/**
 * What an administrator is shown about the orchestration boundary.
 *
 * ── Admin sees mechanism; clients see outcomes ──────────────────────────────
 * Execution references, operation ids, workflow references, attempt counts and
 * normalized failure detail all belong on this page and on no other. A business
 * user is told "Appointment rescheduled" or "That change couldn't be saved";
 * they are never shown `sim_op_k3f9x2`, and they never learn the name of the
 * engine behind it.
 *
 * ── What is still not here ──────────────────────────────────────────────────
 * No credential, no webhook URL, no raw response body, and no control that
 * would run an arbitrary workflow. `workflowRef` is displayed because an
 * administrator diagnosing a failure needs to know which workflow ran — it is
 * an identifier, not an endpoint, and there is no field on this page that could
 * become one.
 */

const STATUS_TONE = { active: "success", inactive: "neutral", error: "danger" } as const;

const OPERATION_TONE: Record<IntegrationOperation["status"], "success" | "danger" | "warning" | "neutral"> = {
  succeeded: "success",
  failed: "danger",
  retryable_failure: "warning",
  sync_required: "danger",
  processing: "neutral",
  pending: "neutral",
};

const OPERATION_LABELS: Record<IntegrationOperation["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  retryable_failure: "Retryable failure",
  sync_required: "Sync required",
};

const RECEIPT_TONE: Record<InboundEventReceipt["outcome"], "success" | "danger" | "warning" | "neutral"> = {
  accepted: "success",
  duplicate: "neutral",
  rejected: "warning",
  failed: "danger",
  received: "neutral",
};

/**
 * Enum values are database vocabulary, not sentences.
 *
 * These were previously rendered raw and passed through a `capitalize` class,
 * which produced "Not_configured" — the underscore visible to the operator.
 * Anything unmapped falls back to a de-underscored form rather than leaking the
 * literal token.
 */
const ENGINE_STATE_LABELS: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
  connected: "Connected",
  disconnected: "Disconnected",
  disabled: "Disabled",
  error: "Error",
  configuration_incomplete: "Configuration incomplete",
  not_configured: "Not configured",
};

function stateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const mapped = ENGINE_STATE_LABELS[value];
  if (mapped) return mapped;
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const MODE_LABELS = {
  disabled: "Not configured",
  simulated: "Simulated (development)",
  live: "Live",
} as const;

export interface EngineSummary {
  connection: ConnectionStatus;
  health: HealthStatus;
  environment: string;
  lastCheckedAt: string | null;
  lastError: NormalizedError | null;
}

export function WorkflowsView({
  workflows,
  operations,
  unsettled,
  receipts,
  engine,
  mode,
  credentials,
}: {
  workflows: WorkflowMapping[];
  operations: IntegrationOperation[];
  unsettled: IntegrationOperation[];
  receipts: InboundEventReceipt[];
  engine: EngineSummary | null | undefined;
  mode: keyof typeof MODE_LABELS;
  credentials: { label: string; state: "configured" | "not_configured" }[];
}) {
  const fmt = useBusinessFormat();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Workflows</h1>
        <p className="text-sm text-text-secondary">
          Automation assigned to this workspace, and what has crossed the boundary in both directions.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Engine</CardTitle>
            <CardDescription>
              Connection health and credential state. Test a connection from the Integrations page.
            </CardDescription>
          </div>
          <Badge tone={engine?.health === "healthy" ? "success" : engine?.health === "down" ? "danger" : "warning"}>
            {stateLabel(engine?.health)}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mode" value={MODE_LABELS[mode]} />
            <Field label="Environment" value={stateLabel(engine?.environment)} />
            <Field label="Connection" value={stateLabel(engine?.connection)} />
            <Field
              label="Last checked"
              value={engine?.lastCheckedAt ? fmt.relative(engine.lastCheckedAt) : "Never"}
            />
          </dl>

          <ul className="mt-3 flex flex-wrap gap-2">
            {credentials.map((c) => (
              <li key={c.label} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <span className="text-sm text-text-primary">{c.label}</span>
                {/* The only two words the frontend ever learns about a secret. */}
                <Badge tone={c.state === "configured" ? "success" : "warning"}>
                  {c.state === "configured" ? "Configured" : "Not configured"}
                </Badge>
              </li>
            ))}
          </ul>

          {engine?.lastError ? (
            <p className="mt-3 text-sm text-text-secondary">
              {engine.lastError.message}
              {engine.lastError.adminDetail ? (
                <span className="block text-xs text-text-muted">{engine.lastError.adminDetail}</span>
              ) : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {unsettled.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Needs reconciliation</CardTitle>
            <CardDescription>
              Operations that did not settle cleanly. “Sync required” means a workflow succeeded but the change could
              not be saved here — the two sides may disagree.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <OperationTable operations={unsettled} fmt={fmt} showError />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Assigned workflows</CardTitle>
          <CardDescription>
            An operation maps to exactly one active workflow per workspace. Workflows with no operation run on the
            engine&apos;s own triggers.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {workflows.length === 0 ? (
            <div className="px-4">
              <EmptyState
                icon={Workflow}
                title="No workflows assigned"
                description="This workspace has no automation mapped yet."
              />
            </div>
          ) : (
            <div>
              <Table minWidth="min-w-[1040px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>Last success</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium text-text-primary">{w.name}</TableCell>
                      <TableCell className="text-text-secondary">
                        {w.operation ? WORKFLOW_OPERATION_LABELS[w.operation] : "—"}
                      </TableCell>
                      <TableCell className="text-text-secondary">{CAPABILITY_LABELS[w.capability]}</TableCell>
                      <TableCell className="font-mono text-xs text-text-secondary">{w.workflowRef}</TableCell>
                      <TableCell className="text-text-secondary">{w.version}</TableCell>
                      <TableCell>
                        <Badge tone={STATUS_TONE[w.status]} className="capitalize">
                          {w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {w.lastExecutionAt ? fmt.relative(w.lastExecutionAt) : "Never"}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {w.lastSuccessAt ? fmt.relative(w.lastSuccessAt) : "Never"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-text-secondary">
                        {w.failedExecutions}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent operations</CardTitle>
          <CardDescription>What the dashboard asked the engine to do, and how it ended.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {operations.length === 0 ? (
            <p className="px-4 text-sm text-text-muted">Nothing dispatched yet.</p>
          ) : (
            <OperationTable operations={operations} fmt={fmt} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound events</CardTitle>
          <CardDescription>
            What the engine sent us. A duplicate is a redelivery that was recognised and applied only once.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {receipts.length === 0 ? (
            <p className="px-4 text-sm text-text-muted">Nothing received yet.</p>
          ) : (
            <div>
              <Table minWidth="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-text-secondary">{r.externalEventId}</TableCell>
                      <TableCell className="text-text-secondary">{r.eventType}</TableCell>
                      <TableCell>
                        <Badge tone={RECEIPT_TONE[r.outcome]} className="capitalize">
                          {r.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-text-secondary">{fmt.relative(r.receivedAt)}</TableCell>
                      <TableCell className="text-text-secondary">{r.detail ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function OperationTable({
  operations,
  fmt,
  showError = false,
}: {
  operations: IntegrationOperation[];
  fmt: ReturnType<typeof useBusinessFormat>;
  showError?: boolean;
}) {
  return (
    <div>
      <Table minWidth="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead>Operation</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
            <TableHead>Execution</TableHead>
            <TableHead>Started</TableHead>
            {showError ? <TableHead>Detail</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {operations.map((op) => (
            <TableRow key={op.id}>
              <TableCell className="text-text-primary">{WORKFLOW_OPERATION_LABELS[op.operation]}</TableCell>
              <TableCell className="font-mono text-xs text-text-secondary">{op.targetId ?? "—"}</TableCell>
              <TableCell>
                <Badge tone={OPERATION_TONE[op.status]}>{OPERATION_LABELS[op.status]}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums text-text-secondary">{op.attempts}</TableCell>
              <TableCell className="font-mono text-xs text-text-secondary">{op.executionRef ?? "—"}</TableCell>
              <TableCell className="text-text-secondary">{fmt.relative(op.createdAt)}</TableCell>
              {showError ? (
                <TableCell className="text-text-secondary">
                  {op.error.message ?? "—"}
                  {op.error.detail ? <span className="block text-xs text-text-muted">{op.error.detail}</span> : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
