"use client";

import Link from "next/link";
import type { ChannelPerformanceEntry } from "@/services/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CHANNEL_ICONS } from "@/features/conversations/shared";

/**
 * Deliberately shows conversion alongside volume rather than ranking channels —
 * the busiest channel is not automatically the best-performing one.
 */
export function ChannelPerformance({ entries }: { entries: ChannelPerformanceEntry[] }) {
  const maxConversations = Math.max(...entries.map((e) => e.conversations), 1);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Channel performance</CardTitle>
        <p className="text-xs text-text-muted">Conversion = bookings ÷ booking requests on that channel</p>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Desktop: full comparison table */}
        <table className="hidden w-full text-sm sm:table">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Channel</th>
              <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Conversations</th>
              <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Requests</th>
              <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Bookings</th>
              <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const Icon = CHANNEL_ICONS[entry.channel];
              return (
                <tr key={entry.channel} className="border-b border-border last:border-0">
                  <td className="py-2.5">
                    <Link
                      href={entry.drillHref}
                      className="flex items-center gap-2 text-text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    >
                      <Icon className="h-3.5 w-3.5 text-text-muted" />
                      {entry.label}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-text-secondary">{entry.conversations.toLocaleString()}</td>
                  <td className="py-2.5 text-right tabular-nums text-text-secondary">{entry.bookingRequests.toLocaleString()}</td>
                  <td className="py-2.5 text-right tabular-nums text-text-secondary">{entry.bookings.toLocaleString()}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-text-primary">
                    {entry.bookingRequests === 0 ? "—" : `${entry.conversionRate.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile: stacked cards, so nothing shrinks below readability */}
        <ul className="space-y-3 sm:hidden">
          {entries.map((entry) => {
            const Icon = CHANNEL_ICONS[entry.channel];
            return (
              <li key={entry.channel}>
                <Link href={entry.drillHref} className="block rounded-lg p-2.5 -mx-2.5 hover:bg-surface-hover transition-colors">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-text-muted" />
                    <span className="text-sm font-medium text-text-primary">{entry.label}</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-text-primary">
                      {entry.bookingRequests === 0 ? "—" : `${entry.conversionRate.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(entry.conversations / maxConversations) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-text-muted">
                    {entry.conversations} conversations · {entry.bookingRequests} requests · {entry.bookings} booked
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
