"use client";

import { Bot, User, CheckCircle2, Circle, Mail, Phone, CalendarCheck } from "lucide-react";
import type { Call, Dataset } from "@/types";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { OUTCOME_TONE } from "@/features/conversations/shared";
import { formatDuration } from "@/lib/utils";
import { useBusinessFormat } from "@/lib/business-format";

export function CallDrawer({
  call,
  dataset,
  open,
  onOpenChange,
}: {
  call: Call | null;
  dataset: Dataset | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (!call || !dataset) return null;

  const customer = dataset.customers.find((c) => c.id === call.customerId);
  const appointment = call.appointmentId ? dataset.appointments.find((a) => a.id === call.appointmentId) : undefined;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={call.customerName} />
            <div className="min-w-0">
              <DrawerTitle className="truncate">{call.customerName}</DrawerTitle>
              <DrawerDescription>
                {fmt.dateTime(call.timestamp)}
                {call.outcome !== "missed" && ` · ${formatDuration(call.durationSec)}`}
              </DrawerDescription>
            </div>
          </div>
          <DrawerClose />
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{INTENT_LABELS[call.intent]}</Badge>
            <Badge tone={OUTCOME_TONE[call.outcome]}>{OUTCOME_LABELS[call.outcome]}</Badge>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">AI summary</p>
            <p className="text-sm text-text-primary">{call.summary}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Booking result</p>
            {appointment ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
                <CalendarCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <div className="text-sm text-text-primary">
                  {appointment.service.name} · {fmt.day(appointment.date, { month: "short", day: "numeric" })} at {appointment.time}
                  <span className="block text-xs text-text-muted mt-0.5 capitalize">{appointment.status}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No booking resulted from this call.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">What the AI did</p>
            <ul className="space-y-1.5">
              {call.actions.map((step) => (
                <li key={step.label} className="flex items-center gap-2 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-text-muted shrink-0" />
                  )}
                  <span className={step.done ? "text-text-primary" : "text-text-muted"}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Recording</p>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong px-3.5 py-3 text-xs text-text-muted">
              Recording playback will appear here once Voice is connected to a live provider.
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Transcript</p>
            {call.outcome === "missed" ? (
              <p className="text-sm text-text-muted italic">No transcript — the call wasn&apos;t answered.</p>
            ) : (
              <div className="space-y-3">
                {call.transcript.map((line, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
                        (line.speaker === "ai" ? "bg-accent-subtle text-accent-text" : "bg-surface-sunken text-text-secondary")
                      }
                    >
                      {line.speaker === "ai" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary">{line.text}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{line.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Contact</p>
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <Phone className="h-3.5 w-3.5 text-text-muted" />
              {call.customerPhone}
            </div>
            {customer && (
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <Mail className="h-3.5 w-3.5 text-text-muted" />
                {customer.email}
              </div>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
