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

export type AppointmentSource = "voice" | "sms" | "email" | "manual";

export type IntegrationStatus = "connected" | "needs_attention" | "not_connected";

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
  bookingAction?: string;
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

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  service: string;
  date: string; // ISO date (day)
  time: string; // HH:mm
  durationMin: number;
  source: AppointmentSource;
  status: AppointmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  description: string;
  active: boolean;
}

export interface BusinessHours {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  isOpen: boolean;
  open: string; // HH:mm
  close: string; // HH:mm
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export interface BusinessProfile {
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  hours: BusinessHours[];
  services: Service[];
  faqs: FAQ[];
  policies: string;
  parkingInfo: string;
  specialInstructions: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  lastSync: string | null;
  icon: string;
}

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
  trend: { date: string; conversations: number; appointments: number }[];
}

export type DateRangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export interface DateRange {
  key: DateRangeKey;
  start: Date;
  end: Date;
}

export interface AIReceptionistSettings {
  status: {
    overall: "online" | "offline" | "degraded";
    voice: "connected" | "disconnected";
    sms: "connected" | "disconnected";
    email: "connected" | "disconnected";
  };
  greeting: string;
  voice: {
    name: string;
    speed: number;
    tone: string;
  };
  personality: "friendly" | "professional" | "concise" | "energetic";
  rules: {
    defaultAppointmentDurationMin: number;
    maxConcurrentAppointments: number;
    minBookingNoticeHours: number;
    advanceBookingWindowDays: number;
  };
}
