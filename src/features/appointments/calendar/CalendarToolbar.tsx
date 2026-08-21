"use client";

import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { CalendarView } from "./useCalendarNav";

const VIEWS: { key: CalendarView; label: string; icon: typeof CalendarDays }[] = [
  { key: "day", label: "Day", icon: Rows3 },
  { key: "week", label: "Week", icon: CalendarRange },
  { key: "month", label: "Month", icon: CalendarDays },
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
    <header className="flex flex-col gap-4 bg-gradient-to-br from-accent-subtle/55 via-surface to-surface px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-text-on-accent shadow-sm sm:flex">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-text">Schedule</p>
          <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-text-primary">{label}</h2>
        </div>
        <div className="ml-1 flex items-center rounded-xl border border-border bg-surface/80 p-0.5 shadow-sm">
          <button onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="h-4 w-px bg-border" />
          <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday} className="bg-surface/80">
          Today
        </Button>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-sunken/80 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onView(v.key)}
              aria-pressed={view === v.key}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all",
                view === v.key ? "bg-surface text-text-primary shadow-sm ring-1 ring-border" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
