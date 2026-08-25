import type { Appointment } from "@/types";
import { addDays, isoDay } from "@/data/generator";
import { AppointmentChip } from "./AppointmentChip";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;
const MAX_DOTS = 5;

const STATUS_DOT: Record<Appointment["status"], string> = {
  confirmed: "bg-success",
  pending: "bg-warning",
  rescheduled: "bg-info",
  cancelled: "bg-text-muted",
  completed: "bg-text-muted",
};

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
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 bg-surface-sunken">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
            {/* Full name reads better once there's room for it; below sm every
                extra character is pressure the day cells don't have to spare. */}
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
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
          const dots = dayAppointments.slice(0, MAX_DOTS);
          const dotOverflow = dayAppointments.length - dots.length;

          return (
            <div
              key={key}
              className={cn(
                "min-h-[64px] border-b border-r border-border p-1 sm:min-h-[104px] sm:p-1.5",
                i % 7 === 6 && "border-r-0",
                !inMonth && "bg-surface-sunken/40"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                  isToday ? "bg-accent text-text-on-accent" : inMonth ? "text-text-primary" : "text-text-muted"
                )}
              >
                {day.getDate()}
              </span>

              {/* Below sm a day cell is ~30-45px wide — even "11:17" alone
                  overflows that, so a row of status dots replaces the chip
                  list entirely rather than truncating mid-digit. Tapping the
                  dot row opens Day view for the date, the same place "+N
                  more" already leads on the full-size grid. */}
              {dayAppointments.length > 0 && (
                <button
                  onClick={() => onShowMore(day)}
                  aria-label={`${dayAppointments.length} appointment${dayAppointments.length === 1 ? "" : "s"} on ${day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  className="mt-1 flex w-full flex-wrap items-center gap-1 sm:hidden"
                >
                  {dots.map((a) => (
                    <span key={a.id} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[a.status])} />
                  ))}
                  {dotOverflow > 0 && <span className="text-[9px] font-medium text-text-muted">+{dotOverflow}</span>}
                </button>
              )}

              <div className="mt-1 hidden space-y-1 sm:block">
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
