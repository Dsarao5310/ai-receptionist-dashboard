import type { Appointment } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<Appointment["status"], string> = {
  confirmed: "bg-success",
  pending: "bg-warning",
  rescheduled: "bg-info",
  cancelled: "bg-text-muted",
  completed: "bg-text-muted",
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
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect(appointment.id);
      }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1 text-left transition-colors hover:border-border-strong hover:bg-surface-hover",
        appointment.status === "cancelled" && "opacity-60",
        size === "sm" ? "text-[11px]" : "text-xs"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[appointment.status])} />
      <span className="shrink-0 font-medium text-text-secondary">{appointment.time}</span>
      <span className="truncate text-text-primary">{appointment.customerName}</span>
    </button>
  );
}
