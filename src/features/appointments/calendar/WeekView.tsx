import type { Appointment } from "@/types";
import { addDays, isoDay } from "@/data/generator";
import { AppointmentChip } from "./AppointmentChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export function WeekView({
  weekStart,
  appointments,
  today,
  onSelect,
}: {
  weekStart: Date;
  appointments: Appointment[];
  today: Date;
  onSelect: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = byDay.get(a.date) ?? [];
    list.push(a);
    byDay.set(a.date, list);
  }
  const todayKey = isoDay(today);
  // Whether *this week* has anything, not whether the filtered set does.
  // Testing `appointments.length` meant navigating to an empty week rendered
  // seven columns each saying "No appointments" instead of the empty state.
  const hasAny = days.some((day) => (byDay.get(isoDay(day))?.length ?? 0) > 0);

  if (!hasAny) {
    return <EmptyState title="No appointments this week" description="Try a different week or clear a filter." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const key = isoDay(day);
        const dayAppointments = (byDay.get(key) ?? []).sort((a, b) => a.time.localeCompare(b.time));
        const isToday = key === todayKey;
        return (
          <div key={key} className="rounded-lg border border-border overflow-hidden min-w-0">
            <div className={cn("px-2.5 py-2 border-b border-border text-center", isToday ? "bg-accent-subtle" : "bg-surface-sunken")}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className={cn("text-sm font-semibold", isToday ? "text-accent-text" : "text-text-primary")}>{day.getDate()}</p>
            </div>
            <div className="p-1.5 space-y-1 min-h-[80px]">
              {dayAppointments.length === 0 ? (
                <p className="px-1.5 py-2 text-center text-[11px] text-text-muted">No appointments</p>
              ) : (
                dayAppointments.map((a) => <AppointmentChip key={a.id} appointment={a} onSelect={onSelect} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
