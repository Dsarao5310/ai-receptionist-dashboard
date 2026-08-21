"use client";

import { useMemo, useState } from "react";
import { addDays, startOfDay } from "@/data/generator";

export type CalendarView = "day" | "week" | "month";

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  return addDays(d, -day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function useCalendarNav(initialDate: Date) {
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(initialDate);

  function go(direction: -1 | 1) {
    if (view === "day") setAnchor((d) => addDays(d, direction));
    else if (view === "week") setAnchor((d) => addDays(d, 7 * direction));
    else setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + direction, 1));
  }

  function goToday() {
    setAnchor(initialDate);
  }

  const label = useMemo(() => {
    if (view === "day") return anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      // Always pass `month` explicitly on both sides — some Intl implementations
      // mis-render DateTimeFormat options that specify day/year but omit month.
      const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `${startLabel} – ${endLabel}`;
    }
    return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [view, anchor]);

  return { view, setView, anchor, setAnchor, go, goToday, label, startOfWeek, startOfMonth };
}
