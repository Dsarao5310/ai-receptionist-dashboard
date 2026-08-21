"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import type { Completeness } from "@/services/business";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * What the receptionist currently knows, described in business terms. Each row
 * links into the Business Profile section that owns it — this page never edits
 * that information itself, so there is only ever one place to change it.
 */
export function KnowledgeSummary({ completeness }: { completeness: Completeness }) {
  const { sections, completed, total } = completeness;

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>What your receptionist knows</CardTitle>
        <CardDescription>
          {completed} of {total} recommended sections complete — select one to edit it in your business profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <ul className="grid gap-1 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.key}>
              <Link
                href={`/business-profile?tab=${section.tab}`}
                className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {section.complete ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", section.complete ? "text-text-primary" : "text-text-secondary")}>
                    {section.label}
                  </span>
                  {!section.complete && <span className="block text-xs text-text-muted">{section.hint}</span>}
                </span>
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
