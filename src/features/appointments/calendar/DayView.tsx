import { CalendarDays } from "lucide-react";
import type { Appointment } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { isoDay } from "@/data/generator";
import { formatDurationMinutes } from "@/services/business";

const STATUS_TONE: Record<Appointment["status"], "success" | "warning" | "info" | "neutral" | "danger"> = {
  confirmed: "success",
  pending: "warning",
  rescheduled: "info",
  cancelled: "neutral",
  completed: "neutral",
};

export function DayView({ day, appointments, onSelect }: { day: Date; appointments: Appointment[]; onSelect: (id: string) => void }) {
  const key = isoDay(day);
  const dayAppointments = appointments.filter((a) => a.date === key).sort((a, b) => a.time.localeCompare(b.time));

  if (dayAppointments.length === 0) {
    return <EmptyState icon={CalendarDays} title="No appointments on this day" description="Try navigating to another day, or clear a filter." />;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {dayAppointments.map((a) => (
        <li key={a.id}>
          <button onClick={() => onSelect(a.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors">
            <span className="w-16 shrink-0 text-sm font-semibold text-text-primary">{a.time}</span>
            <Avatar name={a.customerName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary truncate">{a.customerName}</p>
              <p className="text-xs text-text-muted truncate">
                {a.service.name} · {formatDurationMinutes(a.service.durationMin)}
              </p>
            </div>
            <Badge tone={STATUS_TONE[a.status]} className="capitalize shrink-0">
              {a.status}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
