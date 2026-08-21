"use client";

import type { Conversation } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableHead } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { CustomerLink } from "@/components/shared/CustomerLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CHANNEL_LABELS, INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { CHANNEL_ICONS, OUTCOME_TONE } from "./shared";

import { MessagesSquare } from "lucide-react";
import type { SortDirection, SortField } from "@/services/conversations";
import { useBusinessFormat } from "@/lib/business-format";

export function ConversationsTable({
  conversations,
  onSelect,
  sortBy,
  sortDir,
  onSort,
}: {
  conversations: Conversation[];
  onSelect: (c: Conversation) => void;
  sortBy: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations match these filters"
        description="Try widening the date range or clearing a filter."
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Customer" active={sortBy === "customerName"} direction={sortDir} onClick={() => onSort("customerName")} />
              <TableHead>Channel</TableHead>
              <SortableHead label="Time" active={sortBy === "timestamp"} direction={sortDir} onClick={() => onSort("timestamp")} />
              <TableHead>Intent</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Booking action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.map((c) => {
              const Icon = CHANNEL_ICONS[c.channel];
              return (
                <TableRow key={c.id} clickable onClick={() => onSelect(c)}>
                  <TableCell>
                    <CustomerLink customerId={c.customerId} name={c.customerName} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <Icon className="h-3.5 w-3.5" />
                      {CHANNEL_LABELS[c.channel]}
                    </span>
                  </TableCell>
                  <TableCell className="text-text-secondary whitespace-nowrap">{fmt.dateTime(c.timestamp)}</TableCell>
                  <TableCell className="text-text-secondary">{INTENT_LABELS[c.intent]}</TableCell>
                  <TableCell>
                    <Badge tone={OUTCOME_TONE[c.outcome]}>{OUTCOME_LABELS[c.outcome]}</Badge>
                  </TableCell>
                  <TableCell className="text-text-secondary truncate max-w-[220px]">{c.bookingAction ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {conversations.map((c) => {
          const Icon = CHANNEL_ICONS[c.channel];
          return (
            <li key={c.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c);
                  }
                }}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <CustomerLink customerId={c.customerId} name={c.customerName} />
                    <Badge tone={OUTCOME_TONE[c.outcome]} className="text-[10px] shrink-0">
                      {OUTCOME_LABELS[c.outcome]}
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                    <Icon className="h-3 w-3" />
                    {CHANNEL_LABELS[c.channel]} · {INTENT_LABELS[c.intent]} · {fmt.dateTime(c.timestamp)}
                  </p>
                  {c.bookingAction && <p className="mt-1 text-xs text-text-secondary truncate">{c.bookingAction}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ConversationsTableSkeleton() {
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
