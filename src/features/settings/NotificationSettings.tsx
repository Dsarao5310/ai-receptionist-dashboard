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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <caption className="sr-only">Notification preferences by event and channel</caption>
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Event
                </th>
                {CHANNELS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {NOTIFICATION_EVENTS.map((event) => (
                <tr key={event.key}>
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <span className="block text-text-primary">{event.label}</span>
                    <span className="block text-xs text-text-muted">{event.description}</span>
                  </th>
                  {CHANNELS.map((channel) => (
                    <td key={channel.key} className="py-3 text-center">
                      <Switch
                        checked={notifications[event.key][channel.key]}
                        onCheckedChange={(v) => setNotification(event.key, channel.key, v)}
                        aria-label={`${event.label} via ${channel.label}${ready[channel.key] ? "" : " (not available yet)"}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
