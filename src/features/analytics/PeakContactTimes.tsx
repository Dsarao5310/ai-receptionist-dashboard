"use client";

import type { PeakBucket, PeakContactTimes as PeakData } from "@/services/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

function BarGroup({ title, buckets, peakKey }: { title: string; buckets: PeakBucket[]; peakKey?: string }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <ul className="space-y-1.5">
        {buckets.map((bucket) => {
          const isPeak = bucket.key === peakKey && bucket.count > 0;
          return (
            <li key={bucket.key} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-text-secondary">{bucket.label}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-surface-sunken">
                <div
                  className={cn("h-full rounded transition-[width] duration-500", isPeak ? "bg-accent" : "bg-accent/35")}
                  style={{ width: `${(bucket.count / max) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{bucket.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PeakContactTimes({ data }: { data: PeakData }) {
  const hasActivity = data.byDay.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>When customers get in touch</CardTitle>
        <CardDescription>
          {hasActivity && data.busiestDay && data.busiestHour
            ? `Busiest on ${data.busiestDay.label}, ${data.busiestHour.label.toLowerCase()}`
            : "Contact patterns across the selected period"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 pt-4 md:grid-cols-2">
        <BarGroup title="By day of week" buckets={data.byDay} peakKey={data.busiestDay?.key} />
        <BarGroup title="By time of day" buckets={data.byHour} peakKey={data.busiestHour?.key} />
      </CardContent>
    </Card>
  );
}
