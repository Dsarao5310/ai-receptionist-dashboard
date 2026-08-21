"use client";

/**
 * Account details, alert preferences and dashboard defaults.
 *
 * Persisted per user per workspace, so they follow the person to another
 * browser instead of being a fact about one laptop. Appearance is deliberately
 * elsewhere: theme, accent, density and sidebar state are device preferences and
 * stay in `preferences.ts`, the one store that still writes to local storage.
 */
export {
  useSettings,
  type NotificationChannels,
  type NotificationEventKey,
  type SettingsState,
  type TimestampStyle,
} from "./workspace-stores";

export const NOTIFICATION_EVENTS: { key: import("./workspace-stores").NotificationEventKey; label: string; description: string }[] = [
  { key: "appointment_booked", label: "New appointment", description: "Someone books a new appointment." },
  { key: "appointment_cancelled", label: "Cancellation", description: "A customer cancels." },
  { key: "appointment_rescheduled", label: "Reschedule", description: "An appointment moves to a new time." },
  { key: "integration_problem", label: "Connection problem", description: "Something the receptionist relies on stops working." },
  { key: "ai_could_not_answer", label: "Unanswered question", description: "The receptionist could not answer confidently." },
  { key: "high_missed_calls", label: "Missed calls spike", description: "Unusually many calls go unanswered." },
];
