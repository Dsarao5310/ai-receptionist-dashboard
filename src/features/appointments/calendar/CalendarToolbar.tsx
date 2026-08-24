"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { CalendarView } from "./useCalendarNav";

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export function CalendarToolbar({
  view,
  onView,
  label,
  onPrev,
  onNext,
  onToday,
}: {
  view: CalendarView;
  onView: (v: CalendarView) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <div className="flex items-center">
          <button onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="truncate text-sm font-semibold text-text-primary">{label}</h2>
      </div>

      <div className="flex items-center gap-1 self-start rounded-lg bg-surface-sunken p-1 sm:self-auto">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onView(v.key)}
              aria-pressed={view === v.key}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.key ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {v.label}
            </button>
          ))}
      </div>
    </header>
  );
}
