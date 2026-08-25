"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import type { IntentEntry } from "@/services/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export function IntentDistribution({ entries }: { entries: IntentEntry[] }) {
  const max = Math.max(...entries.map((e) => e.count), 1);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>What customers ask for</CardTitle>
        <CardDescription>Select an intent to see those conversations</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {entries.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No conversations in this period" className="py-10" />
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.intent}>
                <Link
                  href={entry.drillHref}
                  className="block rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-text-primary">{entry.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold tabular-nums text-text-primary">{entry.count}</span>
                      <span className="w-9 text-right text-xs tabular-nums text-text-muted">{entry.percent.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(entry.count / max) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
