"use client";

import { useState } from "react";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import type { SpecialHours } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { toast } from "@/lib/store/toast";
import { timeOrder } from "@/lib/validation";
import { formatIntervals } from "@/services/business";
import { useBusinessFormat } from "@/lib/business-format";

/**
 * Holidays and one-off hours. These override the weekly schedule for their date,
 * so the receptionist doesn't quote normal hours on a day the business is shut.
 * Saves immediately — each entry is a small, self-contained record, so a
 * separate save step would be more friction than protection.
 */
export function SpecialHoursEditor({
  entries,
  onAdd,
  onUpdate,
  onRemove,
}: {
  entries: SpecialHours[];
  onAdd: (entry: Omit<SpecialHours, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<SpecialHours, "id">>) => void;
  onRemove: (id: string) => void;
}) {
  const fmt = useBusinessFormat();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SpecialHours | null>(null);
  const [draft, setDraft] = useState({ date: "", label: "", isClosed: true, open: "09:00", close: "17:00" });
  const [error, setError] = useState<string | null>(null);

  function resetDraft() {
    setDraft({ date: "", label: "", isClosed: true, open: "09:00", close: "17:00" });
    setError(null);
  }

  function submit() {
    if (!draft.date) return setError("Pick a date.");
    if (!draft.label.trim()) return setError("Give this a name, like “Christmas Day”.");
    if (!draft.isClosed) {
      const timeError = timeOrder(draft.open, draft.close);
      if (timeError) return setError(timeError);
    }
    onAdd({
      date: draft.date,
      label: draft.label.trim(),
      isClosed: draft.isClosed,
      intervals: draft.isClosed ? [] : [{ open: draft.open, close: draft.close }],
    });
    setAddOpen(false);
    resetDraft();
    toast.success("Special hours added");
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Holidays &amp; special hours</CardTitle>
            <CardDescription>Dates where your hours differ from the usual weekly schedule.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="sm:ml-auto" onClick={() => { resetDraft(); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add date
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {entries.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No special hours yet"
              description="Add holidays or one-off closures so your receptionist doesn't quote your normal hours on those days."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{entry.label}</span>
                      <Badge tone={entry.isClosed ? "neutral" : "info"}>{entry.isClosed ? "Closed" : "Special hours"}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {fmt.day(entry.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      {!entry.isClosed && ` · ${formatIntervals(entry.intervals)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 sm:shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`closed-${entry.id}`}
                        checked={entry.isClosed}
                        onCheckedChange={(checked) =>
                          onUpdate(entry.id, {
                            isClosed: checked,
                            intervals: checked ? [] : entry.intervals.length ? entry.intervals : [{ open: "09:00", close: "17:00" }],
                          })
                        }
                        aria-label={`${entry.label} closed all day`}
                      />
                      <label htmlFor={`closed-${entry.id}`} className="text-xs text-text-secondary cursor-pointer">
                        Closed
                      </label>
                    </div>

                    {!entry.isClosed && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          value={entry.intervals[0]?.open ?? "09:00"}
                          onChange={(e) => onUpdate(entry.id, { intervals: [{ open: e.target.value, close: entry.intervals[0]?.close ?? "17:00" }] })}
                          aria-label={`${entry.label} opening time`}
                          className="w-[7.5rem]"
                        />
                        <span className="text-xs text-text-muted">to</span>
                        <Input
                          type="time"
                          value={entry.intervals[0]?.close ?? "17:00"}
                          onChange={(e) => onUpdate(entry.id, { intervals: [{ open: entry.intervals[0]?.open ?? "09:00", close: e.target.value }] })}
                          aria-label={`${entry.label} closing time`}
                          className="w-[7.5rem]"
                        />
                      </div>
                    )}

                    <button
                      onClick={() => setPendingDelete(entry)}
                      className="rounded-md p-1.5 text-text-muted hover:bg-danger-bg hover:text-danger transition-colors"
                      aria-label={`Remove ${entry.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add special hours</DialogTitle>
            <DialogDescription>Use this for holidays, temporary closures, or a day with different hours.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5">
            <div>
              <Label htmlFor="sh-label">Name</Label>
              <Input id="sh-label" value={draft.label} placeholder="Christmas Day" onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sh-date">Date</Label>
              <Input id="sh-date" type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2.5">
              <Switch id="sh-closed" checked={draft.isClosed} onCheckedChange={(c) => setDraft((d) => ({ ...d, isClosed: c }))} />
              <label htmlFor="sh-closed" className="text-sm text-text-primary cursor-pointer">
                Closed all day
              </label>
            </div>
            {!draft.isClosed && (
              <div className="flex items-center gap-2">
                <Input type="time" value={draft.open} onChange={(e) => setDraft((d) => ({ ...d, open: e.target.value }))} aria-label="Opening time" />
                <span className="text-sm text-text-muted">to</span>
                <Input type="time" value={draft.close} onChange={(e) => setDraft((d) => ({ ...d, close: e.target.value }))} aria-label="Closing time" />
              </div>
            )}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              Add date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this date?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.label} will be removed, and your normal weekly hours will apply on that date again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (pendingDelete) onRemove(pendingDelete.id);
                setPendingDelete(null);
                toast("Special hours removed");
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
