import { CalendarCheck2, Clock3 } from "lucide-react";
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
  const monthAppointments = appointments
    .filter((appointment) => appointment.date.startsWith(`${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-border bg-surface-sunken/70">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
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
                    "min-h-[118px] border-b border-r border-border p-2 transition-colors hover:bg-surface-hover/40",
                    i % 7 === 6 && "border-r-0",
                    i >= 35 && "border-b-0",
                    !inMonth && "bg-surface-sunken/35",
                    inMonth && (i % 7 === 0 || i % 7 === 6) && "bg-surface-sunken/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-semibold",
                        isToday ? "bg-accent text-text-on-accent shadow-sm" : inMonth ? "text-text-primary" : "text-text-muted"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {dayAppointments.length > 0 && (
                      <span className="text-[10px] font-medium text-text-muted">{dayAppointments.length}</span>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {visible.map((a) => (
                      <AppointmentChip key={a.id} appointment={a} onSelect={onSelect} />
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={() => onShowMore(day)}
                        className="w-full rounded-md px-2 py-1 text-left text-[11px] font-semibold text-accent-text transition-colors hover:bg-accent-subtle"
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
      </div>

      <aside className="overflow-hidden rounded-xl border border-border bg-surface-sunken/35">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text-primary">Month agenda</p>
            <p className="mt-0.5 text-xs text-text-muted">Next scheduled visits</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent-text">
            <CalendarCheck2 className="h-4 w-4" />
          </span>
        </div>
        <div className="space-y-2 p-2.5">
          {monthAppointments.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <CalendarCheck2 className="mx-auto h-5 w-5 text-text-muted" />
              <p className="mt-2 text-sm font-medium text-text-secondary">No appointments</p>
              <p className="mt-1 text-xs text-text-muted">This month is currently clear.</p>
            </div>
          ) : (
            monthAppointments.slice(0, 7).map((appointment) => (
              <button
                key={appointment.id}
                onClick={() => onSelect(appointment.id)}
                className="group flex w-full gap-3 rounded-xl border border-transparent bg-surface px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-subtle text-accent-text">
                  <span className="text-[9px] font-semibold uppercase leading-none">
                    {new Date(`${appointment.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}
                  </span>
                  <span className="mt-0.5 text-sm font-bold leading-none">{Number(appointment.date.slice(-2))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-text-primary">{appointment.customerName}</span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-text-muted">
                    <Clock3 className="h-3 w-3" /> {appointment.time} · {appointment.service.name}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
