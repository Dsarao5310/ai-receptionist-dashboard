"use client";

import { Check, Circle } from "lucide-react";
import type { Completeness } from "@/services/business";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * A plain count of recommended sections that are filled in. Every row says what
 * would complete it, so the number is auditable rather than a score that merely
 * looks precise.
 */
export function SetupCompleteness({
  completeness,
  onJump,
}: {
  completeness: Completeness;
  onJump?: (tab: "details" | "hours" | "services" | "knowledge") => void;
}) {
  const { sections, completed, total, percent } = completeness;
  const done = sections.filter((s) => s.complete);
  const missing = sections.filter((s) => !s.complete);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Receptionist setup</CardTitle>
        <CardDescription>
          {completed} of {total} recommended sections complete
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums text-text-primary">{percent}%</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Section title="Complete" items={done} complete onJump={onJump} />
          <Section title="Still to add" items={missing} onJump={onJump} />
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  items,
  complete,
  onJump,
}: {
  title: string;
  items: Completeness["sections"];
  complete?: boolean;
  onJump?: (tab: "details" | "hours" | "services" | "knowledge") => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <button
              onClick={() => onJump?.(item.tab)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 -mx-2 text-left hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {complete ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
              )}
              <span className="min-w-0">
                <span className={cn("block text-sm", complete ? "text-text-primary" : "text-text-secondary")}>{item.label}</span>
                {!complete && <span className="block text-xs text-text-muted">{item.hint}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
