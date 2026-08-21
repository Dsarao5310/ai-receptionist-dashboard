import type { AppConfiguration, BusinessService, KnowledgeEntry } from "@/types";
import { BUSINESS_NAME, SERVICES } from "./constants";

/**
 * Starting configuration for the demo workspace. The services mirror
 * `data/constants.ts` so the seeded appointment history references services that
 * actually exist in the profile, and the knowledge entries are deliberately
 * incomplete — the setup-completeness indicator should have something real to
 * report as missing rather than starting at a flattering 100%.
 */

// The catalogue is defined once in data/constants.ts — including the ids the
// seeded appointment history references. Nothing is re-derived here.
const services: BusinessService[] = SERVICES.map((s) => ({ ...s, active: true }));

const knowledge: KnowledgeEntry[] = [
  {
    id: "kn_seed_1",
    category: "faq",
    title: "Do you accept walk-ins?",
    content: "Yes, we take walk-ins whenever we have availability, though booking ahead is the safest way to get the time you want.",
    active: true,
  },
  {
    id: "kn_seed_2",
    category: "faq",
    title: "Do you sell gift cards?",
    content: "We do — gift cards are available in any amount and can be bought in person or over the phone.",
    active: true,
  },
  {
    id: "kn_seed_3",
    category: "payment",
    title: "Payment methods",
    content: "We accept all major credit and debit cards, cash, and contactless payments including Apple Pay and Google Pay.",
    active: true,
  },
  {
    id: "kn_seed_4",
    category: "booking",
    title: "Booking policy",
    content: "Appointments can be booked up to 60 days ahead. We hold your slot for 10 minutes past the start time.",
    active: true,
  },
];

export const DEFAULT_CONFIGURATION: AppConfiguration = {
  business: {
    name: BUSINESS_NAME,
    phone: "(604) 555-0142",
    email: "hello@coastalbloom.com",
    address: "1820 W 4th Avenue, Vancouver, BC V6J 1M3",
    website: "https://coastalbloom.com",
    timezone: "America/Vancouver",
    category: "Salon & Spa",
    description: "A neighbourhood salon and spa offering hair, nail and skin treatments seven days a week.",
  },

  hours: [
    { day: "Mon", isOpen: true, intervals: [{ open: "09:00", close: "18:00" }] },
    { day: "Tue", isOpen: true, intervals: [{ open: "09:00", close: "18:00" }] },
    { day: "Wed", isOpen: true, intervals: [{ open: "09:00", close: "18:00" }] },
    { day: "Thu", isOpen: true, intervals: [{ open: "09:00", close: "19:00" }] },
    { day: "Fri", isOpen: true, intervals: [{ open: "09:00", close: "18:00" }] },
    { day: "Sat", isOpen: true, intervals: [{ open: "10:00", close: "16:00" }] },
    { day: "Sun", isOpen: false, intervals: [] },
  ],

  specialHours: [
    { id: "sh_seed_1", date: "2026-12-24", label: "Christmas Eve", isClosed: false, intervals: [{ open: "09:00", close: "14:00" }] },
    { id: "sh_seed_2", date: "2026-12-25", label: "Christmas Day", isClosed: true, intervals: [] },
  ],

  services,
  knowledge,

  ai: {
    enabled: true,
    channels: { voice: true, sms: true, email: true },
    greeting: `Thanks for calling ${BUSINESS_NAME}. How can I help you today?`,
    personality: "friendly",
    voice: { name: "Aria", speedPct: 100, tone: "Warm" },
    booking: {
      defaultDurationMin: 45,
      minNoticeMin: 60,
      maxAdvanceDays: 60,
      maxConcurrent: 3,
      sendConfirmation: true,
      allowReschedule: true,
      allowCancellation: true,
    },
    escalation: {
      whenUnsure: "take_message",
      urgentRequests: "escalate",
      unsupportedRequests: "ask_to_call",
    },
    afterHours: "answer_no_booking",
  },
};
