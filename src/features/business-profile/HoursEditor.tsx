"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { DayHours } from "@/types";
import { WEEKDAY_LABELS } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { SaveBar } from "@/components/shared/SaveBar";
import { toast } from "@/lib/store/toast";
import { timeOrder } from "@/lib/validation";
import { cn } from "@/lib/utils";

/**
 * Edits the weekly schedule. Each day holds a list of intervals rather than a
 * single open/close pair, so adding split hours later is a UI change only — the
 * stored shape already supports it.
 */
export function HoursEditor({
  value,
  onSave,
  onDirtyChange,
}: {
  value: DayHours[];
  onSave: (next: DayHours[]) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<DayHours[]>(value);
  const [copyOpen, setCopyOpen] = useState<string | null>(null);

  // Re-sync the draft when the stored hours change identity (a save, or a reset
  // from elsewhere). React's documented "adjust state during render" pattern —
  // an effect here would render once with a stale draft first.
  const [syncedFrom, setSyncedFrom] = useState(value);
  if (value !== syncedFrom) {
    setSyncedFrom(value);
    setDraft(value);
  }

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const day of draft) {
      if (!day.isOpen) continue;
      const interval = day.intervals[0];
      if (!interval) {
        map[day.day] = "Set an opening and closing time.";
        continue;
      }
      const message = timeOrder(interval.open, interval.close);
      if (message) map[day.day] = message;
    }
    return map;
  }, [draft]);

  const hasErrors = Object.keys(errors).length > 0;

  function setDay(dayKey: string, patch: Partial<DayHours>) {
    setDraft((d) => d.map((day) => (day.day === dayKey ? { ...day, ...patch } : day)));
  }

  function setInterval_(dayKey: string, field: "open" | "close", v: string) {
    setDraft((d) =>
      d.map((day) => {
        if (day.day !== dayKey) return day;
        const existing = day.intervals[0] ?? { open: "09:00", close: "17:00" };
        return { ...day, intervals: [{ ...existing, [field]: v }] };
      })
    );
  }

  function copyTo(sourceDay: string, targets: string[]) {
    const source = draft.find((d) => d.day === sourceDay);
    if (!source) return;
    setDraft((d) =>
      d.map((day) =>
        targets.includes(day.day)
          ? { ...day, isOpen: source.isOpen, intervals: source.intervals.map((i) => ({ ...i })) }
          : day
      )
    );
    setCopyOpen(null);
    toast.success(`Copied ${WEEKDAY_LABELS[source.day]} to ${targets.length} day${targets.length === 1 ? "" : "s"}`);
  }

  function handleSave() {
    if (hasErrors) {
      toast("Please fix the highlighted times");
      return;
    }
    // Closing a day keeps its intervals so re-opening restores the previous times.
    onSave(draft);
    toast.success("Business hours saved");
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>Weekly hours</CardTitle>
          <CardDescription>Your receptionist uses these when telling customers when you&apos;re open.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-1">
          {draft.map((day) => {
            const interval = day.intervals[0] ?? { open: "09:00", close: "17:00" };
            const error = errors[day.day];
            return (
              <div key={day.day} className="rounded-lg px-2.5 py-2.5 -mx-2.5 hover:bg-surface-hover/60 transition-colors">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 sm:w-44">
                    <Switch
                      checked={day.isOpen}
                      onCheckedChange={(checked) => setDay(day.day, { isOpen: checked, intervals: checked && day.intervals.length === 0 ? [interval] : day.intervals })}
                      aria-label={`${WEEKDAY_LABELS[day.day]} open`}
                      id={`hours-${day.day}`}
                    />
                    <label htmlFor={`hours-${day.day}`} className="text-sm font-medium text-text-primary cursor-pointer">
                      {WEEKDAY_LABELS[day.day]}
                    </label>
                  </div>

                  {day.isOpen ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        type="time"
                        value={interval.open}
                        onChange={(e) => setInterval_(day.day, "open", e.target.value)}
                        aria-label={`${WEEKDAY_LABELS[day.day]} opening time`}
                        aria-invalid={!!error}
                        className={cn("w-[8.5rem]", error && "border-danger focus-visible:ring-danger")}
                      />
                      <span className="text-text-muted text-sm">to</span>
                      <Input
                        type="time"
                        value={interval.close}
                        onChange={(e) => setInterval_(day.day, "close", e.target.value)}
                        aria-label={`${WEEKDAY_LABELS[day.day]} closing time`}
                        aria-invalid={!!error}
                        className={cn("w-[8.5rem]", error && "border-danger focus-visible:ring-danger")}
                      />

                      <PopoverPrimitive.Root open={copyOpen === day.day} onOpenChange={(o) => setCopyOpen(o ? day.day : null)}>
                        <PopoverPrimitive.Trigger asChild>
                          <button
                            className="ml-auto rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                            aria-label={`Copy ${WEEKDAY_LABELS[day.day]} hours to other days`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </PopoverPrimitive.Trigger>
                        <PopoverPrimitive.Portal>
                          <PopoverPrimitive.Content
                            align="end"
                            sideOffset={8}
                            className="z-50 w-56 rounded-xl border border-border bg-surface-raised p-3 shadow-xl data-[state=open]:animate-[pop-in_150ms_ease-out]"
                          >
                            <p className="mb-2 text-xs font-semibold text-text-primary">Copy to</p>
                            <div className="space-y-1">
                              <button
                                onClick={() => copyTo(day.day, draft.filter((d) => d.day !== day.day).map((d) => d.day))}
                                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                              >
                                All other days
                              </button>
                              <button
                                onClick={() => copyTo(day.day, ["Mon", "Tue", "Wed", "Thu", "Fri"].filter((d) => d !== day.day))}
                                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                              >
                                Weekdays
                              </button>
                              <button
                                onClick={() => copyTo(day.day, ["Sat", "Sun"].filter((d) => d !== day.day))}
                                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                              >
                                Weekend
                              </button>
                            </div>
                          </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                      </PopoverPrimitive.Root>
                    </div>
                  ) : (
                    <span className="text-sm text-text-muted">Closed</span>
                  )}
                </div>
                {error && (
                  <p role="alert" className="mt-1.5 text-xs text-danger sm:pl-44">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={() => setDraft(value)} />
    </>
  );
}

/** Small read-only summary used by the AI Receptionist page. */
export function HoursSummary({ hours }: { hours: DayHours[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {hours.map((day) => (
        <li key={day.day} className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">{WEEKDAY_LABELS[day.day]}</span>
          <span className={cn("tabular-nums", day.isOpen ? "text-text-primary" : "text-text-muted")}>
            {day.isOpen && day.intervals[0] ? `${day.intervals[0].open} – ${day.intervals[0].close}` : "Closed"}
          </span>
        </li>
      ))}
    </ul>
  );
}
