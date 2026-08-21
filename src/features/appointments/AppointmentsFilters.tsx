"use client";

import { Search } from "lucide-react";
import type { AppointmentSource, AppointmentStatus, DateRangeKey } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { DateRangeControl } from "@/components/shared/DateRangeControl";
import type { Bounds } from "@/lib/date-range";

const STATUS_OPTIONS: (AppointmentStatus | "all")[] = ["all", "confirmed", "pending", "rescheduled", "cancelled", "completed"];
const SOURCE_OPTIONS: (AppointmentSource | "all")[] = ["all", "voice", "sms", "email", "manual"];
const SOURCE_LABELS: Record<AppointmentSource, string> = { voice: "Voice", sms: "SMS", email: "Email", manual: "Manual" };

export function AppointmentsFilters({
  search,
  onSearch,
  status,
  onStatus,
  source,
  onSource,
  rangeKey,
  customBounds,
  onRange,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: AppointmentStatus | "all";
  onStatus: (v: AppointmentStatus | "all") => void;
  source: AppointmentSource | "all";
  onSource: (v: AppointmentSource | "all") => void;
  rangeKey: DateRangeKey;
  customBounds: Bounds | null;
  onRange: (key: DateRangeKey, custom?: Bounds) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input placeholder="Search customer or service..." className="pl-9" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <div className="sm:ml-auto">
          <DateRangeControl rangeKey={rangeKey} customBounds={customBounds} onChange={onRange} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={(v) => onStatus(v as AppointmentStatus | "all")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((v) => (
              <SelectItem key={v} value={v} className="capitalize">
                {v === "all" ? "All statuses" : v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={(v) => onSource(v as AppointmentSource | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v === "all" ? "All sources" : SOURCE_LABELS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
