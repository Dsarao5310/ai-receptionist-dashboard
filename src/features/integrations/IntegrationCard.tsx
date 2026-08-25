"use client";

import { Loader2 } from "lucide-react";
import type { IntegrationRecord } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBusinessFormat } from "@/lib/business-format";
import { CAPABILITY_LABELS } from "@/services/integrations";
import { getAffectedCapabilities } from "@/services/integrations-providers";
import { ConnectionBadge, HealthBadge } from "./StatusIndicators";

/**
 * One provider, as an administrator sees it. Provider names are expected here —
 * this component is only ever rendered inside the admin route group.
 */
export function IntegrationCard({
  record,
  busy,
  onOpen,
  onConnect,
  onTest,
  onDisconnect,
}: {
  record: IntegrationRecord;
  busy: boolean;
  onOpen: () => void;
  onConnect: () => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const fmt = useBusinessFormat();
  const connected = record.connection === "connected" || record.connection === "needs_attention";
  const affects = getAffectedCapabilities(record.provider).map((key) => CAPABILITY_LABELS[key]);

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={onOpen}
            className="text-left text-sm font-semibold text-text-primary hover:text-accent-text transition-colors"
          >
            {record.displayName}
          </button>
          <p className="mt-0.5 text-xs text-text-secondary">{record.purpose}</p>
        </div>
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" aria-label="Working" />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ConnectionBadge status={record.connection} />
        <HealthBadge status={record.health} />
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Last checked</dt>
          <dd className="text-text-secondary">{record.lastCheckedAt ? fmt.relative(record.lastCheckedAt) : "Never"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Last success</dt>
          <dd className="text-text-secondary">
            {record.lastSuccessfulSyncAt ? fmt.relative(record.lastSuccessfulSyncAt) : "Never"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Supports</dt>
          <dd className="text-right text-text-secondary">{affects.join(", ")}</dd>
        </div>
      </dl>

      {record.lastError && (
        <p className="mt-3 rounded-md border border-border bg-surface-sunken px-2.5 py-2 text-xs text-text-secondary">
          {record.lastError.message}
        </p>
      )}

      {/* mt-auto, not mt-4: grid items stretch to the tallest card in the row,
          so a fixed margin left each card's actions at a different height. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={onOpen}>
          Manage
        </Button>
        {connected ? (
          <>
            <Button size="sm" variant="outline" onClick={onTest} disabled={busy}>
              Test connection
            </Button>
            <Button size="sm" variant="ghost" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onConnect} disabled={busy}>
            {record.connection === "connecting" ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
    </Card>
  );
}
