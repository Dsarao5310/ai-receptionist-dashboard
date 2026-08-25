"use client";

import type { Conversation } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableHead } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CustomerLink } from "@/components/shared/CustomerLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CHANNEL_LABELS, INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { CHANNEL_ICONS, OUTCOME_TONE } from "./shared";

import { MessagesSquare, SearchX } from "lucide-react";
import type { SortDirection, SortField } from "@/services/conversations";
import { useBusinessFormat } from "@/lib/business-format";

export function ConversationsTable({
  conversations,
  onSelect,
  sortBy,
  sortDir,
  onSort,
  filtered,
  onClearFilters,
}: {
  conversations: Conversation[];
  onSelect: (c: Conversation) => void;
  sortBy: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
  filtered: boolean;
  onClearFilters: () => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (conversations.length === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="No conversations match these filters"
        description="Try a different search term, a wider date range, or clear the filters below."
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations yet"
        description="Conversations will appear here as your AI receptionist handles calls, texts, and emails."
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table minWidth="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <SortableHead label="Customer" active={sortBy === "customerName"} direction={sortDir} onClick={() => onSort("customerName")} />
              <TableHead>Channel</TableHead>
              <SortableHead label="Time" active={sortBy === "timestamp"} direction={sortDir} onClick={() => onSort("timestamp")} />
              <TableHead>Intent</TableHead>
              <TableHead>Outcome</TableHead>
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
                    <Badge tone="neutral">
                      <Icon className="h-3 w-3" />
                      {CHANNEL_LABELS[c.channel]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-secondary whitespace-nowrap">{fmt.dateTime(c.timestamp)}</TableCell>
                  <TableCell className="text-text-secondary">{INTENT_LABELS[c.intent]}</TableCell>
                  <TableCell>
                    <Badge tone={OUTCOME_TONE[c.outcome]} dot>
                      {OUTCOME_LABELS[c.outcome]}
                    </Badge>
                  </TableCell>
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
                    <Badge tone={OUTCOME_TONE[c.outcome]} dot className="text-[10px] shrink-0">
                      {OUTCOME_LABELS[c.outcome]}
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                    <Icon className="h-3 w-3" />
                    {CHANNEL_LABELS[c.channel]} · {INTENT_LABELS[c.intent]} · {fmt.dateTime(c.timestamp)}
                  </p>
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
