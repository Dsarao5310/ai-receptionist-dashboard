import type { PriceModel } from "./config";

export type Channel = "voice" | "sms" | "email";

export type Intent =
  | "booking"
  | "reschedule"
  | "cancel"
  | "hours"
  | "pricing"
  | "services"
  | "other";

export type ConversationOutcome =
  | "booked"
  | "rescheduled"
  | "cancelled"
  | "answered"
  | "escalated"
  | "missed"
  | "no_action";

export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "rescheduled"
  | "cancelled"
  | "completed";

export type AppointmentSyncState =
  | "synced"
  | "pending"
  | "sync_required"
  | "error"
  | "external_change_detected";

export type AppointmentSource = "voice" | "sms" | "email" | "manual";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  lastInteraction: string; // ISO date
  lastChannel: Channel;
  totalAppointments: number;
  upcomingAppointmentId?: string;
  createdAt: string;
}

export interface ActionStep {
  label: string;
  done: boolean;
}

export interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  channel: Channel;
  timestamp: string; // ISO date
  intent: Intent;
  outcome: ConversationOutcome;
  summary: string;
  transcriptPreview: string;
  transcript: { speaker: "ai" | "customer"; text: string; time: string }[];
  appointmentId?: string;
  actions: ActionStep[];
  durationSec?: number; // voice only
}

export interface Call {
  id: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  timestamp: string;
  durationSec: number;
  intent: Intent;
  outcome: ConversationOutcome;
  appointmentId?: string;
  summary: string;
  transcript: { speaker: "ai" | "customer"; text: string; time: string }[];
  actions: ActionStep[];
}

/**
 * What was actually agreed with the customer when the appointment was booked.
 *
 * Held on the appointment itself and never rewritten when the service catalogue
 * changes later: repricing a haircut must not silently restate what past
 * customers were quoted, and deleting a service must not erase the history of
 * appointments that used it. The live catalogue entry is reached through
 * `serviceId` when current details are wanted.
 */
export interface ServiceSnapshot {
  name: string;
  priceModel: PriceModel;
  price: number;
  durationMin: number;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** Stable reference into the service catalogue; null once that service is deleted. */
  serviceId: string | null;
  /** Historical record of the booking — see ServiceSnapshot. */
  service: ServiceSnapshot;
  /** Wall-clock day in the business timezone (YYYY-MM-DD). */
  date: string;
  /** Wall-clock time in the business timezone (HH:mm). */
  time: string;
  source: AppointmentSource;
  status: AppointmentStatus;
  /**
   * Whether the external calendar agrees with this record.
   *
   * Null when no calendar is connected, which is the ordinary case for a
   * business that has not set one up. Deliberately carries no calendar id and
   * no event id - those are provider mappings for admin surfaces, and this
   * object is serialised into every business user's page payload.
   */
  syncState?: AppointmentSyncState | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Business + AI configuration lives in ./config — one normalized model shared by
 * the Business Profile and AI Receptionist pages. Re-exported here so `@/types`
 * stays the single import point.
 */
export * from "./config";

/**
 * Provider integrations, workspaces and the normalized error/event model live
 * in ./integrations — the provider-level truth that every client-facing
 * capability status is derived from.
 */
export * from "./integrations";

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  severity: NotificationSeverity;
  timestamp: string;
  read: boolean;
  critical: boolean;
  relatedType?: "appointment" | "call" | "conversation" | "integration";
  relatedId?: string;
}

export interface KPI {
  key: string;
  label: string;
  value: number;
  previousValue: number;
  format: "number" | "percent" | "currency";
  sparkline: number[];
}

export interface DashboardStats {
  kpis: KPI[];
  trend: TrendPoint[];
}

export type DateRangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export interface DateRange {
  key: DateRangeKey;
  start: Date;
  end: Date;
}

export type ActivityEventType =
  | "appointment_booked"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "call_completed"
  | "question_answered"
  | "conversation_escalated"
  | "conversation_missed";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string; // ISO date, real (client-generated) anchor
  customerId: string;
  customerName: string;
  channel: Channel;
  summary: string;
  detail: string;
  conversationId?: string;
  callId?: string;
  appointmentId?: string;
}

export interface Dataset {
  generatedAt: string;
  customers: Customer[];
  conversations: Conversation[];
  calls: Call[];
  appointments: Appointment[];
  activityEvents: ActivityEvent[];
}

export interface ChannelBreakdownEntry {
  channel: Channel;
  count: number;
  percent: number;
}

export interface IntentBreakdownEntry {
  intent: Intent;
  count: number;
  percent: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  conversations: number;
  appointments: number;
}

export type ConnectionState = "connected" | "needs_attention" | "disconnected";

export interface ReceptionistStatus {
  overall: "online" | "offline" | "degraded";
  voice: ConnectionState;
  sms: ConnectionState;
  email: ConnectionState;
  calendar: ConnectionState;
}

