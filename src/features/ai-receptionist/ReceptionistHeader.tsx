"use client";

import { useState } from "react";
import { Mail, MessageSquare, Phone, Power } from "lucide-react";
import type { AIConfiguration, ReceptionistStatus } from "@/types";
import type { ReceptionistActivity } from "@/services/ai-receptionist";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/lib/store/toast";

import { cn } from "@/lib/utils";
import { useBusinessFormat } from "@/lib/business-format";

const CHANNEL_META = [
  { key: "voice", label: "Voice", icon: Phone, hint: "Phone calls answered by your receptionist" },
  { key: "sms", label: "SMS", icon: MessageSquare, hint: "Text message conversations" },
  { key: "email", label: "Email", icon: Mail, hint: "Email enquiries" },
] as const;

const OVERALL_TONE = {
  online: { tone: "success" as const, label: "Online", dot: "bg-success" },
  degraded: { tone: "warning" as const, label: "Partially active", dot: "bg-warning" },
  offline: { tone: "neutral" as const, label: "Offline", dot: "bg-text-muted" },
};

export function ReceptionistHeader({
  ai,
  status,
  activity,
  onToggleEnabled,
  onToggleChannel,
}: {
  ai: AIConfiguration;
  status: ReceptionistStatus;
  activity: ReceptionistActivity;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleChannel: (channel: "voice" | "sms" | "email", enabled: boolean) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  const [confirmOff, setConfirmOff] = useState(false);
  const overall = OVERALL_TONE[status.overall];

  function requestToggle(next: boolean) {
    // Turning it on is harmless; turning it off stops automated customer
    // handling, so that direction gets a confirmation.
    if (next) {
      onToggleEnabled(true);
      toast.success("AI receptionist is back online");
    } else {
      setConfirmOff(true);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-text-primary">AI Receptionist</h3>
                <Badge tone={overall.tone} className="gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", overall.dot)} />
                  {overall.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {ai.enabled
                  ? "Answering customers automatically across your active channels."
                  : "Paused — customer messages are not being handled automatically."}
              </p>
            </div>

            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-2.5 sm:shrink-0",
                ai.enabled ? "border-border-interactive bg-accent-subtle/40" : "border-border bg-surface-sunken"
              )}
            >
              <div className="text-right">
                <p className="text-sm font-semibold text-text-primary">{ai.enabled ? "Active" : "Paused"}</p>
                <p className="text-[11px] text-text-muted">Master control</p>
              </div>
              <Switch
                checked={ai.enabled}
                onCheckedChange={requestToggle}
                aria-label="AI receptionist enabled"
                className="scale-110"
              />
            </div>
          </div>

          {/* Today's activity — read from the same dataset as Overview and Analytics. */}
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Conversations today", value: activity.conversationsToday.toLocaleString() },
              { label: "Appointments booked", value: activity.appointmentsToday.toLocaleString() },
              { label: "Handled after hours", value: activity.afterHoursToday.toLocaleString() },
              { label: "Last activity", value: activity.lastActivity ? fmt.relative(activity.lastActivity) : "—" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
                <dd className="text-lg font-semibold tabular-nums text-text-primary">{stat.value}</dd>
                <dt className="mt-0.5 text-[11px] text-text-muted">{stat.label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Channels</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CHANNEL_META.map(({ key, label, icon: Icon, hint }) => {
                const on = ai.channels[key];
                const effective = ai.enabled && on;
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      effective ? "border-border bg-surface" : "border-border bg-surface-sunken"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", effective ? "text-accent-text" : "text-text-muted")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">{label}</p>
                      <p className="text-[11px] text-text-muted">
                        {!ai.enabled ? "Paused with receptionist" : on ? "Active" : "Disabled"}
                      </p>
                    </div>
                    <Switch
                      checked={on}
                      disabled={!ai.enabled}
                      onCheckedChange={(v) => {
                        onToggleChannel(key, v);
                        toast.success(`${label} ${v ? "enabled" : "disabled"}`);
                      }}
                      aria-label={`${label} channel — ${hint}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off your AI receptionist?</DialogTitle>
            <DialogDescription>
              Calls, texts and emails will no longer be answered automatically. Customers won&apos;t be able to book, reschedule or get
              answers until you turn it back on.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOff(false)}>
              Keep it on
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onToggleEnabled(false);
                setConfirmOff(false);
                toast("AI receptionist turned off", {
                  description: "Customer messages are no longer handled automatically.",
                  action: { label: "Undo", onClick: () => onToggleEnabled(true) },
                });
              }}
            >
              <Power className="h-3.5 w-3.5" /> Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
