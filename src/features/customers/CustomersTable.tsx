"use client";

import { Users, SearchX } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableHead } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

import { CHANNEL_ICONS } from "@/features/conversations/shared";
import type { CustomerListItem, CustomerSortField } from "@/services/customers";
import type { SortDirection } from "@/services/conversations";
import { STATUS_LABEL, STATUS_TONE } from "./shared";
import { useBusinessFormat } from "@/lib/business-format";

export function CustomersTable({
  customers,
  onSelect,
  sortBy,
  sortDir,
  onSort,
  filtered,
}: {
  customers: CustomerListItem[];
  onSelect: (id: string) => void;
  sortBy: CustomerSortField;
  sortDir: SortDirection;
  onSort: (field: CustomerSortField) => void;
  filtered: boolean;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (customers.length === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="No customers match these filters"
        description="Try a different search term or clear a filter."
      />
    ) : (
      <EmptyState icon={Users} title="No customers yet" description="Customers will appear here as conversations and bookings come in." />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Customer" active={sortBy === "name"} direction={sortDir} onClick={() => onSort("name")} />
              <TableHead>Contact</TableHead>
              <SortableHead
                label="Last interaction"
                active={sortBy === "lastInteraction"}
                direction={sortDir}
                onClick={() => onSort("lastInteraction")}
              />
              <SortableHead
                label="Appointments"
                active={sortBy === "totalAppointments"}
                direction={sortDir}
                onClick={() => onSort("totalAppointments")}
              />
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => {
              const ChannelIcon = CHANNEL_ICONS[c.lastChannel];
              return (
                <TableRow
                  key={c.id}
                  clickable
                  tabIndex={0}
                  role="button"
                  aria-label={`View details for ${c.name}`}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(c.id);
                    }
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} size="sm" />
                      <span className="font-medium truncate">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-text-secondary whitespace-nowrap">{c.phone}</p>
                    <p className="text-xs text-text-muted truncate max-w-[180px]">{c.email}</p>
                  </TableCell>
                  <TableCell className="text-text-secondary whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <ChannelIcon className="h-3.5 w-3.5 text-text-muted" />
                      {fmt.relative(c.lastInteraction)}
                    </span>
                  </TableCell>
                  <TableCell className="text-text-secondary whitespace-nowrap">
                    {c.totalAppointments} total
                    {c.upcomingAppointment && (
                      <span className="block text-xs text-accent-text">
                        Next {fmt.day(c.upcomingAppointment.date, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {customers.map((c) => {
          const ChannelIcon = CHANNEL_ICONS[c.lastChannel];
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                aria-label={`View details for ${c.name}`}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors"
              >
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text-primary truncate">{c.name}</span>
                    <Badge tone={STATUS_TONE[c.status]} className="text-[10px] shrink-0">
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-muted truncate">
                    {c.phone} · {c.email}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                    <ChannelIcon className="h-3 w-3" />
                    {fmt.relative(c.lastInteraction)} · {c.totalAppointments} appt{c.totalAppointments === 1 ? "" : "s"}
                    {c.upcomingAppointment && ` · Next ${fmt.day(c.upcomingAppointment.date, { month: "short", day: "numeric" })}`}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function CustomersTableSkeleton() {
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
