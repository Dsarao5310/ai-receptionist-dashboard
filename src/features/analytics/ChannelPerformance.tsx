"use client";

import Link from "next/link";
import type { ChannelPerformanceEntry } from "@/services/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
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
        <CardDescription>Conversion = bookings ÷ booking requests on that channel</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Desktop: full comparison table */}
        <div className="hidden sm:block">
          <Table minWidth="min-w-[520px]">
            <TableHeader>
              <tr>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Conversations</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Conversion</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const Icon = CHANNEL_ICONS[entry.channel];
                return (
                  <TableRow key={entry.channel}>
                    <TableCell>
                      <Link
                        href={entry.drillHref}
                        className="flex items-center gap-2 text-text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                      >
                        <Icon className="h-3.5 w-3.5 text-text-muted" />
                        {entry.label}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-secondary">{entry.conversations.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-text-secondary">{entry.bookingRequests.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-text-secondary">{entry.bookings.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-text-primary">
                      {entry.bookingRequests === 0 ? "—" : `${entry.conversionRate.toFixed(0)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

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
