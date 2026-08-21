import type { Appointment } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<Appointment["status"], string> = {
  confirmed: "bg-success",
  pending: "bg-warning",
  rescheduled: "bg-info",
  cancelled: "bg-text-muted",
  completed: "bg-text-muted",
};

const STATUS_SURFACE: Record<Appointment["status"], string> = {
  confirmed: "border-success/20 bg-success/[0.06] hover:border-success/35",
  pending: "border-warning/25 bg-warning/[0.07] hover:border-warning/40",
  rescheduled: "border-info/25 bg-info/[0.07] hover:border-info/40",
  cancelled: "border-border bg-surface-sunken/60",
  completed: "border-border bg-surface-sunken/60",
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
        "group flex w-full items-center rounded-lg border text-left transition-all hover:-translate-y-px hover:shadow-sm",
        STATUS_SURFACE[appointment.status],
        appointment.status === "cancelled" && "opacity-60",
        size === "sm" ? "gap-1.5 px-2 py-1 text-[11px]" : "gap-2.5 px-3 py-2.5 text-xs"
      )}
    >
      <span className={cn("shrink-0 rounded-full ring-2 ring-surface", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", STATUS_DOT[appointment.status])} />
      {size === "sm" ? (
        <>
          <span className="shrink-0 font-semibold text-text-secondary">{appointment.time}</span>
          <span className="truncate font-medium text-text-primary">{appointment.customerName}</span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-text-primary">{appointment.customerName}</span>
            <span className="mt-0.5 block truncate text-[11px] text-text-muted">{appointment.service.name}</span>
          </span>
          <span className="shrink-0 rounded-md bg-surface/80 px-2 py-1 font-semibold text-text-secondary">{appointment.time}</span>
        </>
      )}
    </button>
  );
}
