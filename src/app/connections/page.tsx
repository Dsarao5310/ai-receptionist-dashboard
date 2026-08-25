"use client";

import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { useIntegrations } from "@/lib/store/integrations";
import { usePermissions } from "@/lib/session-context";
import { useHydrated } from "@/lib/store/hydration";
import { useConfiguration } from "@/lib/store/configuration";

import { useBusinessFormat } from "@/lib/business-format";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { CapabilityBadge } from "@/features/integrations/StatusIndicators";

/**
 * What is working, for the business owner.
 *
 * This page shows capabilities — Voice, SMS, Email, Calendar, the receptionist,
 * business knowledge — and never names a provider. Every status is derived from
 * the same records the admin Integrations page manages, so the two can disagree
 * only if the derivation is wrong, never because one was updated and the other
 * was not.
 */
export default function ConnectionsPage() {
  const fmt = useBusinessFormat();
  const hydrated = useHydrated();
  const { can } = usePermissions();
  const capabilities = useIntegrations((s) => s.capabilities);
  const businessName = useConfiguration((s) => s.business.name);

  const needsAttention = capabilities.filter((c) => c.status !== "connected");

  // The most recent check across everything behind these capabilities. Derived
  // on the server: a business user is never sent the provider records it came
  // from, only this timestamp.
  const lastChecked = useIntegrations((s) => s.checkedAt) ?? undefined;

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-40" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        description={`What your AI receptionist is currently able to do for ${businessName}.`}
        actions={
          can("integrations.manage") ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/integrations">Open provider settings</Link>
            </Button>
          ) : undefined
        }
      />

      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {needsAttention.length === 1 ? "One thing needs attention" : `${needsAttention.length} things need attention`}
            </CardTitle>
            <CardDescription>Everything else is running normally. Select one to jump to its details below.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {needsAttention.map((c) => (
                <li key={c.key}>
                  <a
                    href={`#capability-${c.key}`}
                    className="group inline-flex items-center gap-2 rounded-lg border border-border py-1.5 pl-3 pr-2.5 text-sm text-text-primary transition-colors hover:bg-surface-hover hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="font-medium">{c.label}</span>
                    <CapabilityBadge status={c.status} />
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((c) => (
          <Card key={c.key} id={`capability-${c.key}`} className="scroll-mt-20 p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-text-primary">{c.label}</h2>
              <CapabilityBadge status={c.status} />
            </div>
            <p className="mt-2 text-sm text-text-secondary">{c.detail}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Radio className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{lastChecked ? `Last checked ${fmt.relative(lastChecked)}.` : "Not checked yet."}</span>
        <span>Your team is notified automatically if something stops working.</span>
      </div>
    </div>
  );
}
