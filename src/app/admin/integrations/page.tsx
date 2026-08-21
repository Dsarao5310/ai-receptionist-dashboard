"use client";

import { useState } from "react";
import type { IntegrationRecord } from "@/types";
import { useIntegrations } from "@/lib/store/integrations";
import { useSession } from "@/lib/session-context";
import { useHydrated } from "@/lib/store/hydration";
import { toast } from "@/lib/store/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminGate } from "@/features/integrations/AdminGate";
import { IntegrationCard } from "@/features/integrations/IntegrationCard";
import { IntegrationDrawer } from "@/features/integrations/IntegrationDrawer";
import { SystemHealthBadge } from "@/features/integrations/StatusIndicators";
import {
  getOverallHealth,
  getSystemHealth,
  getWorkspaceIntegrations,
} from "@/services/integrations-providers";

/**
 * Provider configuration, for administrators.
 *
 * Provider names belong on this page and nowhere in the client-facing product.
 * The equivalent business view is /connections, which derives from exactly the
 * same records.
 */
export default function AdminIntegrationsPage() {
  return (
    <AdminGate permission="integrations.view">
      <IntegrationsView />
    </AdminGate>
  );
}

function IntegrationsView() {
  const hydrated = useHydrated();
  const workspaceId = useSession().workspaceId;
  const { integrations, pending, connect, testConnection } = useIntegrations();
  const [selected, setSelected] = useState<IntegrationRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const records = getWorkspaceIntegrations(integrations, workspaceId);
  const health = getSystemHealth(records);
  const overall = getOverallHealth(records);

  // Re-read from the store so the drawer follows the record it is showing.
  const selectedRecord = selected ? records.find((r) => r.id === selected.id) ?? null : null;

  function open(record: IntegrationRecord) {
    setSelected(record);
    setDrawerOpen(true);
  }

  async function runTest(record: IntegrationRecord) {
    const result = await testConnection(record.id);
    if (!result) return;
    if (result.outcome === "healthy") toast.success(`${record.displayName} is healthy`, { description: result.message });
    else toast(`${record.displayName} check failed`, { description: result.message });
  }

  // Until the persisted records are read back, show the shape rather than the
  // seeded defaults — those would briefly present placeholder state as real.
  if (!hydrated) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Integrations</h1>
          <p className="text-sm text-text-secondary">
            Provider connections behind this workspace. Business users see these as capabilities, not vendors.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>System health</CardTitle>
            <CardDescription>Rolled up from provider connections. Open a provider for the detail.</CardDescription>
          </div>
          <SystemHealthBadge state={overall} />
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {health.map((row) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="text-sm text-text-primary">{row.label}</span>
                <SystemHealthBadge state={row.state} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {records.map((record) => (
          <IntegrationCard
            key={record.id}
            record={record}
            busy={pending.includes(record.id)}
            onOpen={() => open(record)}
            onConnect={() => connect(record.id)}
            onTest={() => runTest(record)}
            onDisconnect={() => open(record)}
          />
        ))}
      </div>

      <p className="text-xs text-text-muted">
        Development may use explicit provider simulators. Provider actions run on the server, and unavailable or disabled
        providers are shown as not configured; no credential is held in the browser.
      </p>

      {/* Disconnecting is only reachable through the drawer, where the impact is spelled out. */}
      <IntegrationDrawer record={selectedRecord} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
