"use client";

import { create } from "zustand";
import type { AppNotification } from "@/types";

const SEED: AppNotification[] = [
  {
    id: "n1",
    title: "New booking",
    description: "Jordan Lee booked a Haircut for tomorrow 2:30 PM via Voice.",
    severity: "success",
    timestamp: "2 min ago",
    read: false,
    critical: false,
    relatedType: "appointment",
    relatedId: "apt_1",
  },
  {
    id: "n2",
    title: "Appointment cancelled",
    description: "Priya Nair cancelled her Consultation for Friday 10:00 AM.",
    severity: "warning",
    timestamp: "26 min ago",
    read: false,
    critical: false,
    relatedType: "appointment",
    relatedId: "apt_2",
  },
  {
    id: "n3",
    title: "AI could not answer a question",
    description: "A caller asked about a custom quote the assistant couldn't resolve. Review the call.",
    severity: "critical",
    timestamp: "1 hr ago",
    read: false,
    critical: true,
    relatedType: "call",
    relatedId: "call_1",
  },
  {
    id: "n4",
    title: "Google Calendar disconnected",
    description: "Calendar sync stopped working. Reconnect to keep bookings in sync.",
    severity: "critical",
    timestamp: "3 hr ago",
    read: false,
    critical: true,
    relatedType: "integration",
    relatedId: "google_calendar",
  },
  {
    id: "n5",
    title: "High missed-call volume",
    description: "6 missed calls in the last hour — above your usual average.",
    severity: "warning",
    timestamp: "5 hr ago",
    read: true,
    critical: false,
  },
  {
    id: "n6",
    title: "Integration needs attention",
    description: "Twilio number verification is pending. Complete setup to enable SMS.",
    severity: "info",
    timestamp: "Yesterday",
    read: true,
    critical: false,
    relatedType: "integration",
    relatedId: "twilio",
  },
];

interface NotificationsState {
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotifications = create<NotificationsState>()((set) => ({
  notifications: SEED,
  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  markAllRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
}));
