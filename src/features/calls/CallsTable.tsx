"use client";

import { Phone, SearchX } from "lucide-react";
import type { Call } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableHead } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CustomerLink } from "@/components/shared/CustomerLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { OUTCOME_TONE } from "@/features/conversations/shared";
import { formatDuration } from "@/lib/utils";
import type { CallSortField } from "@/services/calls";
import type { SortDirection } from "@/services/conversations";
import { useBusinessFormat } from "@/lib/business-format";

export function CallsTable({
  calls,
  onSelect,
  sortBy,
  sortDir,
  onSort,
  filtered,
  onClearFilters,
}: {
  calls: Call[];
  onSelect: (c: Call) => void;
  sortBy: CallSortField;
  sortDir: SortDirection;
  onSort: (field: CallSortField) => void;
  filtered: boolean;
  onClearFilters: () => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (calls.length === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="No calls match these filters"
        description="Try a different search term, a wider date range, or clear the filters below."
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Phone} title="No calls yet" description="Calls will appear here as your AI receptionist answers or misses them." />
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table minWidth="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <SortableHead label="Caller" active={sortBy === "customerName"} direction={sortDir} onClick={() => onSort("customerName")} />
              <SortableHead label="Time" active={sortBy === "timestamp"} direction={sortDir} onClick={() => onSort("timestamp")} />
              <SortableHead label="Duration" active={sortBy === "durationSec"} direction={sortDir} onClick={() => onSort("durationSec")} />
              <TableHead>Intent</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id} clickable onClick={() => onSelect(call)}>
                <TableCell>
                  <CustomerLink customerId={call.customerId} name={call.customerName} />
                  {/* Indent matches the avatar (28px, size="sm") plus the 10px gap
                      CustomerLink places between avatar and name, so this line lands
                      directly under the name rather than a couple of pixels off. */}
                  <p className="text-xs text-text-muted mt-0.5 ml-[38px]">{call.customerPhone}</p>
                </TableCell>
                <TableCell className="text-text-secondary whitespace-nowrap">{fmt.dateTime(call.timestamp)}</TableCell>
                <TableCell className="text-text-secondary">{call.outcome === "missed" ? "—" : formatDuration(call.durationSec)}</TableCell>
                <TableCell className="text-text-secondary">{INTENT_LABELS[call.intent]}</TableCell>
                <TableCell>
                  <Badge tone={OUTCOME_TONE[call.outcome]} dot>
                    {OUTCOME_LABELS[call.outcome]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {calls.map((call) => (
          <li key={call.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(call)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(call);
                }
              }}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <CustomerLink customerId={call.customerId} name={call.customerName} />
                  <Badge tone={OUTCOME_TONE[call.outcome]} dot className="text-[10px] shrink-0">
                    {OUTCOME_LABELS[call.outcome]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {INTENT_LABELS[call.intent]} · {call.outcome === "missed" ? "No answer" : formatDuration(call.durationSec)} · {fmt.dateTime(call.timestamp)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CallsTableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20 hidden sm:block" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}
