"use client";

import { Phone } from "lucide-react";
import type { Call, Dataset } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableHead } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { CustomerLink } from "@/components/shared/CustomerLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { OUTCOME_TONE } from "@/features/conversations/shared";
import { formatDuration } from "@/lib/utils";
import type { CallSortField } from "@/services/calls";
import type { SortDirection } from "@/services/conversations";
import { useBusinessFormat } from "@/lib/business-format";

function appointmentResult(call: Call, dataset: Dataset): string {
  const conv = dataset.conversations.find((c) => c.id === call.conversationId);
  return conv?.bookingAction ?? "—";
}

export function CallsTable({
  calls,
  dataset,
  onSelect,
  sortBy,
  sortDir,
  onSort,
}: {
  calls: Call[];
  dataset: Dataset;
  onSelect: (c: Call) => void;
  sortBy: CallSortField;
  sortDir: SortDirection;
  onSort: (field: CallSortField) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (calls.length === 0) {
    return <EmptyState icon={Phone} title="No calls match these filters" description="Try widening the date range or clearing a filter." />;
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Caller" active={sortBy === "customerName"} direction={sortDir} onClick={() => onSort("customerName")} />
              <SortableHead label="Time" active={sortBy === "timestamp"} direction={sortDir} onClick={() => onSort("timestamp")} />
              <SortableHead label="Duration" active={sortBy === "durationSec"} direction={sortDir} onClick={() => onSort("durationSec")} />
              <TableHead>Intent</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Appointment result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id} clickable onClick={() => onSelect(call)}>
                <TableCell>
                  <CustomerLink customerId={call.customerId} name={call.customerName} />
                  <p className="text-xs text-text-muted mt-0.5 ml-9">{call.customerPhone}</p>
                </TableCell>
                <TableCell className="text-text-secondary whitespace-nowrap">{fmt.dateTime(call.timestamp)}</TableCell>
                <TableCell className="text-text-secondary">{call.outcome === "missed" ? "—" : formatDuration(call.durationSec)}</TableCell>
                <TableCell className="text-text-secondary">{INTENT_LABELS[call.intent]}</TableCell>
                <TableCell>
                  <Badge tone={OUTCOME_TONE[call.outcome]}>{OUTCOME_LABELS[call.outcome]}</Badge>
                </TableCell>
                <TableCell className="text-text-secondary truncate max-w-[220px]">{appointmentResult(call, dataset)}</TableCell>
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
                  <Badge tone={OUTCOME_TONE[call.outcome]} className="text-[10px] shrink-0">
                    {OUTCOME_LABELS[call.outcome]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {INTENT_LABELS[call.intent]} · {call.outcome === "missed" ? "No answer" : formatDuration(call.durationSec)} · {fmt.dateTime(call.timestamp)}
                </p>
                <p className="mt-1 text-xs text-text-secondary truncate">{appointmentResult(call, dataset)}</p>
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
