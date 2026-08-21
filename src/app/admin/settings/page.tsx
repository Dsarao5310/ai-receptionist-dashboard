"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Textarea, Label } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { SaveBar } from "@/components/shared/SaveBar";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { useIntegrations } from "@/lib/store/integrations";
import { useHydrated } from "@/lib/store/hydration";
import { useSession } from "@/lib/session-context";
import { toast } from "@/lib/store/toast";
import { useBusinessFormat } from "@/lib/business-format";
import { AdminGate } from "@/features/integrations/AdminGate";
import { switchWorkspace } from "@/server/actions/workspace";

/**
 * Workspace administration.
 *
 * A separate route group from client Settings rather than a privileged tab
 * inside it: the boundary between what a business owner configures and what an
 * operator configures is visible in the file tree, not buried in a conditional.
 *
 * The workspace selector below is a *request*, not an authorization. Choosing a
 * workspace calls a server action that re-verifies platform authority before it
 * sets the scoping cookie, and rejects anything the caller may not enter.
 */
export default function AdminSettingsPage() {
  return (
    <AdminGate permission="settings.admin">
      <AdminSettingsView />
    </AdminGate>
  );
}

const TIER_LABELS = { starter: "Starter", professional: "Professional", scale: "Scale" } as const;

function AdminSettingsView() {
  const fmt = useBusinessFormat();
  const hydrated = useHydrated();
  const session = useSession();
  const [switching, startSwitch] = useTransition();
  const { workspaces, setFeatureFlag, setInternalNotes } = useIntegrations();

  const workspace = workspaces.find((w) => w.id === session.workspaceId) ?? workspaces[0];
  const [notesDraft, setNotesDraft] = useState(workspace?.internalNotes ?? "");

  const [syncedFrom, setSyncedFrom] = useState(workspace?.internalNotes ?? "");
  if ((workspace?.internalNotes ?? "") !== syncedFrom) {
    setSyncedFrom(workspace?.internalNotes ?? "");
    setNotesDraft(workspace?.internalNotes ?? "");
  }

  const notesDirty = notesDraft !== (workspace?.internalNotes ?? "");
  useUnsavedChanges(notesDirty);

  if (!hydrated) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!workspace) return null;

  const usagePercent = (used: number, included: number) => Math.min(100, Math.round((used / included) * 100));

  function onSelectWorkspace(workspaceId: string) {
    startSwitch(async () => {
      const result = await switchWorkspace(workspaceId);
      if (!result.ok) toast("Could not switch workspace", { description: result.error });
      // On success the server action revalidates and reloads scoped data; the
      // page re-renders under the new workspace with nothing carried over.
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Workspace administration</h1>
        <p className="text-sm text-text-secondary">
          Operator-level configuration for {workspace.name}. Not visible in the business-facing product.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Switch the workspace this console is looking at.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="workspace-select">Active workspace</Label>
            <Select value={session.workspaceId} onValueChange={onSelectWorkspace} disabled={switching}>
              <SelectTrigger id="workspace-select" aria-label="Active workspace">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {session.availableWorkspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-text-muted">
              The server re-checks your authority before switching. Records, workflows and events are all workspace-scoped.
            </p>
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Subscription</dt>
              <dd className="text-text-primary">{TIER_LABELS[workspace.tier]}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text-primary">
                {fmt.date(workspace.createdAt, { month: "short", day: "numeric", year: "numeric" })}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Workspace ID</dt>
              <dd className="font-mono text-xs text-text-secondary">{workspace.id}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
          <CardDescription>Against the {TIER_LABELS[workspace.tier]} plan allowance.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[
            {
              label: "Conversations",
              used: workspace.usage.conversationsThisPeriod,
              included: workspace.usage.conversationsIncluded,
            },
            { label: "Voice minutes", used: workspace.usage.minutesThisPeriod, included: workspace.usage.minutesIncluded },
          ].map((row) => (
            <div key={row.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-text-primary">{row.label}</span>
                <span className="tabular-nums text-text-secondary">
                  {row.used.toLocaleString()} / {row.included.toLocaleString()}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken"
                role="progressbar"
                aria-valuenow={usagePercent(row.used, row.included)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${row.label} usage`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${usagePercent(row.used, row.included)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>Per-workspace switches. Applied immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {Object.entries(workspace.featureFlags).map(([flag, enabled]) => (
              <li key={flag} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <label htmlFor={`flag-${flag}`} className="font-mono text-xs text-text-primary">
                  {flag}
                </label>
                <Switch
                  id={`flag-${flag}`}
                  checked={enabled}
                  onCheckedChange={(v) => setFeatureFlag(workspace.id, flag, v)}
                  aria-label={flag}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Internal notes</CardTitle>
          <CardDescription>Operator notes. Never shown to the business.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            aria-label="Internal notes"
            placeholder="Context worth remembering about this workspace"
          />
          <SaveBar
            dirty={notesDirty}
            onSave={() => {
              setInternalNotes(workspace.id, notesDraft);
              toast.success("Notes saved");
            }}
            onCancel={() => setNotesDraft(workspace.internalNotes)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
          <CardDescription>Resolved by the server from your account and memberships.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Platform operator</Badge>
            <span className="text-text-secondary">
              {session.user.name} · {session.user.email}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Role and workspace access come from the verified session. They cannot be changed from this browser — the
            previous demo role switcher has been removed, and every request re-derives authority on the server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
