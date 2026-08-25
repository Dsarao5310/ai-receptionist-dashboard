"use client";

import type { Appointment } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";

import { CalendarDays } from "lucide-react";
import { useBusinessFormat } from "@/lib/business-format";

const STATUS_TONE: Record<Appointment["status"], "success" | "warning" | "info" | "neutral" | "danger"> = {
  confirmed: "success",
  pending: "warning",
  rescheduled: "info",
  cancelled: "neutral",
  completed: "neutral",
};

const SOURCE_LABELS: Record<Appointment["source"], string> = {
  voice: "Voice",
  sms: "SMS",
  email: "Email",
  manual: "Manual",
};

export function UpcomingAppointments({ appointments, onSelect }: { appointments: Appointment[]; onSelect: (a: Appointment) => void }) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader>
        <CardTitle className="text-section">Upcoming appointments</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing on the books yet"
            description="Appointments booked by your AI receptionist will appear here."
          />
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {appointments.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onSelect(a)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
                >
                  <Avatar name={a.customerName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary truncate">{a.customerName}</span>
                    <span className="mt-0.5 block truncate text-xs text-text-muted">{a.service.name} · {SOURCE_LABELS[a.source]}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={STATUS_TONE[a.status]} className="text-[10px] capitalize">
                      {a.status}
                    </Badge>
                    <span className="text-[11px] text-text-muted">
                      {fmt.day(a.date, { month: "short", day: "numeric" })} · {a.time}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function UpcomingAppointmentsSkeleton() {
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader>
        <CardTitle className="text-section">Upcoming appointments</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 -mx-5 -my-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </CardContent>
    </Card>
  );
}
