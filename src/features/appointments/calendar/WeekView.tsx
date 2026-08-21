import type { Appointment } from "@/types";
import { addDays, isoDay } from "@/data/generator";
import { AppointmentChip } from "./AppointmentChip";
import { CalendarCheck2 } from "lucide-react";
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
  const hasAny = appointments.length > 0;

  if (!hasAny) {
    return <EmptyState title="No appointments this week" description="Try a different week or clear a filter." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {days.map((day) => {
        const key = isoDay(day);
        const dayAppointments = (byDay.get(key) ?? []).sort((a, b) => a.time.localeCompare(b.time));
        const isToday = key === todayKey;
        return (
          <div key={key} className="grid min-w-0 grid-cols-[76px_minmax(0,1fr)] border-b border-border last:border-b-0 sm:grid-cols-[124px_minmax(0,1fr)]">
            <div className={cn("flex flex-col items-center justify-center border-r border-border px-2 py-4 text-center sm:items-start sm:px-5 sm:text-left", isToday ? "bg-accent-subtle" : "bg-surface-sunken/60")}> 
              <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", isToday ? "text-accent-text" : "text-text-muted")}> 
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className={cn("mt-1 text-xl font-semibold leading-none", isToday ? "text-accent-text" : "text-text-primary")}>{day.getDate()}</p>
              <p className="mt-1 hidden text-[11px] text-text-muted sm:block">{day.toLocaleDateString("en-US", { month: "short" })}</p>
            </div>
            <div className="min-h-[88px] p-3">
              {dayAppointments.length === 0 ? (
                <div className="flex h-full min-h-[62px] items-center gap-2 rounded-xl border border-dashed border-border px-4 text-xs text-text-muted">
                  <CalendarCheck2 className="h-4 w-4" /> Available
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {dayAppointments.map((a) => <AppointmentChip key={a.id} appointment={a} onSelect={onSelect} size="md" />)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
