"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { CalendarView } from "./useCalendarNav";

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/**
 * The calendar's own navigation, not a Card — it sits directly above the grid
 * inside the same Card the page already wraps both in, so a second nested
 * border here would read as a card inside a card. The Day/Week/Month switch
 * reuses the app's one segmented-tab component rather than a bespoke button
 * row, which is what every other view-switch in the product already uses.
 */
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <div className="flex items-center">
          <button
            onClick={onPrev}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onNext}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="truncate text-section font-semibold text-text-primary">{label}</h2>
      </div>

      <Tabs value={view} onValueChange={(v) => onView(v as CalendarView)} className="self-start sm:self-auto">
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.key} value={v.key}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
