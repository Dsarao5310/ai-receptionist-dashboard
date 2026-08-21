"use client";

import { useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import type { IntegrationRecord } from "@/types";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useBusinessFormat } from "@/lib/business-format";
import { useIntegrations } from "@/lib/store/integrations";
import { toast } from "@/lib/store/toast";
import { CAPABILITY_LABELS } from "@/services/integrations";
import {
  getAffectedCapabilities,
  getProviderEvents,
} from "@/services/integrations-providers";
import { ConnectionBadge, HealthBadge } from "./StatusIndicators";

/**
 * The administrator's view of one provider.
 *
 * Everything here is safe to render: configuration is reported as configured or
 * not configured, never as a value, and errors arrive already normalized. There
 * is deliberately no field anywhere in this drawer that could hold a secret.
 */
export function IntegrationDrawer({
  record,
  open,
  onOpenChange,
}: {
  record: IntegrationRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fmt = useBusinessFormat();
  const { connect, disconnect, testConnection, pending, events } = useIntegrations();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  if (!record) return null;

  const busy = pending.includes(record.id);
  const connected = record.connection === "connected" || record.connection === "needs_attention";
  const affected = getAffectedCapabilities(record.provider).map((key) => CAPABILITY_LABELS[key]);
  const recent = getProviderEvents(events, record.workspaceId, record.provider).slice(0, 6);

  async function runTest() {
    if (!record) return;
    const result = await testConnection(record.id);
    if (!result) return;
    if (result.outcome === "healthy") toast.success("Connection healthy", { description: result.message });
    else toast("Connection check failed", { description: result.message });
  }

  async function runConnect() {
    if (!record) return;
    await connect(record.id);
    toast.success(`${record.displayName} connected`);
  }

  async function runDisconnect() {
    if (!record) return;
    setConfirmDisconnect(false);
    await disconnect(record.id);
    toast(`${record.displayName} disconnected`);
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <div className="min-w-0">
              <DrawerTitle className="truncate">{record.displayName}</DrawerTitle>
              <DrawerDescription>{record.purpose}</DrawerDescription>
            </div>
            <DrawerClose />
          </DrawerHeader>

          <DrawerBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <ConnectionBadge status={record.connection} />
              <HealthBadge status={record.health} />
              {busy && <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-label="Working" />}
            </div>

            {record.lastError && (
              <div className="rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
                <p className="text-xs font-medium text-text-primary">{record.lastError.message}</p>
                {record.lastError.adminDetail && (
                  <p className="mt-1 text-xs text-text-secondary">{record.lastError.adminDetail}</p>
                )}
                <p className="mt-1.5 text-xs text-text-muted">
                  {record.lastError.category} · {record.lastError.retryable ? "Retryable" : "Needs action"} ·{" "}
                  {fmt.dateTime(record.lastError.timestamp)}
                </p>
              </div>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Activity</h3>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-text-muted">Last checked</dt>
                  <dd className="text-text-primary">{record.lastCheckedAt ? fmt.dateTime(record.lastCheckedAt) : "Never"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Last success</dt>
                  <dd className="text-text-primary">
                    {record.lastSuccessfulSyncAt ? fmt.dateTime(record.lastSuccessfulSyncAt) : "Never"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Capabilities</h3>
              <ul className="mt-2 space-y-1.5">
                {record.capabilities.map((cap) => (
                  <li key={cap.key} className="flex items-center gap-2 text-sm">
                    {cap.enabled ? (
                      <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                    )}
                    <span className={cap.enabled ? "text-text-primary" : "text-text-muted"}>{cap.label}</span>
                    <span className="sr-only">{cap.enabled ? "available" : "unavailable"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Configuration</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                {record.config.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-text-secondary">
                      {field.sensitive && <ShieldCheck className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
                      {field.label}
                    </dt>
                    <dd className="text-right text-text-primary">
                      {/* Sensitive values are never sent to the browser — only whether they exist. */}
                      {field.state === "not_configured" ? (
                        <span className="text-text-muted">Not configured</span>
                      ) : (
                        field.value ?? "Configured"
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-text-muted">
                Credentials are held by the backend. This dashboard only knows whether each one is configured.
              </p>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Environment</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Environment</dt>
                  <dd className="capitalize text-text-primary">{record.admin.environment}</dd>
                </div>
                {record.admin.region && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-secondary">Region</dt>
                    <dd className="text-text-primary">{record.admin.region}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Affects</dt>
                  <dd className="text-right text-text-primary">{affected.join(", ")}</dd>
                </div>
              </dl>
              {record.admin.notes && <p className="mt-2 text-xs text-text-secondary">{record.admin.notes}</p>}
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recent events</h3>
              {recent.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">Nothing recorded yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {recent.map((event) => (
                    <li key={event.id} className="text-sm">
                      <p className="text-text-primary">{event.message}</p>
                      <p className="text-xs text-text-muted">{fmt.dateTime(event.timestamp)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </DrawerBody>

          <DrawerFooter>
            {connected ? (
              <>
                <Button size="sm" variant="outline" onClick={runTest} disabled={busy}>
                  Test connection
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDisconnect(true)} disabled={busy}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={runConnect} disabled={busy}>
                {busy ? "Connecting…" : "Connect"}
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {record.displayName}?</DialogTitle>
            <DialogDescription>
              {affected.length === 1
                ? `${affected[0]} will stop working until this is reconnected.`
                : `${affected.slice(0, -1).join(", ")} and ${affected.at(-1)} will stop working until this is reconnected.`}{" "}
              Nothing already recorded is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setConfirmDisconnect(false)}>
              Keep connected
            </Button>
            <Button size="sm" variant="danger" onClick={runDisconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
