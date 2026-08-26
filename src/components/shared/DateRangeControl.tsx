"use client";

import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarRange } from "lucide-react";
import type { DateRangeKey } from "@/types";
import { RANGE_OPTIONS, type Bounds } from "@/lib/date-range";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useBusinessFormat } from "@/lib/business-format";
import { endOfZonedDay, wallClockToInstant, zonedDayKey } from "@/lib/timezone";

export function DateRangeControl({
  rangeKey,
  customBounds,
  onChange,
}: {
  rangeKey: DateRangeKey;
  customBounds: Bounds | null;
  onChange: (key: DateRangeKey, custom?: Bounds) => void;
}) {
  // A custom range means whole days on the *business's* calendar. Parsing the
  // picked dates with `new Date("2026-08-01T00:00:00")` would anchor them to
  // whatever zone the viewer's laptop is in, quietly shifting the window.
  const fmt = useBusinessFormat();
  const zone = fmt.timeZone;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(customBounds ? zonedDayKey(customBounds.start, zone) : "");
  const [draftEnd, setDraftEnd] = useState(customBounds ? zonedDayKey(customBounds.end, zone) : "");

  function applyCustom() {
    if (!draftStart || !draftEnd) return;
    // Day keys are fixed-width, so a string comparison is a date comparison.
    if (draftStart > draftEnd) return;
    const start = wallClockToInstant(draftStart, "00:00", zone);
    const end = endOfZonedDay(wallClockToInstant(draftEnd, "12:00", zone), zone);
    onChange("custom", { start, end });
    setPopoverOpen(false);
  }

  return (
    <div role="group" aria-label="Date range" className="flex items-center gap-1 rounded-lg bg-surface-sunken p-1">
      {RANGE_OPTIONS.filter((o) => o.key !== "custom").map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          aria-pressed={rangeKey === opt.key}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            rangeKey === opt.key ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
          )}
        >
          {opt.label}
        </button>
      ))}

      <PopoverPrimitive.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            aria-pressed={rangeKey === "custom"}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              rangeKey === "custom" ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            )}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            {rangeKey === "custom" && customBounds
              ? `${fmt.date(customBounds.start)} – ${fmt.date(customBounds.end)}`
              : "Custom"}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="end"
            sideOffset={8}
            className="z-50 w-72 rounded-xl border border-border bg-surface-raised p-4 shadow-xl data-[state=open]:animate-[pop-in_150ms_ease-out]"
          >
            <p className="mb-3 text-sm font-semibold text-text-primary">Custom range</p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="range-start">Start date</Label>
                <Input id="range-start" type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="range-end">End date</Label>
                <Input id="range-end" type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} />
              </div>
            </div>
            <Button size="sm" className="mt-4 w-full" onClick={applyCustom} disabled={!draftStart || !draftEnd}>
              Apply range
            </Button>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
