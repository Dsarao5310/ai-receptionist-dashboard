"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Appointment, Dataset } from "@/types";
import { toast } from "@/lib/store/toast";
import {
  cancelAppointmentAction,
  rescheduleAppointmentAction,
  restoreAppointmentAction,
  updateAppointmentNotesAction,
} from "@/server/actions/appointments";

/**
 * The workspace's data, loaded on the server and handed down.
 *
 * ── What changed, and what did not ──────────────────────────────────────────
 * This replaces the provider that generated a dataset in the browser on every
 * page load. The context's shape is deliberately the same, so the pages,
 * selectors and drawers above it are untouched: what changed is where the data
 * comes from, not what it looks like.
 *
 * ── Mutations are requests, not edits ───────────────────────────────────────
 * The old provider *was* the database — `setAppointments` was the write. Now
 * every mutation is a server action that authenticates, authorizes, validates
 * against server time and the authorized workspace's hours, and only then
 * writes. This component applies the change locally first so the interface
 * responds immediately, then reconciles:
 *
 *   • the action succeeds  → `router.refresh()` re-reads from the server, and
 *     the optimistic value is replaced by the authoritative one.
 *   • the action fails     → the optimistic value is rolled back and the
 *     server's reason is shown. The browser does not get to keep a change the
 *     server refused.
 *
 * That is the important property: the optimistic copy is never the truth, and
 * it never survives a refusal.
 */
interface WorkspaceDataContextValue {
  /** As loaded from the server, before any in-flight optimistic change. */
  dataset: Dataset | null;
  /** What the UI should read: server data with pending local changes applied. */
  liveDataset: Dataset | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
  rescheduleAppointment: (id: string, date: string, time: string) => Promise<Appointment | null>;
  cancelAppointment: (id: string) => Promise<Appointment | null>;
  updateAppointmentNotes: (id: string, notes: string) => Promise<Appointment | null>;
  restoreAppointment: (snapshot: Appointment) => Promise<void>;
}

const WorkspaceDataContext = React.createContext<WorkspaceDataContextValue | null>(null);

export function WorkspaceDataProvider({
  dataset,
  children,
}: {
  dataset: Dataset | null;
  children: React.ReactNode;
}) {
  const router = useRouter();

  /**
   * Appointments changed locally but not yet confirmed by a refresh.
   *
   * Keyed by id and cleared whenever new server data arrives, so a stale
   * optimistic value cannot outlive the round trip that replaced it.
   */
  const [pending, setPending] = React.useState<Record<string, Appointment>>({});

  // Cleared during render rather than in an effect: an effect runs after the
  // paint, so for one frame the screen would show freshly-loaded server data
  // with a stale optimistic value still layered on top of it.
  const [seenDataset, setSeenDataset] = React.useState(dataset);
  if (dataset !== seenDataset) {
    setSeenDataset(dataset);
    setPending({});
  }

  const liveDataset = React.useMemo<Dataset | null>(() => {
    if (!dataset) return null;
    if (Object.keys(pending).length === 0) return dataset;
    return { ...dataset, appointments: dataset.appointments.map((a) => pending[a.id] ?? a) };
  }, [dataset, pending]);

  const current = React.useCallback(
    (id: string): Appointment | null =>
      pending[id] ?? dataset?.appointments.find((a) => a.id === id) ?? null,
    [dataset, pending]
  );

  /**
   * Apply optimistically, ask the server, reconcile.
   *
   * Returns the appointment as it was *before* the change, which is what the
   * undo affordances need — and returns null when the server refused, so a
   * caller never offers to undo something that did not happen.
   */
  const mutate = React.useCallback(
    async (
      id: string,
      optimistic: (previous: Appointment) => Appointment,
      call: () => Promise<{ ok: boolean; error?: string }>
    ): Promise<Appointment | null> => {
      const previous = current(id);
      if (!previous) return null;

      setPending((map) => ({ ...map, [id]: optimistic(previous) }));

      const result = await call();
      if (!result.ok) {
        setPending((map) => {
          const next = { ...map };
          delete next[id];
          return next;
        });
        toast("Couldn't save that change", { description: result.error });
        return null;
      }

      router.refresh();
      return previous;
    },
    [current, router]
  );

  const value = React.useMemo<WorkspaceDataContextValue>(
    () => ({
      dataset,
      liveDataset,
      // The server resolved this before the page rendered; there is no client
      // fetch to wait for. A failed load never reaches here — the layout renders
      // an outage page instead of a dashboard with nothing in it — so these stay
      // in the shape consumers expect and are simply always settled.
      loading: false,
      error: false,
      retry: () => router.refresh(),

      rescheduleAppointment: (id, date, time) =>
        mutate(
          id,
          (previous) => ({ ...previous, date, time, status: "rescheduled" }),
          () => rescheduleAppointmentAction({ appointmentId: id, date, time })
        ),

      cancelAppointment: (id) =>
        mutate(
          id,
          (previous) => ({ ...previous, status: "cancelled" }),
          () => cancelAppointmentAction(id)
        ),

      updateAppointmentNotes: (id, notes) =>
        mutate(
          id,
          (previous) => ({ ...previous, notes }),
          () => updateAppointmentNotesAction({ appointmentId: id, notes })
        ),

      restoreAppointment: async (snapshot) => {
        setPending((map) => ({ ...map, [snapshot.id]: snapshot }));
        const result = await restoreAppointmentAction({
          appointmentId: snapshot.id,
          date: snapshot.date,
          time: snapshot.time,
          status: snapshot.status,
          notes: snapshot.notes,
        });
        if (!result.ok) {
          setPending((map) => {
            const next = { ...map };
            delete next[snapshot.id];
            return next;
          });
          toast("Couldn't undo that", { description: result.error });
          return;
        }
        router.refresh();
      },
    }),
    [dataset, liveDataset, mutate, router]
  );

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}

export function useWorkspaceData() {
  const ctx = React.useContext(WorkspaceDataContext);
  if (!ctx) throw new Error("useWorkspaceData must be used within a WorkspaceDataProvider");
  return ctx;
}
