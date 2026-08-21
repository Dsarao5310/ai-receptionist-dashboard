"use client";

import { CalendarCheck2, CircleCheckBig, Clock3 } from "lucide-react";
import type { Appointment } from "@/types";
import { useConfiguration } from "@/lib/store/configuration";
import { businessTodayAsCalendarDate } from "./business-today";
import { useCalendarNav } from "./useCalendarNav";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";

export function AppointmentsCalendar({
  appointments,
  now,
  onSelect,
}: {
  appointments: Appointment[];
  now: Date;
  onSelect: (id: string) => void;
}) {
  const timeZone = useConfiguration((s) => s.business.timezone);
  const today = businessTodayAsCalendarDate(now, timeZone);
  const { view, setView, anchor, setAnchor, go, goToday, label, startOfWeek } = useCalendarNav(today);
  const scheduled = appointments.filter((appointment) => appointment.status !== "cancelled").length;
  const confirmed = appointments.filter((appointment) => appointment.status === "confirmed").length;
  const needsAttention = appointments.filter((appointment) =>
    appointment.status === "pending" || appointment.status === "rescheduled"
  ).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <CalendarToolbar view={view} onView={setView} label={label} onPrev={() => go(-1)} onNext={() => go(1)} onToday={goToday} />

      <div className="grid grid-cols-1 gap-px border-b border-border bg-border sm:grid-cols-3">
        <div className="flex items-center gap-3 bg-surface px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
            <CalendarCheck2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Scheduled</p>
            <p className="mt-0.5 text-lg font-semibold leading-none text-text-primary">{scheduled}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-surface px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
            <CircleCheckBig className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Confirmed</p>
            <p className="mt-0.5 text-lg font-semibold leading-none text-text-primary">{confirmed}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-surface px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <Clock3 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Needs attention</p>
            <p className="mt-0.5 text-lg font-semibold leading-none text-text-primary">{needsAttention}</p>
          </div>
        </div>
      </div>

      <div className="p-3 md:p-5">
        {view === "month" && (
          <MonthView
            anchor={anchor}
            appointments={appointments}
            today={today}
            onSelect={onSelect}
            onShowMore={(day) => {
              setAnchor(day);
              setView("day");
            }}
          />
        )}
        {view === "week" && <WeekView weekStart={startOfWeek(anchor)} appointments={appointments} today={today} onSelect={onSelect} />}
        {view === "day" && <DayView day={anchor} appointments={appointments} onSelect={onSelect} />}
      </div>
    </section>
  );
}
