"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BookingFunnel as FunnelData } from "@/services/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function BookingFunnel({ funnel }: { funnel: FunnelData }) {
  const { stages, directBookings } = funnel;
  const top = stages[0]?.value ?? 0;

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Booking funnel</CardTitle>
        <CardDescription>How conversations turn into appointments</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-2.5">
        {stages.map((stage, i) => {
          const widthPct = top === 0 ? 0 : Math.max((stage.value / top) * 100, stage.value > 0 ? 4 : 0);
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-text-primary">{stage.label}</span>
                <span className="text-sm font-semibold tabular-nums text-text-primary">{stage.value.toLocaleString()}</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${widthPct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-text-muted">{stage.description}</p>
            </>
          );

          return (
            <div key={stage.key}>
              {i > 0 && stage.conversionFromPrevious !== null && (
                <p className="mb-2 flex items-center gap-1 pl-0.5 text-xs text-text-muted">
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-medium text-text-secondary">{stage.conversionFromPrevious.toFixed(0)}%</span>
                  continued from {stages[i - 1].label.toLowerCase()}
                </p>
              )}
              {stage.drillHref ? (
                <Link
                  href={stage.drillHref}
                  className="block rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {body}
                </Link>
              ) : (
                <div className="px-2.5 py-2 -mx-2.5">{body}</div>
              )}
            </div>
          );
        })}

        {directBookings > 0 && (
          <p className="border-t border-border pt-3 text-xs text-text-muted">
            A further <span className="font-medium text-text-secondary">{directBookings.toLocaleString()}</span> appointment
            {directBookings === 1 ? " was" : "s were"} booked directly without a logged conversation, so {directBookings === 1 ? "it does" : "they do"} not
            appear in this funnel.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
