"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { useIntegrations } from "@/lib/store/integrations";
import { NOTIFICATION_EVENTS, useSettings, type NotificationChannels } from "@/lib/store/settings";

/**
 * Notification preferences.
 *
 * Individual toggles, so they save on change — no Save bar.
 *
 * The honesty problem this solves: email and SMS delivery depend on channels
 * that may not be connected. Rather than let someone switch on "text me" and
 * quietly receive nothing, the control stays usable but says plainly that
 * delivery is not available yet, driven by the same derived capability status
 * the rest of the app uses.
 *
 * This used to be a raw `<table>` with a fixed `min-w-[26rem]` (416px), which
 * forced horizontal scroll on a 375px viewport for what is really a 3-channel
 * preference grid. A row-per-event list carries the same information — event,
 * description, one switch per channel with its own visible label — without
 * ever needing a wider viewport than it's given.
 */

const CHANNELS: { key: keyof NotificationChannels; label: string }[] = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
];

export function NotificationSettings() {
  const { notifications, setNotification } = useSettings();
  const capabilities = useIntegrations((s) => s.capabilities);

  const statusOf = (key: string) => capabilities.find((c) => c.key === key)?.status;
  const emailReady = statusOf("email") === "connected";
  const smsReady = statusOf("sms") === "connected";
  const ready: Record<keyof NotificationChannels, boolean> = { inApp: true, email: emailReady, sms: smsReady };

  const unavailable = CHANNELS.filter((c) => !ready[c.key]).map((c) => c.label);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>What you want to hear about, and how. Saved as you change them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unavailable.length > 0 && (
          <p className="rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-xs text-text-secondary">
            {unavailable.join(" and ")} delivery {unavailable.length === 1 ? "is" : "are"} not available yet. You can set a
            preference now — it will start being used once that channel is working.
          </p>
        )}

        <ul className="divide-y divide-border">
          {NOTIFICATION_EVENTS.map((event) => (
            <li key={event.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{event.label}</p>
                <p className="text-xs text-text-muted">{event.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:shrink-0">
                {CHANNELS.map((channel) => (
                  <label key={channel.key} className="flex items-center gap-2 text-xs text-text-secondary">
                    <Switch
                      checked={notifications[event.key][channel.key]}
                      onCheckedChange={(v) => setNotification(event.key, channel.key, v)}
                      aria-label={`${event.label} via ${channel.label}${ready[channel.key] ? "" : " (not available yet)"}`}
                    />
                    {channel.label}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
