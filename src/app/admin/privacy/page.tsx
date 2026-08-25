import Link from "next/link";
import { Activity, BellOff, Clock3, DatabaseZap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/shared/PageHeader";
import { requirePlatformOperator } from "@/server/auth/guards";
import { serverNow } from "@/server/clock";
import { serverEnv } from "@/server/env";
import { readPrivacyOperationsHealth, type PrivacyOperationsState } from "@/server/privacy/operations-health";

const tone = {
  disabled: "neutral",
  never_run: "warning",
  healthy: "success",
  missed: "danger",
  failed: "danger",
  running: "info",
  stale: "danger",
} as const;

const label = {
  disabled: "Disabled",
  never_run: "Never run",
  healthy: "Healthy",
  missed: "Run overdue",
  failed: "Last run failed",
  running: "Running",
  stale: "Stale run or lease",
} as const;

export default async function AdminPrivacyPage() {
  const user = await requirePlatformOperator();
  const health = await readPrivacyOperationsHealth(user, serverEnv.privacyPurgeMode, serverNow());

  return (
    <div className="space-y-4">
      <PageHeader
        description="Read-only global privacy maintenance status. No tenant or sensitive content is shown."
        actions={<Button asChild variant="outline" size="sm"><Link href="/admin/settings">Back to admin settings</Link></Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusCard icon={Activity} label="Purge health" value={label[health.state]} state={health.state} />
        <StatusCard icon={Clock3} label="Schedule" value={health.scheduleEnabled ? "Scheduled" : "Disabled"} state={health.scheduleEnabled ? "healthy" : "disabled"} />
        <StatusCard icon={BellOff} label="External alerts" value="Not configured" state="never_run" />
      </div>

      <Card>
        <CardHeader className="flex-col items-start sm:flex-row sm:items-center">
          <div>
            <CardTitle>Privacy purge operations</CardTitle>
            <CardDescription>
              Derived from the global lease and sanitized run ledger. This view does not enable, retry, or mutate the scheduler.
            </CardDescription>
          </div>
          <Badge tone={tone[health.state]}>{label[health.state]}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {health.lastRun ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Last run" value={health.lastRun.runId} mono />
              <Metric label="Outcome" value={health.lastRun.status} />
              <Metric label="Completed" value={health.lastRun.completedAt ? formatUtc(health.lastRun.completedAt) : "Not completed"} />
              <Metric label="Duration" value={health.lastRun.durationMs == null ? "—" : `${health.lastRun.durationMs} ms`} />
              <Metric label="Workspaces processed" value={String(health.lastRun.workspacesProcessed)} />
              <Metric label="Calls processed" value={String(health.lastRun.callsProcessed)} />
              <Metric label="Transcripts erased" value={String(health.lastRun.transcriptsErased)} />
              <Metric label="Recordings erased" value={String(health.lastRun.recordingsErased)} />
              <Metric label="Error code" value={health.lastRun.errorCode ?? "—"} mono={health.lastRun.errorCode !== null} />
            </dl>
          ) : (
            <p className="text-sm text-text-muted">No sanitized purge run has been recorded.</p>
          )}

          <div className="rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-sm">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <div>
                <p className="font-medium text-text-primary">Lease state</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {health.lease.active
                    ? `Active until ${formatUtc(health.lease.leaseUntil!)}.`
                    : health.lease.stale
                      ? `Expired lease remains associated with run ${health.lease.runId}.`
                      : "No active lease."}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Checked {formatUtc(health.checkedAt)}. This in-app view is not an alert: no external notification, escalation owner, or recovery automation is configured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ icon: Icon, label: title, value, state }: {
  icon: typeof Activity;
  label: string;
  value: string;
  state: PrivacyOperationsState;
}) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div><p className="text-xs text-text-muted">{title}</p><Badge tone={tone[state]} className="mt-1">{value}</Badge></div>
    </CardContent></Card>
  );
}

function Metric({ label: title, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs text-text-muted">{title}</dt><dd className={mono ? "mt-1 break-all font-mono text-xs text-text-primary" : "mt-1 text-text-primary"}>{value}</dd></div>;
}

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}
