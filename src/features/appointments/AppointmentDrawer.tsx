"use client";

import { useState } from "react";
import { toast } from "@/lib/store/toast";
import { Calendar, CalendarClock, Clock, Mail, Phone, Tag, Pencil, X, Check, XCircle } from "lucide-react";
import type { Appointment, Dataset } from "@/types";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { zonedDayKey } from "@/lib/timezone";
import { businessZone, formatDurationMinutes, formatTimeOfDay } from "@/services/business";
import { checkRescheduleSlot, getNearbyStartTimes, isOpenOnDay } from "@/services/scheduling";
import { ServiceDriftNotice } from "./ServiceDriftNotice";

import { useBusinessFormat } from "@/lib/business-format";

const STATUS_TONE: Record<Appointment["status"], "success" | "warning" | "info" | "neutral" | "danger"> = {
  confirmed: "success",
  pending: "warning",
  rescheduled: "info",
  cancelled: "neutral",
  completed: "neutral",
};

const SOURCE_LABELS: Record<Appointment["source"], string> = {
  voice: "Voice",
  sms: "SMS",
  email: "Email",
  manual: "Manual entry",
};

export function AppointmentDrawer({
  appointmentId,
  dataset,
  open,
  onOpenChange,
}: {
  appointmentId: string | null;
  dataset: Dataset | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's — and
  // reschedule validity is judged against the business's hours in that zone.
  const fmt = useBusinessFormat();
  const config = useConfiguration();
  const { rescheduleAppointment, cancelAppointment, updateAppointmentNotes, restoreAppointment } = useWorkspaceData();

  const [reschedOpen, setReschedOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const appointment = appointmentId ? dataset?.appointments.find((a) => a.id === appointmentId) ?? null : null;

  /**
   * The single point where this component reads the clock. Everything
   * time-dependent below takes it as an argument, so the rules stay testable and
   * the same functions can later run against a trusted server clock.
   */
  const now = new Date();
  const zone = businessZone(config);

  /**
   * Whether the proposed slot can be booked: still in the future *and* inside
   * opening hours, allowing for split shifts, special closures, and whether the
   * booking's own duration fits before closing. The duration comes from the
   * booking snapshot, so a catalogue change never silently lengthens or shortens
   * an appointment someone already agreed to.
   *
   * This is not an availability check: nothing here knows about other bookings
   * or capacity. That arrives with the backend.
   */
  const slotCheck =
    appointment && draftDate && draftTime ? checkRescheduleSlot(config, appointment, draftDate, draftTime, now) : null;
  const nearbyTimes =
    appointment && draftDate && slotCheck && !slotCheck.valid
      ? getNearbyStartTimes(config, draftDate, draftTime || appointment.time, appointment.service.durationMin, { now })
      : [];

  if (!appointment) return null;

  const locked = appointment.status === "cancelled" || appointment.status === "completed";

  function startReschedule() {
    if (!appointment) return;
    setDraftDate(appointment.date);
    setDraftTime(appointment.time);
    setReschedOpen(true);
  }

  async function confirmReschedule() {
    if (!appointment || !draftDate || !draftTime) return;
    // The disabled button is a convenience; this is the check that decides.
    // Re-read the clock rather than reusing the render-time one, so a drawer
    // left open cannot save a slot that lapsed while it sat there.
    const check = checkRescheduleSlot(config, appointment, draftDate, draftTime, new Date());
    if (!check.valid) return;

    // The server decides. It re-runs these same rules on trusted time and the
    // authorized workspace's hours, so a stale drawer cannot save a slot that
    // has since lapsed — the toast only appears once the write is confirmed.
    const prev = await rescheduleAppointment(appointment.id, draftDate, draftTime);
    setReschedOpen(false);
    if (prev) {
      toast.success("Appointment rescheduled", {
        description: `${appointment.customerName} moved to ${fmt.day(draftDate, { month: "short", day: "numeric" })} at ${draftTime}.`,
        action: { label: "Undo", onClick: () => void restoreAppointment(prev) },
      });
    }
  }

  function startEditNotes() {
    if (!appointment) return;
    setDraftNotes(appointment.notes);
    setEditingNotes(true);
  }

  function saveNotes() {
    if (!appointment) return;
    void updateAppointmentNotes(appointment.id, draftNotes);
    setEditingNotes(false);
    toast.success("Notes updated");
  }

  async function doCancel() {
    if (!appointment) return;
    const prev = await cancelAppointment(appointment.id);
    setConfirmCancelOpen(false);
    if (prev) {
      toast("Appointment cancelled", {
        description: `${appointment.customerName}'s ${appointment.service.name} was cancelled.`,
        action: { label: "Undo", onClick: () => restoreAppointment(prev) },
      });
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={appointment.customerName} />
              <div className="min-w-0">
                <DrawerTitle className="truncate">{appointment.customerName}</DrawerTitle>
                <DrawerDescription>{appointment.service.name}</DrawerDescription>
              </div>
            </div>
            <DrawerClose />
          </DrawerHeader>
          <DrawerBody className="space-y-5">
            <Badge tone={STATUS_TONE[appointment.status]} className="capitalize">
              {appointment.status}
            </Badge>

            {/* Everything below shows the booked snapshot; this says so when the catalogue has since changed. */}
            <ServiceDriftNotice appointment={appointment} />

            {/* Stacks below sm: the drawer is full-width on a 375px viewport,
                and "Last modified" renders a full date+time string that wraps
                badly in a ~155px column at that width. */}
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-text-muted mt-0.5" />
                <div>
                  <p className="text-text-primary">{fmt.day(appointment.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                  <p className="text-xs text-text-muted">Date</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-text-muted mt-0.5" />
                <div>
                  <p className="text-text-primary">
                    {appointment.time} · {formatDurationMinutes(appointment.service.durationMin)}
                  </p>
                  <p className="text-xs text-text-muted">Time</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-text-muted mt-0.5" />
                <div>
                  <p className="text-text-primary">{SOURCE_LABELS[appointment.source]}</p>
                  <p className="text-xs text-text-muted">Source</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CalendarClock className="h-4 w-4 text-text-muted mt-0.5" />
                <div>
                  <p className="text-text-primary">{fmt.dateTime(appointment.updatedAt)}</p>
                  <p className="text-xs text-text-muted">Last modified</p>
                </div>
              </div>
            </div>

            {reschedOpen && (
              <div className="rounded-lg border border-accent/40 bg-accent-subtle/40 p-3.5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">New date &amp; time</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    aria-label="New date"
                    /* Days already gone are not offerable — the picker greys them out. */
                    min={zonedDayKey(now, zone)}
                    aria-invalid={slotCheck ? !slotCheck.valid : undefined}
                    aria-describedby={slotCheck && !slotCheck.valid ? "reschedule-error" : undefined}
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    aria-label="New time"
                    aria-invalid={slotCheck ? !slotCheck.valid : undefined}
                    aria-describedby={slotCheck && !slotCheck.valid ? "reschedule-error" : undefined}
                    value={draftTime}
                    onChange={(e) => setDraftTime(e.target.value)}
                  />
                </div>

                {/* Guidance, not gatekeeping — confirmReschedule re-checks before writing. */}
                <div aria-live="polite">
                  {slotCheck && !slotCheck.valid && (
                    <p id="reschedule-error" className="text-xs text-danger">
                      {slotCheck.message}
                    </p>
                  )}
                  {slotCheck && !slotCheck.valid && nearbyTimes.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-text-secondary">
                        Valid business times on {fmt.day(draftDate, { weekday: "short", month: "short", day: "numeric" })}:
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {nearbyTimes.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDraftTime(t)}
                            className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary transition-colors hover:border-accent hover:text-accent-text"
                          >
                            {formatTimeOfDay(t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {slotCheck && !slotCheck.valid && nearbyTimes.length === 0 && isOpenOnDay(config, draftDate) && (
                    <p className="mt-2 text-xs text-text-secondary">No valid times remain on this date.</p>
                  )}
                  {slotCheck?.valid && (
                    <p className="text-xs text-text-secondary">
                      Within business hours. Availability is confirmed when your calendar is connected.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={confirmReschedule} disabled={!slotCheck?.valid}>
                    <Check className="h-3.5 w-3.5" /> Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReschedOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Contact</p>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-text-primary">
                  <Phone className="h-3.5 w-3.5 text-text-muted" />
                  {appointment.customerPhone}
                </span>
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${appointment.customerPhone.replace(/[^\d+]/g, "")}`}>Call</a>
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-text-primary truncate">
                  <Mail className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span className="truncate">{appointment.customerEmail}</span>
                </span>
                <Button asChild variant="outline" size="sm">
                  <a href={`mailto:${appointment.customerEmail}`}>Email</a>
                </Button>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Notes</p>
                {!editingNotes && (
                  <button onClick={startEditNotes} className="text-text-muted hover:text-text-primary transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea rows={3} value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Add a note..." />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={saveNotes}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">{appointment.notes || "No notes yet."}</p>
              )}
            </div>

            <p className="text-xs text-text-muted">Created {fmt.dateTime(appointment.createdAt)}</p>
          </DrawerBody>

          {!locked && (
            <DrawerFooter>
              <Button variant="outline" size="sm" onClick={startReschedule} disabled={reschedOpen}>
                Reschedule
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmCancelOpen(true)}>
                <XCircle className="h-3.5 w-3.5" /> Cancel appointment
              </Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
            <DialogDescription>
              {appointment.customerName}&apos;s {appointment.service.name} on{" "}
              {fmt.day(appointment.date, { month: "short", day: "numeric" })} at {appointment.time} will be cancelled. This can be
              undone right after from the confirmation toast.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmCancelOpen(false)}>
              <X className="h-3.5 w-3.5" /> Keep appointment
            </Button>
            <Button variant="danger" size="sm" onClick={doCancel}>
              Cancel appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
