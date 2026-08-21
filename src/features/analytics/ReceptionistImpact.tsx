"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ImpactMetric } from "@/services/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function ReceptionistImpact({ metrics }: { metrics: ImpactMetric[] }) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>What your AI receptionist handled</CardTitle>
        <p className="text-xs text-text-muted">Work the assistant took on during this period</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pt-4 lg:grid-cols-3">
        {metrics.map((metric) => {
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl font-semibold tracking-tight tabular-nums text-text-primary">
                  {metric.value.toLocaleString()}
                </span>
                {metric.drillHref && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
              </div>
              <p className="mt-1 text-sm font-medium text-text-primary">{metric.label}</p>
              <p className="mt-0.5 text-xs text-text-muted">{metric.description}</p>
            </>
          );

          return metric.drillHref ? (
            <Link
              key={metric.key}
              href={metric.drillHref}
              className="rounded-lg border border-border bg-surface-sunken p-3.5 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {body}
            </Link>
          ) : (
            <div key={metric.key} className="rounded-lg border border-border bg-surface-sunken p-3.5">
              {body}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
