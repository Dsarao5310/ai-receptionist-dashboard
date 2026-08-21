/**
 * Normalized business + AI configuration.
 *
 * One owner per concept: Business Profile owns identity, hours, services and
 * knowledge; AI Configuration owns only how the receptionist behaves. The AI
 * side never copies hours or services — it reads them, so a change in Business
 * Profile is immediately visible everywhere the receptionist is described.
 *
 * Deliberately free of provider concepts (Vapi/Twilio/n8n/vector stores). Those
 * belong to a separate admin-only technical layer added in a later phase; the
 * business-facing model here talks about Voice/SMS/Email/Calendar instead so the
 * underlying provider can change without redesigning this experience.
 */

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const WEEKDAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

/** A single open period. Stored as a list per day so split hours (9–12, 1–6) remain possible without a migration. */
export interface TimeInterval {
  open: string; // HH:mm
  close: string; // HH:mm
}

export interface DayHours {
  day: Weekday;
  isOpen: boolean;
  intervals: TimeInterval[];
}

/** Holiday, temporary closure, or one-off hours that override the weekly schedule for a given date. */
export interface SpecialHours {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  isClosed: boolean;
  intervals: TimeInterval[];
}

/**
 * Not every business prices the same way — a clinic quotes on consultation, a
 * law office says "from", a salon has fixed prices. Forcing a single numeric
 * model would make the product wrong for most of them.
 */
export type PriceModel = "fixed" | "from" | "free" | "contact" | "hidden";

export const PRICE_MODEL_LABELS: Record<PriceModel, string> = {
  fixed: "Fixed price",
  from: "Starting from",
  free: "Free",
  contact: "Contact for pricing",
  hidden: "Don't show a price",
};

export interface BusinessService {
  id: string;
  name: string;
  description: string;
  priceModel: PriceModel;
  /** Only meaningful for "fixed" and "from". */
  price: number;
  durationMin: number;
  active: boolean;
}

export type KnowledgeCategory =
  | "faq"
  | "parking"
  | "payment"
  | "cancellation"
  | "late_arrival"
  | "booking"
  | "accessibility"
  | "general";

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  faq: "Frequently asked question",
  parking: "Parking",
  payment: "Payment methods",
  cancellation: "Cancellation policy",
  late_arrival: "Late arrivals",
  booking: "Booking policy",
  accessibility: "Accessibility",
  general: "General instructions",
};

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  active: boolean;
}

export interface BusinessIdentity {
  name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  timezone: string;
  category: string;
  description: string;
}

// ── AI configuration ────────────────────────────────────────────────────────

export type Personality = "friendly" | "professional" | "energetic" | "concise";

export const PERSONALITY_OPTIONS: { value: Personality; label: string; description: string }[] = [
  { value: "friendly", label: "Friendly", description: "Warm and conversational." },
  { value: "professional", label: "Professional", description: "Polished and businesslike." },
  { value: "energetic", label: "Energetic", description: "Upbeat and enthusiastic." },
  { value: "concise", label: "Concise", description: "Shorter, more direct responses." },
];

export type UnsureBehavior = "take_message" | "ask_to_call" | "escalate" | "mark_for_review";

export const UNSURE_OPTIONS: { value: UnsureBehavior; label: string; description: string }[] = [
  { value: "take_message", label: "Take a message", description: "Collect details and pass them to your team." },
  { value: "ask_to_call", label: "Ask the customer to call", description: "Give out your business number." },
  { value: "escalate", label: "Escalate to staff", description: "Flag it for someone to pick up right away." },
  { value: "mark_for_review", label: "Mark for review", description: "Log it quietly for you to review later." },
];

export type AfterHoursBehavior =
  | "answer_normally"
  | "answer_no_booking"
  | "take_message"
  | "share_hours"
  | "offer_next_slot";

export const AFTER_HOURS_OPTIONS: { value: AfterHoursBehavior; label: string; description: string }[] = [
  { value: "answer_normally", label: "Answer normally", description: "Handle everything exactly as during opening hours." },
  { value: "answer_no_booking", label: "Answer, but no bookings", description: "Answer questions; hold bookings for opening hours." },
  { value: "take_message", label: "Take a message", description: "Collect details and reply the next working day." },
  { value: "share_hours", label: "Share opening hours", description: "Let the customer know when you're next open." },
  { value: "offer_next_slot", label: "Offer next available", description: "Suggest the next bookable appointment." },
];

export interface BookingRules {
  defaultDurationMin: number;
  /** Minutes of notice required before an appointment. 0 = no minimum. */
  minNoticeMin: number;
  maxAdvanceDays: number;
  maxConcurrent: number;
  sendConfirmation: boolean;
  allowReschedule: boolean;
  allowCancellation: boolean;
}

export interface EscalationRules {
  whenUnsure: UnsureBehavior;
  urgentRequests: UnsureBehavior;
  unsupportedRequests: UnsureBehavior;
}

export interface VoiceSettings {
  name: string;
  /** Speaking rate as a percentage of normal. */
  speedPct: number;
  tone: string;
}

export interface AIConfiguration {
  enabled: boolean;
  channels: { voice: boolean; sms: boolean; email: boolean };
  greeting: string;
  personality: Personality;
  voice: VoiceSettings;
  booking: BookingRules;
  escalation: EscalationRules;
  afterHours: AfterHoursBehavior;
}

/** The whole configuration document. Business Profile and AI Receptionist are two views onto this. */
export interface AppConfiguration {
  business: BusinessIdentity;
  hours: DayHours[];
  specialHours: SpecialHours[];
  services: BusinessService[];
  knowledge: KnowledgeEntry[];
  ai: AIConfiguration;
}

export const VOICE_OPTIONS = ["Aria", "Cameron", "Sloane", "Rowan", "Juniper"];
export const VOICE_TONES = ["Neutral", "Warm", "Bright", "Calm"];
