"use client";

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

  return (
    <section className="space-y-3">
      <CalendarToolbar view={view} onView={setView} label={label} onPrev={() => go(-1)} onNext={() => go(1)} onToday={goToday} />
      <div>
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
