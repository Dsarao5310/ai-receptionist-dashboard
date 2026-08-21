"use client";

import { Search } from "lucide-react";
import type { ConversationOutcome, DateRangeKey, Intent } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { DateRangeControl } from "@/components/shared/DateRangeControl";
import { INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import type { Bounds } from "@/lib/date-range";

const INTENT_OPTIONS: (Intent | "all")[] = ["all", "booking", "reschedule", "cancel", "hours", "pricing", "services", "other"];
const OUTCOME_OPTIONS: (ConversationOutcome | "all")[] = ["all", "booked", "rescheduled", "cancelled", "answered", "escalated", "missed", "no_action"];

export function CallsFilters({
  search,
  onSearch,
  intent,
  onIntent,
  outcome,
  onOutcome,
  rangeKey,
  customBounds,
  onRange,
}: {
  search: string;
  onSearch: (v: string) => void;
  intent: Intent | "all";
  onIntent: (v: Intent | "all") => void;
  outcome: ConversationOutcome | "all";
  onOutcome: (v: ConversationOutcome | "all") => void;
  rangeKey: DateRangeKey;
  customBounds: Bounds | null;
  onRange: (key: DateRangeKey, custom?: Bounds) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input placeholder="Search caller or phone..." className="pl-9" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <div className="sm:ml-auto">
          <DateRangeControl rangeKey={rangeKey} customBounds={customBounds} onChange={onRange} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={intent} onValueChange={(v) => onIntent(v as Intent | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Intent" />
          </SelectTrigger>
          <SelectContent>
            {INTENT_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v === "all" ? "All intents" : INTENT_LABELS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={outcome} onValueChange={(v) => onOutcome(v as ConversationOutcome | "all")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v === "all" ? "All outcomes" : OUTCOME_LABELS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
