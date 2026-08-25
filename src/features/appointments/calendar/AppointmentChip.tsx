import { CalendarCheck, CalendarClock, CircleSlash, Clock, RotateCw } from "lucide-react";
import type { Appointment } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Status carried by background tint plus an icon — never colour alone. The
 * icon's shape is what actually distinguishes "pending" from "rescheduled"
 * for anyone who cannot rely on hue; the tint is what makes a full month grid
 * scannable at a glance instead of a wall of identical white chips.
 */
const STATUS_STYLE: Record<
  Appointment["status"],
  { icon: typeof CalendarCheck; bg: string; text: string }
> = {
  confirmed: { icon: CalendarCheck, bg: "bg-success-bg", text: "text-success" },
  pending: { icon: Clock, bg: "bg-warning-bg", text: "text-warning" },
  rescheduled: { icon: RotateCw, bg: "bg-info-bg", text: "text-info" },
  cancelled: { icon: CircleSlash, bg: "bg-surface-sunken", text: "text-text-muted" },
  completed: { icon: CalendarClock, bg: "bg-surface-sunken", text: "text-text-secondary" },
};

export function AppointmentChip({
  appointment,
  onSelect,
  size = "sm",
}: {
  appointment: Appointment;
  onSelect: (id: string) => void;
  size?: "sm" | "md";
}) {
  const style = STATUS_STYLE[appointment.status];

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect(appointment.id);
      }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors",
        "ring-1 ring-inset ring-transparent hover:ring-border-interactive",
        style.bg,
        appointment.status === "cancelled" && "opacity-70",
        size === "sm" ? "text-[11px]" : "text-xs"
      )}
    >
      <style.icon className={cn("h-3 w-3 shrink-0", style.text)} aria-hidden />
      <span className={cn("shrink-0 font-semibold tabular-nums", style.text)}>{appointment.time}</span>
      <span className="truncate text-text-primary">{appointment.customerName}</span>
    </button>
  );
}
