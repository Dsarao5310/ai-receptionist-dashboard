"use client";

import Link from "next/link";
import type { AppointmentStatus } from "@/types";
import type { OutcomeEntry } from "@/services/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarDays } from "lucide-react";

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  confirmed: "var(--color-success)",
  pending: "var(--color-warning)",
  completed: "var(--color-info)",
  rescheduled: "var(--color-accent)",
  cancelled: "var(--color-danger)",
};

export function AppointmentOutcomes({ entries, total }: { entries: OutcomeEntry[]; total: number }) {
  const present = entries.filter((e) => e.count > 0);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Appointment outcomes</CardTitle>
        <CardDescription>
          Current status of the {total.toLocaleString()} appointment{total === 1 ? "" : "s"} booked in this period
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {total === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments booked in this period"
            description="Try a longer date range to see how bookings turned out."
            className="py-10"
          />
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label="Appointment status breakdown">
              {present.map((entry) => (
                <div
                  key={entry.status}
                  style={{ width: `${entry.percent}%`, background: STATUS_COLOR[entry.status] }}
                  title={`${entry.label}: ${entry.count}`}
                />
              ))}
            </div>

            <ul className="mt-4 space-y-0.5">
              {entries.map((entry) => (
                <li key={entry.status}>
                  <Link
                    href={entry.drillHref}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[entry.status] }} />
                    <span className="text-sm text-text-primary">{entry.label}</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-text-primary">{entry.count}</span>
                    <span className="w-10 text-right text-xs tabular-nums text-text-muted">{entry.percent.toFixed(0)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
