import { CalendarDays, Clock3 } from "lucide-react";
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
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-surface-sunken/60 px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-text-primary">Daily agenda</p>
          <p className="mt-0.5 text-xs text-text-muted">{dayAppointments.length} appointment{dayAppointments.length === 1 ? "" : "s"} scheduled</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
          <CalendarDays className="h-4 w-4" />
        </span>
      </div>
      <ul className="relative divide-y divide-border before:absolute before:bottom-6 before:left-[95px] before:top-6 before:w-px before:bg-border sm:before:left-[119px]">
      {dayAppointments.map((a) => (
        <li key={a.id} className="relative">
          <button onClick={() => onSelect(a.id)} className="group flex w-full items-center gap-3 px-3 py-4 text-left transition-colors hover:bg-surface-hover/60 sm:px-5">
            <span className="flex w-16 shrink-0 items-center gap-1.5 text-sm font-semibold text-text-primary sm:w-20">
              <Clock3 className="h-3.5 w-3.5 text-text-muted" /> {a.time}
            </span>
            <span className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-surface transition-transform group-hover:scale-125" />
            <Avatar name={a.customerName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{a.customerName}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {a.service.name} · {formatDurationMinutes(a.service.durationMin)}
              </p>
            </div>
            <Badge tone={STATUS_TONE[a.status]} className="hidden shrink-0 capitalize sm:inline-flex">
              {a.status}
            </Badge>
          </button>
        </li>
      ))}
      </ul>
    </div>
  );
}
