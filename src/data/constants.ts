import type { BusinessService, Channel, ConversationOutcome, Intent } from "@/types";

export const FIRST_NAMES = [
  "Jordan", "Maya", "Priya", "Ethan", "Sofia", "Liam", "Ava", "Noah", "Mia",
  "Lucas", "Grace", "Owen", "Zoe", "Elena", "Marcus", "Nina", "Kai", "Ruby",
  "Diego", "Hana", "Theo", "Amara", "Felix", "Ines", "Rohan", "Wren", "Leo",
  "Talia", "Miles", "Jade", "Oscar", "Piper", "Adrian", "Sage", "Ezra",
] as const;

export const LAST_NAMES = [
  "Lee", "Chen", "Nair", "Brooks", "Alvarez", "Kim", "Patel", "Reyes",
  "Bennett", "Morales", "Foster", "Nakamura", "Silva", "Okafor", "Larsen",
  "Marsh", "Diaz", "Whitfield", "Novak", "Hassan", "Iverson", "Castillo",
  "Bergstrom", "Osei", "Delgado",
] as const;

/**
 * The starting service catalogue, defined once and in full.
 *
 * The ids are the single source of service identity: the default configuration
 * and the generated appointment history both reference these, so a seeded
 * appointment resolves to a real catalogue entry rather than being matched back
 * by name. Every displayable field lives here too, so nothing downstream has to
 * re-derive a price model or special-case a service by its name.
 */
export const SERVICES: Omit<BusinessService, "active">[] = [
  { id: "svc_haircut", name: "Haircut", description: "Our standard haircut appointment.", priceModel: "fixed", price: 65, durationMin: 45 },
  { id: "svc_color", name: "Color & Highlights", description: "Our standard color & highlights appointment.", priceModel: "fixed", price: 145, durationMin: 120 },
  { id: "svc_consultation", name: "Consultation", description: "A short no-obligation chat to work out what you need.", priceModel: "contact", price: 0, durationMin: 20 },
  { id: "svc_manicure", name: "Manicure", description: "Our standard manicure appointment.", priceModel: "fixed", price: 40, durationMin: 40 },
  { id: "svc_massage", name: "Deep Tissue Massage", description: "Our standard deep tissue massage appointment.", priceModel: "fixed", price: 110, durationMin: 60 },
  { id: "svc_facial", name: "Facial Treatment", description: "Our standard facial treatment appointment.", priceModel: "fixed", price: 90, durationMin: 50 },
  { id: "svc_blowout", name: "Blowout & Style", description: "Our standard blowout & style appointment.", priceModel: "fixed", price: 55, durationMin: 35 },
];

export const CHANNEL_WEIGHTS: Record<Channel, number> = {
  voice: 0.48,
  sms: 0.34,
  email: 0.18,
};

export const INTENT_WEIGHTS: Record<Intent, number> = {
  booking: 0.4,
  reschedule: 0.12,
  cancel: 0.08,
  hours: 0.12,
  pricing: 0.1,
  services: 0.1,
  other: 0.08,
};

export const INTENT_LABELS: Record<Intent, string> = {
  booking: "Booking",
  reschedule: "Reschedule",
  cancel: "Cancel",
  hours: "Hours",
  pricing: "Pricing",
  services: "Services",
  other: "Other",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  voice: "Voice",
  sms: "SMS",
  email: "Email",
};

export const OUTCOME_LABELS: Record<ConversationOutcome, string> = {
  booked: "Booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  answered: "Answered",
  escalated: "Escalated",
  missed: "Missed",
  no_action: "No action needed",
};

export const QUESTION_TOPICS = [
  "your opening hours",
  "whether you take walk-ins",
  "parking availability",
  "pricing for a color treatment",
  "if gift cards are available",
  "your cancellation policy",
  "whether kids are welcome",
  "if you carry a specific product line",
];

export const BUSINESS_NAME = "Coastal Bloom Salon";
