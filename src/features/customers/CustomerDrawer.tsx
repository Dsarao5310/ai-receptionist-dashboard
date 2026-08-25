"use client";

import { Mail, Phone, CalendarCheck, Clock } from "lucide-react";
import type { Dataset } from "@/types";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CHANNEL_LABELS } from "@/data/constants";
import { CHANNEL_ICONS } from "@/features/conversations/shared";
import { getCustomerDetail } from "@/services/customers";
import { useConfiguration } from "@/lib/store/configuration";
import { cn } from "@/lib/utils";
import { ACTIVITY_ICON, ACTIVITY_LABEL, ACTIVITY_TONE, STATUS_LABEL, STATUS_TONE } from "./shared";
import { useBusinessFormat } from "@/lib/business-format";

export function CustomerDrawer({
  customerId,
  dataset,
  now,
  open,
  onOpenChange,
  onOpenAppointment,
  onOpenConversation,
  onOpenCall,
}: {
  customerId: string | null;
  dataset: Dataset | null;
  now: Date | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenAppointment: (id: string) => void;
  onOpenConversation: (id: string) => void;
  onOpenCall: (id: string) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  // Splitting appointments into upcoming and past compares wall-clock booking
  // times against now, which only makes sense in the business timezone.
  const config = useConfiguration();
  const detail = customerId && dataset && now ? getCustomerDetail(dataset, config, customerId, now) : null;
  if (!detail) return null;

  const { customer, status, appointments, upcomingAppointments, pastAppointments, cancelledAppointments, conversations, channelCounts, timeline } =
    detail;

  function openInteraction(conversationId: string, channel: (typeof conversations)[number]["channel"]) {
    if (channel === "voice") {
      const call = dataset!.calls.find((c) => c.conversationId === conversationId);
      if (call) {
        onOpenCall(call.id);
        return;
      }
    }
    onOpenConversation(conversationId);
  }

  function openTimelineEvent(event: (typeof timeline)[number]) {
    if (event.appointmentId) {
      onOpenAppointment(event.appointmentId);
    } else if (event.callId) {
      onOpenCall(event.callId);
    } else if (event.conversationId) {
      onOpenConversation(event.conversationId);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={customer.name} size="lg" />
            <div className="min-w-0">
              <DrawerTitle className="truncate">{customer.name}</DrawerTitle>
              <DrawerDescription>Customer since {fmt.date(customer.createdAt, { month: "short", year: "numeric" })}</DrawerDescription>
            </div>
          </div>
          <DrawerClose />
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>

          {/* Contact */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Contact</p>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-text-primary">
                <Phone className="h-3.5 w-3.5 text-text-muted" />
                {customer.phone}
              </span>
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${customer.name}`}>
                  Call
                </a>
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-text-primary truncate">
                <Mail className="h-3.5 w-3.5 text-text-muted shrink-0" />
                <span className="truncate">{customer.email}</span>
              </span>
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${customer.email}`} aria-label={`Email ${customer.name}`}>
                  Email
                </a>
              </Button>
            </div>
          </div>

          {/* Appointment summary */}
          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Appointments</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total", value: appointments.length },
                { label: "Upcoming", value: upcomingAppointments.length },
                { label: "Past", value: pastAppointments.length },
                { label: "Cancelled", value: cancelledAppointments.length },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border bg-surface-sunken px-1.5 py-2.5 text-center">
                  <p className="text-base font-semibold text-text-primary">{stat.value}</p>
                  <p className="text-[10px] text-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>

            {upcomingAppointments[0] && (
              <button
                onClick={() => onOpenAppointment(upcomingAppointments[0].id)}
                className="mt-2.5 flex w-full items-start gap-2.5 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-left hover:bg-surface-hover transition-colors"
              >
                <CalendarCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <div className="min-w-0 text-sm text-text-primary">
                  Next: {upcomingAppointments[0].service.name} ·{" "}
                  {fmt.day(upcomingAppointments[0].date, { month: "short", day: "numeric" })} at {upcomingAppointments[0].time}
                  <span className="block text-xs text-text-muted mt-0.5">Tap to view appointment</span>
                </div>
              </button>
            )}
          </div>

          {/* Conversation summary */}
          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Interactions</p>
            <div className="flex items-center gap-3 mb-3 text-xs text-text-secondary">
              {(["voice", "sms", "email"] as const).map((ch) => {
                const Icon = CHANNEL_ICONS[ch];
                return (
                  <span key={ch} className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-text-muted" />
                    {channelCounts[ch]} {CHANNEL_LABELS[ch]}
                  </span>
                );
              })}
            </div>

            {conversations.length === 0 ? (
              <p className="text-sm text-text-muted">No conversations yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {conversations.slice(0, 5).map((conv) => {
                  const Icon = CHANNEL_ICONS[conv.channel];
                  return (
                    <li key={conv.id}>
                      <button
                        onClick={() => openInteraction(conv.id, conv.channel)}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover transition-colors"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-secondary mt-0.5">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-text-primary truncate">{conv.summary}</p>
                          <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmt.dateTime(conv.timestamp)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Timeline */}
          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Timeline</p>
            {timeline.length === 0 ? (
              <EmptyState title="No activity yet" description="Events will appear here as this customer interacts with your business." />
            ) : (
              <ul className="space-y-1">
                {timeline.map((event) => {
                  const Icon = ACTIVITY_ICON[event.type];
                  const clickable = !!(event.appointmentId || event.callId || event.conversationId);
                  const iconToneClass = {
                    success: "bg-success-bg text-success",
                    warning: "bg-warning-bg text-warning",
                    danger: "bg-danger-bg text-danger",
                    neutral: "bg-surface-sunken text-text-secondary",
                    info: "bg-info-bg text-info",
                  }[ACTIVITY_TONE[event.type]];
                  const content = (
                    <>
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5", iconToneClass)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-primary">{ACTIVITY_LABEL[event.type]}</p>
                        <p className="text-xs text-text-muted truncate">{event.detail}</p>
                        <p className="text-[11px] text-text-muted mt-0.5">{fmt.relative(event.timestamp)}</p>
                      </div>
                    </>
                  );
                  return (
                    <li key={event.id}>
                      {clickable ? (
                        <button
                          onClick={() => openTimelineEvent(event)}
                          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover transition-colors"
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-start gap-2.5 px-2.5 py-2">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
