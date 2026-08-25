"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  PhoneCall,
  MessageCircleQuestion,
  AlertTriangle,
  PhoneMissed,
} from "lucide-react";
import type { ActivityEvent, ActivityEventType } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { CHANNEL_LABELS } from "@/data/constants";

import { useBusinessFormat } from "@/lib/business-format";

const TYPE_META: Record<ActivityEventType, { icon: typeof CalendarCheck; tone: string; label: string }> = {
  appointment_booked: { icon: CalendarCheck, tone: "bg-success-bg text-success", label: "Appointment booked" },
  appointment_rescheduled: { icon: CalendarClock, tone: "bg-info-bg text-info", label: "Appointment rescheduled" },
  appointment_cancelled: { icon: CalendarX, tone: "bg-surface-sunken text-text-secondary", label: "Appointment cancelled" },
  call_completed: { icon: PhoneCall, tone: "bg-accent-subtle text-accent-text", label: "Call completed" },
  question_answered: { icon: MessageCircleQuestion, tone: "bg-accent-subtle text-accent-text", label: "Question answered" },
  conversation_escalated: { icon: AlertTriangle, tone: "bg-warning-bg text-warning", label: "Escalated to team" },
  conversation_missed: { icon: PhoneMissed, tone: "bg-danger-bg text-danger", label: "Missed call" },
};

export function RecentActivity({ events, onSelect }: { events: ActivityEvent[]; onSelect: (event: ActivityEvent) => void }) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader>
        <CardTitle className="text-section">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {events.length === 0 ? (
          <EmptyState title="No activity in this range" description="Try a wider date range to see what your AI receptionist has been up to." />
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {events.map((event) => {
              const meta = TYPE_META[event.type];
              return (
                <li key={event.id}>
                  <button
                    onClick={() => onSelect(event)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                      <meta.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">{meta.label}</span>
                        <span className="shrink-0 text-xs text-text-muted">{fmt.relative(event.timestamp)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-secondary">
                        {event.customerName} · {CHANNEL_LABELS[event.channel]}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-muted">{event.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentActivitySkeleton() {
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader>
        <CardTitle className="text-section">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 -mx-5 -my-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </CardContent>
    </Card>
  );
}
