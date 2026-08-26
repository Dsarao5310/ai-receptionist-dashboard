import type { AppConfiguration, Personality, Weekday } from "@/types";
import { WEEKDAY_LABELS, UNSURE_OPTIONS } from "@/types";
import { addZonedDays, zonedDayKey, zonedMinutesOfDay, zonedWeekday } from "@/lib/timezone";
import {
  businessZone,
  findKnowledge,
  findServiceByName,
  formatIntervals,
  formatServiceDuration,
  formatServicePrice,
  formatTimeOfDay,
  getBookableServices,
  getEffectiveHours,
  getNextOpenDay,
  isOutsideBusinessHours,
  toMinutes,
} from "./business";

/**
 * A deterministic, rule-based stand-in for the real assistant.
 *
 * It exists so the owner can check their *configuration* — every answer is
 * derived from the live business profile and AI settings, so editing Wednesday's
 * closing time or a service price immediately changes what this says. It is not
 * a general chatbot and is labelled as a simulation in the UI; when a real AI
 * backend is connected this module is the single thing that gets replaced.
 */

export type SimulatorIntent =
  | "greeting"
  | "hours"
  | "pricing"
  | "services"
  | "booking"
  | "cancel"
  | "location"
  | "contact"
  | "knowledge"
  | "unknown";

export interface SimulatedReply {
  text: string;
  intent: SimulatorIntent;
  /** What in the configuration produced this answer, shown as a subtle caption. */
  source: string;
}

const DAY_KEYWORDS: Record<string, Weekday> = {
  monday: "Mon", mon: "Mon",
  tuesday: "Tue", tue: "Tue", tues: "Tue",
  wednesday: "Wed", wed: "Wed",
  thursday: "Thu", thu: "Thu", thurs: "Thu",
  friday: "Fri", fri: "Fri",
  saturday: "Sat", sat: "Sat",
  sunday: "Sun", sun: "Sun",
};

/** Tone adjustments applied to the assembled answer, mirroring the personality setting. */
function applyPersonality(text: string, personality: Personality): string {
  switch (personality) {
    case "professional":
      return text;
    case "concise":
      // Drop the softening lead-ins a concise assistant wouldn't use.
      return text.replace(/^(Of course[—,-]?\s*|Happy to help[—,-]?\s*|Great question[—,-]?\s*)/i, "");
    case "energetic":
      return text.endsWith("!") ? text : `${text.replace(/\.$/, "")}!`;
    default:
      return text;
  }
}

/** The next date falling on `day`, counted in the business's own timezone. */
function nextOccurrenceOf(day: Weekday, from: Date, zone: string): Date {
  for (let i = 0; i < 8; i++) {
    const candidate = addZonedDays(from, zone, i);
    if (zonedWeekday(candidate, zone) === day) return candidate;
  }
  return from;
}

/** Weekday label for an instant, as the business would name that day. */
function weekdayLabelOf(instant: Date, zone: string): string {
  return WEEKDAY_LABELS[zonedWeekday(instant, zone)];
}

interface NextOpening {
  /** "later today" or a weekday name — how a person would refer to it out loud. */
  when: string;
  /** The opening time the caller should actually turn up for, e.g. "9:00 AM". */
  opensAt: string;
  /** The full hours for that day, for answers that quote the whole window. */
  intervals: string;
  sameDay: boolean;
}

/**
 * How to describe the next opening, spoken from `now`.
 *
 * A shop that is shut at 7am but opens at 9am is not "next open Tuesday" even
 * though today *is* Tuesday — it opens later the same day, and naming the
 * weekday reads as a whole week away. Split shifts matter too: at 12:30 with
 * hours of 9–12 and 1–6, the caller needs 1:00 PM, not 9:00 AM.
 */
function describeNextOpening(config: AppConfiguration, now: Date, zone: string): NextOpening | null {
  const next = getNextOpenDay(config, now);
  if (!next || next.hours.intervals.length === 0) return null;

  const sameDay = zonedDayKey(next.date, zone) === zonedDayKey(now, zone);
  const minutesNow = zonedMinutesOfDay(now, zone);
  const upcoming = sameDay
    ? next.hours.intervals.find((i) => toMinutes(i.open) > minutesNow) ?? next.hours.intervals[0]
    : next.hours.intervals[0];

  return {
    when: sameDay ? "later today" : weekdayLabelOf(next.date, zone),
    opensAt: formatTimeOfDay(upcoming.open),
    intervals: formatIntervals(next.hours.intervals),
    sameDay,
  };
}

function describeAllHours(config: AppConfiguration): string {
  return config.hours
    .map((h) => `${WEEKDAY_LABELS[h.day]}: ${h.isOpen && h.intervals.length ? formatIntervals(h.intervals) : "Closed"}`)
    .join("\n");
}

function fallbackFor(config: AppConfiguration): string {
  const behavior = config.ai.escalation.whenUnsure;
  switch (behavior) {
    case "ask_to_call":
      return `I'm not certain about that one — the best thing is to call us directly on ${config.business.phone} and the team can help.`;
    case "escalate":
      return "I'm not sure about that, so I'm passing this to a member of the team to follow up with you shortly.";
    case "mark_for_review":
      return "That's outside what I can answer confidently. I've made a note of it for the team to review.";
    default:
      return "I'm not certain about that one. If you leave your name and number I'll take a message and someone will get back to you.";
  }
}

export function simulateReply(config: AppConfiguration, rawInput: string, now: Date = new Date()): SimulatedReply {
  const input = rawInput.trim().toLowerCase();
  const { business, ai } = config;
  // Every day/time answer below is phrased from the business's clock, so a
  // customer asking "are you open now?" gets the shop's answer, not the viewer's.
  const zone = businessZone(config);

  const reply = (text: string, intent: SimulatorIntent, source: string): SimulatedReply => ({
    text: applyPersonality(text, ai.personality),
    intent,
    source,
  });

  if (!input) return reply(ai.greeting, "greeting", "Greeting");

  // ── Hours ────────────────────────────────────────────────────────────────
  const asksHours = /\b(hour|open|close|closing|opening|shut)\w*\b/.test(input);
  if (asksHours) {
    const dayWord = Object.keys(DAY_KEYWORDS).find((k) => new RegExp(`\\b${k}\\b`).test(input));

    if (dayWord) {
      const day = DAY_KEYWORDS[dayWord];
      const date = nextOccurrenceOf(day, now, zone);
      const effective = getEffectiveHours(config, date);
      const label = WEEKDAY_LABELS[day];

      if (!effective.isOpen) {
        const note = effective.exception ? ` (${effective.exception.label})` : "";
        const next = getNextOpenDay(config, date);
        const suffix = next
          ? ` We're next open ${weekdayLabelOf(next.date, zone)}, ${formatIntervals(next.hours.intervals)}.`
          : "";
        return reply(`We're closed on ${label}${note}.${suffix}`, "hours", effective.exception ? "Special hours" : "Business hours");
      }

      const last = effective.intervals[effective.intervals.length - 1];
      const closingAsked = /\b(clos|shut)\w*\b/.test(input);
      const text = closingAsked
        ? `We close at ${formatIntervals([last]).split(" – ")[1]} on ${label}.`
        : `On ${label} we're open ${formatIntervals(effective.intervals)}.`;
      return reply(text, "hours", effective.exception ? "Special hours" : "Business hours");
    }

    if (/\btoday\b/.test(input) || /\bright now\b/.test(input) || /\bnow\b/.test(input)) {
      const effective = getEffectiveHours(config, now);
      if (!effective.isOpen) {
        const next = describeNextOpening(config, now, zone);
        const suffix = next ? ` We're next open ${next.when}, ${next.intervals}.` : "";
        return reply(`We're closed today.${suffix}`, "hours", effective.exception ? "Special hours" : "Business hours");
      }
      // The day is open, but the caller may be phoning before opening or after
      // closing. A same-day opening still to come makes "later today" the
      // useful answer; once the last shift has ended, the day's hours are
      // history and the next opening is on another day.
      if (isOutsideBusinessHours(config, now)) {
        const next = describeNextOpening(config, now, zone);
        const text =
          next?.sameDay
            ? `We're closed at the moment, but we open again later today at ${next.opensAt}.`
            : `We're closed for the day now — today's hours were ${formatIntervals(effective.intervals)}.${
                next ? ` We're next open ${next.when} at ${next.opensAt}.` : ""
              }`;
        return reply(text, "hours", effective.exception ? "Special hours" : "Business hours");
      }
      return reply(`Today we're open ${formatIntervals(effective.intervals)}.`, "hours", effective.exception ? "Special hours" : "Business hours");
    }

    return reply(`Here are our opening hours:\n${describeAllHours(config)}`, "hours", "Business hours");
  }

  // ── Pricing ──────────────────────────────────────────────────────────────
  const asksPrice = /\b(price|cost|how much|charge|fee|rate)\w*\b/.test(input);
  if (asksPrice) {
    const service = findServiceByName(config, input.replace(/\b(how much|is|a|an|the|price|cost|for|of|does|it)\b/g, " "));
    if (service) {
      const priceText = formatServicePrice(service);
      const text =
        service.priceModel === "contact"
          ? `For ${service.name} the price depends on what you need — give us a call on ${business.phone} and we'll talk it through.`
          : service.priceModel === "hidden"
            ? `I'd rather not quote a price for ${service.name} over the phone — the team can confirm when you visit.`
            : `${service.name} is ${priceText}, and takes about ${formatServiceDuration(service)}.`;
      return reply(text, "pricing", `Service: ${service.name}`);
    }

    const active = getBookableServices(config);
    if (active.length === 0) return reply(fallbackFor(config), "unknown", "Escalation rules");
    const list = active.slice(0, 4).map((s) => `${s.name} — ${formatServicePrice(s)}`).join("\n");
    return reply(`Here's what we offer:\n${list}`, "pricing", "Services");
  }

  // ── Services ─────────────────────────────────────────────────────────────
  if (/\b(service|offer|do you do|treatment|appointment type)\w*\b/.test(input)) {
    const active = getBookableServices(config);
    if (active.length === 0) return reply(fallbackFor(config), "unknown", "Escalation rules");
    const list = active.map((s) => `${s.name} (${formatServiceDuration(s)}) — ${formatServicePrice(s)}`).join("\n");
    return reply(`We offer:\n${list}`, "services", "Services");
  }

  // ── Cancel / reschedule ──────────────────────────────────────────────────
  // Checked before the generic Booking intent below: a real "cancel my
  // appointment" / "can I reschedule my booking" always also contains
  // "appointment" or "booking", so if Booking's broader regex ran first it
  // would catch every realistic cancel/reschedule phrasing and this branch
  // would be effectively unreachable.
  if (/\b(cancel|reschedul|move|change)\w*\b/.test(input) && /\b(appointment|booking)\b/.test(input)) {
    const canCancel = ai.booking.allowCancellation;
    const canReschedule = ai.booking.allowReschedule;
    if (/\bcancel\b/.test(input) && !canCancel) {
      return reply(`Cancellations need to go through the team — please call us on ${business.phone}.`, "cancel", "Booking rules");
    }
    if (!canReschedule && !/\bcancel\b/.test(input)) {
      return reply(`Changes to bookings are handled by the team — please call us on ${business.phone}.`, "cancel", "Booking rules");
    }
    return reply("Of course — could you tell me the name the appointment is under and the day it's booked for?", "cancel", "Booking rules");
  }

  // ── Booking ──────────────────────────────────────────────────────────────
  if (/\b(book|appointment|schedule|reserve|availab)\w*\b/.test(input)) {
    const closedNow = isOutsideBusinessHours(config, now);

    if (closedNow && ai.afterHours === "answer_no_booking") {
      const next = describeNextOpening(config, now, zone);
      const when = next
        ? next.sameDay
          ? ` We open again later today at ${next.opensAt}.`
          : ` We open again ${next.when} at ${next.opensAt}.`
        : "";
      return reply(`We're closed at the moment, so I can't confirm a booking right now — but I can answer any questions.${when}`, "booking", "After-hours behaviour");
    }
    if (closedNow && ai.afterHours === "take_message") {
      return reply("We're closed right now, but if you leave your name and number I'll take a message and we'll confirm your appointment when we open.", "booking", "After-hours behaviour");
    }
    if (closedNow && ai.afterHours === "share_hours") {
      const next = describeNextOpening(config, now, zone);
      const when = next ? `${next.when}, ${next.intervals}` : "shortly";
      return reply(`We're closed right now. We're next open ${when} — I'd be glad to book you in then.`, "booking", "After-hours behaviour");
    }

    const service = findServiceByName(config, input);
    const hours = Math.round(ai.booking.minNoticeMin / 60);
    const noticeText =
      ai.booking.minNoticeMin === 0
        ? "I can book you in right away"
        : ai.booking.minNoticeMin < 60
          ? `I can book you in from ${ai.booking.minNoticeMin} minutes' time`
          : `I can book you in from ${hours} hour${hours === 1 ? "'s" : "s'"} time`;

    const serviceText = service
      ? `${service.name} takes ${formatServiceDuration(service)} and is ${formatServicePrice(service)}. `
      : "";
    return reply(
      `${serviceText}${noticeText}, and up to ${ai.booking.maxAdvanceDays} days ahead. What day suits you?`,
      "booking",
      "Booking rules"
    );
  }

  // ── Location / contact ───────────────────────────────────────────────────
  if (/\b(where|address|located|location|find you|directions)\w*\b/.test(input)) {
    return reply(`We're at ${business.address}.`, "location", "Business details");
  }
  if (/\b(phone|email|contact|call you|reach)\w*\b/.test(input)) {
    return reply(`You can reach us on ${business.phone} or by email at ${business.email}.`, "contact", "Business details");
  }

  // ── Business knowledge ───────────────────────────────────────────────────
  const entry = findKnowledge(config, input);
  if (entry) return reply(entry.content, "knowledge", `Business knowledge: ${entry.title}`);

  // ── Fallback, governed by the escalation setting ─────────────────────────
  const behaviorLabel = UNSURE_OPTIONS.find((o) => o.value === ai.escalation.whenUnsure)?.label ?? "Escalation";
  return reply(fallbackFor(config), "unknown", `Escalation: ${behaviorLabel}`);
}

/** Starter prompts that exercise the parts of the configuration most worth checking. */
export const SUGGESTED_PROMPTS = [
  "What time do you close on Wednesday?",
  "How much is a haircut?",
  "What services do you offer?",
  "I'd like to book an appointment",
  "Do you accept walk-ins?",
  "Where are you located?",
];
