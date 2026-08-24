"use client";

import * as React from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import type { NormalizedError } from "@/types";
import { useBusinessFormat } from "@/lib/business-format";
import { toast } from "@/lib/store/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import {
  listCalendarsAction,
  pushAppointmentToCalendarAction,
  reconcileAppointmentAction,
  selectCalendarAction,
} from "@/server/actions/calendar";
import { disconnectIntegrationAction, testIntegrationAction } from "@/server/actions/integrations";

/**
 * The calendar administration surface.
 *
 * ── What an operator can see here, and what nobody can ──────────────────────
 * The connected account, the selected calendar and its identifier, both
 * timezones, health, and the bookings where Google and this application
 * disagree. No token, no refresh token, no OAuth client — the server never
 * sends them, so there is nothing here to hide.
 *
 * ── The reconciliation table is the point of the page ───────────────────────
 * Two actions, and they are deliberately different decisions rather than one
 * "fix it" button: *Accept calendar* adopts the external change if the business
 * rules allow it, and *Push ours* makes Google agree with us. Neither is a
 * default, because which one is right depends on what actually happened — and
 * an application that guessed would be wrong about half the time in exactly the
 * cases that matter.
 */

const HEALTH_TONE = { healthy: "success", degraded: "warning", down: "danger", unknown: "neutral" } as const;

const SYNC_LABELS: Record<string, string> = {
  synced: "In step",
  pending: "Pending",
  sync_required: "Sync required",
  error: "Error",
  external_change_detected: "Changed in calendar",
};

const MODE_LABELS = {
  disabled: "Not configured",
  simulated: "Simulated (development)",
  live: "Live",
} as const;

const REASON_LABELS: Record<string, string> = {
  not_configured: "No calendar has been set up for this workspace.",
  no_calendar_selected: "Authorised, but no calendar has been chosen yet.",
  disconnected: "The calendar was disconnected.",
  mode_disabled: "Calendar integration is switched off for this deployment.",
};

export interface CalendarAdminProps {
  /** The integration record this page acts on. Resolved on the server. */
  recordId: string;
  mode: keyof typeof MODE_LABELS;
  connected: boolean;
  connectionReason: string | null;
  account: string | null;
  calendarLabel: string | null;
  calendarId: string | null;
  calendarTimeZone: string | null;
  authorized: boolean;
  health: "healthy" | "degraded" | "down" | "unknown";
  connection: string;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: NormalizedError | null;
  timezones: { mismatched: boolean; business: string; calendar: string };
  needingSync: {
    id: string;
    customerName: string;
    serviceName: string;
    date: string;
    time: string;
    status: string;
    syncState: string | null;
    syncDetail: string | null;
    eventId: string | null;
  }[];
}

export function CalendarAdminView(props: CalendarAdminProps) {
  const fmt = useBusinessFormat();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [calendars, setCalendars] = React.useState<
    { id: string; summary: string; timeZone: string; primary: boolean }[] | null
  >(null);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);

  async function run(key: string, work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(key);
    try {
      const result = await work();
      if (result.ok) toast.success(success);
      else toast("That didn't work", { description: result.error });
    } finally {
      setBusy(null);
    }
  }

  async function loadCalendars() {
    setBusy("list");
    try {
      const result = await listCalendarsAction();
      if (result.ok) setCalendars(result.calendars);
      else toast("Couldn't list calendars", { description: result.error });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Calendar</h1>
        <p className="text-sm text-text-secondary">
          The external calendar this workspace synchronises bookings with. Business users see this as
          &ldquo;Calendar&rdquo; and never as a vendor.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Connection</CardTitle>
            <CardDescription>
              {props.connected
                ? "Bookings made here are written to the selected calendar."
                : (REASON_LABELS[props.connectionReason ?? ""] ?? "Not connected.")}
            </CardDescription>
          </div>
          <Badge tone={HEALTH_TONE[props.health]} className="capitalize">
            {props.health}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mode" value={MODE_LABELS[props.mode]} />
            <Field label="Connected account" value={props.account ?? "—"} />
            <Field label="Selected calendar" value={props.calendarLabel ?? "None selected"} />
            <Field label="Authorisation" value={props.authorized ? "Configured" : "Not configured"} />
            <Field label="Business timezone" value={props.timezones.business} />
            <Field label="Calendar timezone" value={props.timezones.calendar} />
            <Field
              label="Last checked"
              value={props.lastCheckedAt ? fmt.relative(props.lastCheckedAt) : "Never"}
            />
            <Field
              label="Last successful sync"
              value={props.lastSuccessfulSyncAt ? fmt.relative(props.lastSuccessfulSyncAt) : "Never"}
            />
          </dl>

          {props.timezones.mismatched ? (
            <p className="rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-secondary">
              This calendar is configured in {props.timezones.calendar} while the business operates in{" "}
              {props.timezones.business}. That is allowed — bookings are always created at the business&apos;s
              intended local time — but it is worth knowing when a time looks unexpected.
            </p>
          ) : null}

          {props.calendarId ? (
            <p className="text-xs text-text-muted">
              Calendar identifier: <span className="font-mono">{props.calendarId}</span>
            </p>
          ) : null}

          {props.lastError ? (
            <p className="text-sm text-text-secondary">
              {props.lastError.message}
              {props.lastError.adminDetail ? (
                <span className="block text-xs text-text-muted">{props.lastError.adminDetail}</span>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/api/admin/calendar/authorize">{props.authorized ? "Reconnect" : "Connect calendar"}</a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                run(
                  "test",
                  async () => {
                    const result = await testIntegrationAction(props.recordId);
                    return result.ok ? { ok: true } : { ok: false, error: result.error };
                  },
                  "Calendar checked"
                )
              }
            >
              Test connection
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={loadCalendars}>
              Choose calendar
            </Button>
            {props.authorized ? (
              <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            ) : null}
          </div>

          {calendars ? (
            <ul className="space-y-2">
              {calendars.map((calendar) => (
                <li
                  key={calendar.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-text-primary">
                      {calendar.summary}
                      {calendar.primary ? <span className="ml-2 text-xs text-text-muted">primary</span> : null}
                    </p>
                    <p className="text-xs text-text-muted">{calendar.timeZone}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={calendar.id === props.calendarId ? "outline" : "primary"}
                    disabled={busy !== null || calendar.id === props.calendarId}
                    onClick={() => run(calendar.id, () => selectCalendarAction(calendar.id), "Calendar selected")}
                  >
                    {calendar.id === props.calendarId ? "Selected" : "Use this"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Needs reconciliation</CardTitle>
          <CardDescription>
            Bookings where this application and the calendar disagree. Nothing is resolved automatically — accepting a
            change and pushing ours are different decisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {props.needingSync.length === 0 ? (
            <div className="px-4">
              <EmptyState
                icon={CalendarClock}
                title="Everything is in step"
                description="No appointment currently disagrees with the calendar."
              />
            </div>
          ) : (
            <div>
              <Table minWidth="min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Our record</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.needingSync.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-text-primary">{row.customerName}</TableCell>
                      <TableCell className="text-text-secondary">{row.serviceName}</TableCell>
                      <TableCell className="text-text-secondary">
                        {row.date} · {row.time}
                      </TableCell>
                      <TableCell>
                        <Badge tone={row.syncState === "synced" ? "success" : "warning"}>
                          {SYNC_LABELS[row.syncState ?? ""] ?? "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs text-text-secondary">{row.syncDetail ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() =>
                              run(`accept-${row.id}`, () => reconcileAppointmentAction(row.id), "Calendar re-checked")
                            }
                          >
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Accept calendar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() =>
                              run(`push-${row.id}`, () => pushAppointmentToCalendarAction(row.id), "Pushed to calendar")
                            }
                          >
                            Push ours
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect calendar?</DialogTitle>
            <DialogDescription>
              New bookings and appointment synchronisation will stop until a calendar is reconnected. Existing
              appointments and their history are kept, and the link to each calendar entry stays recorded so the two can
              be reconciled later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setConfirmDisconnect(false)}>
              Keep it connected
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy !== null}
              onClick={() => {
                setConfirmDisconnect(false);
                void run(
                  "disconnect",
                  async () => {
                    const result = await disconnectIntegrationAction(props.recordId);
                    return result.ok ? { ok: true } : { ok: false, error: result.error };
                  },
                  "Calendar disconnected"
                );
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}
