"use client";

import { CalendarDays } from "lucide-react";
import type { Appointment } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableHead } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { CustomerLink } from "@/components/shared/CustomerLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

import type { AppointmentSortField } from "@/services/appointments";
import type { SortDirection } from "@/services/conversations";
import { useBusinessFormat } from "@/lib/business-format";

const STATUS_TONE: Record<Appointment["status"], "success" | "warning" | "info" | "neutral" | "danger"> = {
  confirmed: "success",
  pending: "warning",
  rescheduled: "info",
  cancelled: "neutral",
  completed: "neutral",
};

const SOURCE_LABELS: Record<Appointment["source"], string> = { voice: "Voice", sms: "SMS", email: "Email", manual: "Manual" };

export function AppointmentsTable({
  appointments,
  onSelect,
  sortBy,
  sortDir,
  onSort,
}: {
  appointments: Appointment[];
  onSelect: (id: string) => void;
  sortBy: AppointmentSortField;
  sortDir: SortDirection;
  onSort: (field: AppointmentSortField) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (appointments.length === 0) {
    return <EmptyState icon={CalendarDays} title="No appointments match these filters" description="Try widening the date range or clearing a filter." />;
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Customer" active={sortBy === "customerName"} direction={sortDir} onClick={() => onSort("customerName")} />
              <TableHead>Service</TableHead>
              <SortableHead label="Date" active={sortBy === "date"} direction={sortDir} onClick={() => onSort("date")} />
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((a) => (
              <TableRow key={a.id} clickable onClick={() => onSelect(a.id)}>
                <TableCell>
                  <CustomerLink customerId={a.customerId} name={a.customerName} />
                </TableCell>
                <TableCell className="text-text-secondary">{a.service.name}</TableCell>
                <TableCell className="text-text-secondary whitespace-nowrap">
                  {fmt.day(a.date, { month: "short", day: "numeric" })} · {a.time}
                </TableCell>
                <TableCell className="text-text-secondary">{SOURCE_LABELS[a.source]}</TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[a.status]} className="capitalize">
                    {a.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-text-secondary whitespace-nowrap">{a.customerPhone}</TableCell>
                <TableCell className="text-text-secondary truncate max-w-[160px]">{a.notes || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {appointments.map((a) => (
          <li key={a.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(a.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(a.id);
                }
              }}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <CustomerLink customerId={a.customerId} name={a.customerName} />
                  <Badge tone={STATUS_TONE[a.status]} className="text-[10px] capitalize shrink-0">
                    {a.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {a.service.name} · {fmt.day(a.date, { month: "short", day: "numeric" })} · {a.time}
                </p>
                <p className="mt-1 text-xs text-text-secondary">{SOURCE_LABELS[a.source]}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AppointmentsTableSkeleton() {
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
