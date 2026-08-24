import type { Appointment } from "@/types";
import { addDays, isoDay } from "@/data/generator";
import { AppointmentChip } from "./AppointmentChip";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

export function MonthView({
  anchor,
  appointments,
  today,
  onSelect,
  onShowMore,
}: {
  anchor: Date;
  appointments: Appointment[];
  today: Date;
  onSelect: (id: string) => void;
  onShowMore: (date: Date) => void;
}) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = byDay.get(a.date) ?? [];
    list.push(a);
    byDay.set(a.date, list);
  }

  const todayKey = isoDay(today);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-7 bg-surface-sunken">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const key = isoDay(day);
              const dayAppointments = (byDay.get(key) ?? []).sort((a, b) => a.time.localeCompare(b.time));
              const inMonth = day.getMonth() === anchor.getMonth();
              const isToday = key === todayKey;
              const visible = dayAppointments.slice(0, MAX_VISIBLE);
              const overflow = dayAppointments.length - visible.length;

              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[104px] border-b border-r border-border p-1.5",
                    i % 7 === 6 && "border-r-0",
                    !inMonth && "bg-surface-sunken/40"
                  )}
                >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium",
                        isToday ? "bg-accent text-text-on-accent" : inMonth ? "text-text-primary" : "text-text-muted"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  <div className="mt-1 space-y-1">
                    {visible.map((a) => (
                      <AppointmentChip key={a.id} appointment={a} onSelect={onSelect} />
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={() => onShowMore(day)}
                        className="w-full text-left text-[11px] font-medium text-accent-text hover:underline px-1.5"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
    </div>
  );
}
