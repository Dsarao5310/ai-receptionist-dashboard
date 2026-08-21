import type {
  ActivityEvent,
  ActivityEventType,
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  Call,
  Channel,
  Conversation,
  ConversationOutcome,
  Customer,
  Dataset,
  Intent,
} from "@/types";
import { addMinutes, mulberry32, pick, pickWeighted, randomInt, type Rand } from "./generator";
import { snapshotOfService } from "@/services/business";
import {
  addZonedDays,
  formatDayKey,
  startOfZonedDay,
  wallClockToInstant,
  zonedDayKey,
} from "@/lib/timezone";
import {
  CHANNEL_WEIGHTS,
  FIRST_NAMES,
  INTENT_WEIGHTS,
  LAST_NAMES,
  QUESTION_TOPICS,
  SERVICES,
} from "./constants";
import { DEFAULT_CONFIGURATION } from "./default-config";

const EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "icloud.com"];

/** A wall-clock time within trading hours, as "HH:mm" in the business timezone. */
function randomWallClockTime(rand: Rand, startHour = 9, endHour = 18): string {
  const minutes = startHour * 60 + randomInt(rand, 0, (endHour - startHour) * 60 - 1);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** An instant on the given local day, between the given business-zone hours. */
function randomInstantOnZonedDay(rand: Rand, dayAnchor: Date, zone: string, startHour = 9, endHour = 18): Date {
  return wallClockToInstant(zonedDayKey(dayAnchor, zone), randomWallClockTime(rand, startHour, endHour), zone);
}

function makeCustomer(rand: Rand, id: number): Customer {
  const first = pick(rand, FIRST_NAMES);
  const last = pick(rand, LAST_NAMES);
  const name = `${first} ${last}`;
  const phone = `(${randomInt(rand, 200, 989)}) ${randomInt(rand, 200, 989)}-${String(randomInt(rand, 0, 9999)).padStart(4, "0")}`;
  const email = `${first.toLowerCase()}.${last.toLowerCase()}${randomInt(rand, 1, 99)}@${pick(rand, EMAIL_DOMAINS)}`;
  return {
    id: `cust_${id}`,
    name,
    phone,
    email,
    lastInteraction: "",
    lastChannel: "voice",
    totalAppointments: 0,
    createdAt: "",
  };
}

function deriveOutcome(rand: Rand, intent: Intent, channel: Channel): ConversationOutcome {
  if (channel === "voice" && rand() < 0.05) return "missed";
  switch (intent) {
    case "booking": {
      // "missed" only makes sense for a voice call — SMS/email fall back to escalated instead.
      const weights = channel === "voice" ? { booked: 0.82, escalated: 0.1, missed: 0.08 } : { booked: 0.86, escalated: 0.14 };
      return pickWeighted(rand, weights as Record<string, number>) as ConversationOutcome;
    }
    case "reschedule":
      return pickWeighted(rand, { rescheduled: 0.85, escalated: 0.15 } as Record<string, number>) as ConversationOutcome;
    case "cancel":
      return pickWeighted(rand, { cancelled: 0.9, no_action: 0.1 } as Record<string, number>) as ConversationOutcome;
    case "hours":
    case "pricing":
    case "services":
      return pickWeighted(rand, { answered: 0.88, escalated: 0.12 } as Record<string, number>) as ConversationOutcome;
    default:
      return pickWeighted(rand, { answered: 0.7, no_action: 0.2, escalated: 0.1 } as Record<string, number>) as ConversationOutcome;
  }
}

function summaryFor(intent: Intent, outcome: ConversationOutcome, customerName: string, service: string, topic: string): string {
  if (outcome === "missed") return `Missed call from ${customerName}. No voicemail left.`;
  if (outcome === "escalated") return `${customerName} needed help the assistant couldn't fully resolve — flagged for follow-up.`;
  switch (intent) {
    case "booking":
      return `${customerName} booked a ${service} appointment.`;
    case "reschedule":
      return `${customerName} moved an existing appointment to a new time.`;
    case "cancel":
      return `${customerName} cancelled their upcoming appointment.`;
    case "hours":
    case "pricing":
    case "services":
      return `${customerName} asked about ${topic}.`;
    default:
      return `${customerName} reached out with a general question.`;
  }
}

function transcriptFor(intent: Intent, outcome: ConversationOutcome, service: string, topic: string): Conversation["transcript"] {
  const lines: Conversation["transcript"] = [
    { speaker: "ai", text: `Thanks for contacting us, this is your AI receptionist — how can I help?`, time: "0:00" },
  ];
  if (intent === "booking") {
    lines.push({ speaker: "customer", text: `Hi, I'd like to book a ${service.toLowerCase()}.`, time: "0:06" });
    lines.push({ speaker: "ai", text: `Happy to help. Let me check availability for you.`, time: "0:12" });
    if (outcome === "booked") {
      lines.push({ speaker: "ai", text: `You're all set — I've booked your ${service.toLowerCase()} and sent a confirmation.`, time: "0:34" });
    }
  } else if (intent === "reschedule") {
    lines.push({ speaker: "customer", text: `I need to move my appointment to a different day.`, time: "0:05" });
    lines.push({ speaker: "ai", text: `No problem, I can help you reschedule that now.`, time: "0:11" });
  } else if (intent === "cancel") {
    lines.push({ speaker: "customer", text: `I need to cancel my upcoming appointment.`, time: "0:04" });
    lines.push({ speaker: "ai", text: `I've cancelled that appointment for you.`, time: "0:18" });
  } else if (intent === "hours" || intent === "pricing" || intent === "services") {
    lines.push({ speaker: "customer", text: `Quick question — ${topic}?`, time: "0:03" });
    lines.push({ speaker: "ai", text: `Great question, here's what I can tell you...`, time: "0:09" });
  } else {
    lines.push({ speaker: "customer", text: `Hi, I had a general question.`, time: "0:03" });
  }
  if (outcome === "escalated") {
    lines.push({ speaker: "ai", text: `That's a great question for the team directly — I'll flag this for a callback.`, time: "0:40" });
  }
  return lines;
}

function actionsFor(intent: Intent, outcome: ConversationOutcome, channel: Channel): { label: string; done: boolean }[] {
  // A missed call never got far enough for the assistant to detect intent or act on it.
  if (outcome === "missed") {
    return [
      { label: "Call received", done: true },
      { label: "Call answered", done: false },
      { label: "Voicemail left", done: false },
    ];
  }
  const received = channel === "voice" ? "Call answered" : channel === "sms" ? "Text message received" : "Email received";
  if (intent === "booking") {
    return [
      { label: received, done: true },
      { label: "Intent detected", done: true },
      { label: "Availability checked", done: true },
      { label: "Appointment booked", done: outcome === "booked" },
      { label: "Confirmation sent", done: outcome === "booked" },
    ];
  }
  if (intent === "reschedule") {
    return [
      { label: received, done: true },
      { label: "Existing appointment located", done: true },
      { label: "New time confirmed", done: outcome === "rescheduled" },
      { label: "Confirmation sent", done: outcome === "rescheduled" },
    ];
  }
  if (intent === "cancel") {
    return [
      { label: received, done: true },
      { label: "Appointment located", done: true },
      { label: "Cancellation processed", done: outcome === "cancelled" },
    ];
  }
  return [
    { label: received, done: true },
    { label: "Question addressed", done: outcome === "answered" },
  ];
}

/**
 * `timeZone` is the business's own zone: generated appointment days and times are
 * wall-clock values in that zone, and "today" means the business's today rather
 * than the viewer's. Defaults to the seeded configuration's zone so callers that
 * don't care stay simple.
 */
export function buildDataset(now: Date, seed = 42, timeZone: string = DEFAULT_CONFIGURATION.business.timezone): Dataset {
  const rand = mulberry32(seed);
  const zone = timeZone;

  // --- Customers ---
  const customers: Customer[] = Array.from({ length: 46 }, (_, i) => makeCustomer(rand, i + 1));
  const customerActivity = new Map<string, { last: Date; lastChannel: Channel; count: number }>();

  // Assigning conversations to customers uniformly would make every customer look
  // recently-active. Give each one an activity window (in days-ago) instead, so the
  // book has genuine regulars, recent first-timers, and lapsed customers.
  const activityWindows = new Map<string, { oldest: number; newest: number }>();
  customers.forEach((customer, i) => {
    const cohort = i % 10;
    if (cohort < 2) activityWindows.set(customer.id, { oldest: 190, newest: 75 }); // lapsed
    else if (cohort < 4) activityWindows.set(customer.id, { oldest: 18, newest: 0 }); // new
    else activityWindows.set(customer.id, { oldest: 190, newest: 0 }); // regulars
  });

  function pickCustomerFor(timestamp: Date) {
    const daysAgo = (now.getTime() - timestamp.getTime()) / 86_400_000;
    const eligible = customers.filter((c) => {
      const w = activityWindows.get(c.id)!;
      return daysAgo <= w.oldest && daysAgo >= w.newest;
    });
    return eligible.length > 0 ? pick(rand, eligible) : pick(rand, customers);
  }

  const conversations: Conversation[] = [];
  const appointments: Appointment[] = [];

  function pushAppointmentFromConversation(
    conv: { customerId: string; customerName: string; timestamp: Date },
    statusMode: AppointmentStatus | "auto",
    source: AppointmentSource,
    service: (typeof SERVICES)[number]
  ): Appointment {
    const leadDays = statusMode === "cancelled" ? randomInt(rand, 0, 6) : randomInt(rand, 1, 12);
    const apptDayKey = zonedDayKey(addZonedDays(conv.timestamp, zone, leadDays), zone);
    const apptTimeOfDay = randomWallClockTime(rand);
    const apptInstant = wallClockToInstant(apptDayKey, apptTimeOfDay, zone);
    // Derive completed/confirmed from the actual scheduled instant so the two never disagree.
    const status: AppointmentStatus = statusMode === "auto" ? (apptInstant.getTime() < now.getTime() ? "completed" : "confirmed") : statusMode;
    const customer = customers.find((c) => c.id === conv.customerId)!;
    const appt: Appointment = {
      id: `apt_${appointments.length + 1}`,
      customerId: conv.customerId,
      customerName: conv.customerName,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      serviceId: service.id,
      // Snapshot of the catalogue entry as it stood when this was booked.
      service: snapshotOfService(service),
      date: apptDayKey,
      time: apptTimeOfDay,
      source,
      status,
      notes: "",
      createdAt: conv.timestamp.toISOString(),
      updatedAt: conv.timestamp.toISOString(),
    };
    appointments.push(appt);
    return appt;
  }

  function generateConversation(timestamp: Date, forceChannel?: Channel) {
    const customer = pickCustomerFor(timestamp);
    const channel = forceChannel ?? pickWeighted(rand, CHANNEL_WEIGHTS as Record<string, number>) as Channel;
    const intent = pickWeighted(rand, INTENT_WEIGHTS as Record<string, number>) as Intent;
    const outcome = deriveOutcome(rand, intent, channel);
    const service = pick(rand, SERVICES);
    const topic = pick(rand, QUESTION_TOPICS);

    let appointmentId: string | undefined;
    let bookingAction: string | undefined;

    if (outcome === "booked") {
      const appt = pushAppointmentFromConversation({ customerId: customer.id, customerName: customer.name, timestamp }, "auto", channel as AppointmentSource, service);
      appointmentId = appt.id;
      bookingAction = `Booked ${appt.service.name} for ${formatDayKey(appt.date, zone, { month: "short", day: "numeric" })} at ${appt.time}`;
    } else if (outcome === "rescheduled") {
      const appt = pushAppointmentFromConversation({ customerId: customer.id, customerName: customer.name, timestamp }, "rescheduled", channel as AppointmentSource, service);
      appointmentId = appt.id;
      bookingAction = `Rescheduled to ${formatDayKey(appt.date, zone, { month: "short", day: "numeric" })} at ${appt.time}`;
    } else if (outcome === "cancelled") {
      const appt = pushAppointmentFromConversation({ customerId: customer.id, customerName: customer.name, timestamp }, "cancelled", channel as AppointmentSource, service);
      appointmentId = appt.id;
      bookingAction = `Cancelled ${appt.service.name}`;
    }

    const conv: Conversation = {
      id: `conv_${conversations.length + 1}`,
      customerId: customer.id,
      customerName: customer.name,
      channel,
      timestamp: timestamp.toISOString(),
      intent,
      outcome,
      summary: summaryFor(intent, outcome, customer.name, service.name, topic),
      transcriptPreview: outcome === "missed" ? "No transcript — call was not answered." : `${customer.name}: ${transcriptFor(intent, outcome, service.name, topic)[1]?.text ?? ""}`,
      transcript: transcriptFor(intent, outcome, service.name, topic),
      bookingAction,
      appointmentId,
      actions: actionsFor(intent, outcome, channel),
      durationSec: channel === "voice" ? randomInt(rand, 35, 420) : undefined,
    };
    conversations.push(conv);

    const prev = customerActivity.get(customer.id);
    if (!prev || timestamp > prev.last) {
      customerActivity.set(customer.id, { last: timestamp, lastChannel: channel, count: (prev?.count ?? 0) + 1 });
    } else {
      customerActivity.set(customer.id, { ...prev, count: prev.count + 1 });
    }

    return conv;
  }

  // --- Past conversations across the last 190 days (covers the previous-period
  // comparison window for the 90D range, which looks back up to 180 days) ---
  for (let i = 0; i < 440; i++) {
    const day = addZonedDays(now, zone, -randomInt(rand, 1, 190));
    generateConversation(randomInstantOnZonedDay(rand, day, zone, 8, 19));
  }

  // --- A handful of conversations happening "today", recent enough for a lively activity feed ---
  const todayCount = randomInt(rand, 4, 7);
  for (let i = 0; i < todayCount; i++) {
    const minutesAgo = randomInt(rand, 2, 500);
    const timestamp = addMinutes(now, -minutesAgo);
    // "Today" is the business's day, not the viewer's.
    if (timestamp > startOfZonedDay(now, zone)) generateConversation(timestamp);
  }

  // --- Standalone future appointments already on the books (not all originate from a logged conversation) ---
  for (let i = 0; i < 34; i++) {
    const dayKey = zonedDayKey(addZonedDays(now, zone, randomInt(rand, 0, 14)), zone);
    const timeOfDay = randomWallClockTime(rand);
    // Spread bookings across the preceding weeks. Customers commonly book a slot well
    // in advance, and clustering all of these into the last few days would spike
    // "appointments booked" for any range touching today while leaving the
    // previous-period comparison artificially empty.
    const bookedAt = addMinutes(now, -randomInt(rand, 45, 45 * 24 * 60));
    const customer = pickCustomerFor(bookedAt);
    const service = pick(rand, SERVICES);
    const source = pickWeighted(rand, { voice: 0.45, sms: 0.3, email: 0.15, manual: 0.1 } as Record<string, number>) as AppointmentSource;
    const status = pickWeighted(rand, { confirmed: 0.72, pending: 0.2, rescheduled: 0.05, cancelled: 0.03 } as Record<string, number>) as AppointmentStatus;
    appointments.push({
      id: `apt_${appointments.length + 1}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      serviceId: service.id,
      // Snapshot of the catalogue entry as it stood when this was booked.
      service: snapshotOfService(service),
      date: dayKey,
      time: timeOfDay,
      source,
      status,
      notes: "",
      createdAt: bookedAt.toISOString(),
      updatedAt: bookedAt.toISOString(),
    });
    // The interaction happened when the appointment was booked, not when it is scheduled to occur.
    const prev = customerActivity.get(customer.id);
    if (!prev || bookedAt > prev.last) {
      customerActivity.set(customer.id, { last: bookedAt, lastChannel: source === "manual" ? "voice" : source, count: prev?.count ?? 0 });
    }
  }

  // --- Derive Calls from voice conversations ---
  const calls: Call[] = conversations
    .filter((c) => c.channel === "voice")
    .map((c, idx) => {
      const customer = customers.find((cust) => cust.id === c.customerId)!;
      return {
        id: `call_${idx + 1}`,
        conversationId: c.id,
        customerId: c.customerId,
        customerName: c.customerName,
        customerPhone: customer.phone,
        timestamp: c.timestamp,
        durationSec: c.durationSec ?? randomInt(rand, 30, 300),
        intent: c.intent,
        outcome: c.outcome,
        appointmentId: c.appointmentId,
        summary: c.summary,
        transcript: c.transcript,
        actions: c.actions,
      };
    });

  // --- Activity events derived from conversations ---
  const activityEvents: ActivityEvent[] = [];
  for (const c of conversations) {
    let type: ActivityEventType | null = null;
    if (c.outcome === "booked") type = "appointment_booked";
    else if (c.outcome === "rescheduled") type = "appointment_rescheduled";
    else if (c.outcome === "cancelled") type = "appointment_cancelled";
    else if (c.outcome === "escalated") type = "conversation_escalated";
    else if (c.outcome === "missed") type = "conversation_missed";
    else if (c.outcome === "answered" && c.channel === "voice") type = "call_completed";
    else if (c.outcome === "answered") type = "question_answered";
    if (!type) continue;

    activityEvents.push({
      id: `evt_${activityEvents.length + 1}`,
      type,
      timestamp: c.timestamp,
      customerId: c.customerId,
      customerName: c.customerName,
      channel: c.channel,
      summary: c.summary,
      detail: c.bookingAction ?? c.summary,
      conversationId: c.id,
      callId: calls.find((call) => call.conversationId === c.id)?.id,
      appointmentId: c.appointmentId,
    });
  }
  activityEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  /** Appointment start as a real instant, resolved against the business timezone. */
  const instantOf = (a: Appointment) => wallClockToInstant(a.date, a.time, zone);

  // --- Finalize customer aggregates ---
  for (const customer of customers) {
    const activity = customerActivity.get(customer.id);
    const custAppointments = appointments.filter((a) => a.customerId === customer.id);
    const upcoming = custAppointments
      .filter((a) => instantOf(a) >= now && a.status !== "cancelled")
      .sort((a, b) => instantOf(a).getTime() - instantOf(b).getTime())[0];

    customer.lastInteraction = (activity?.last ?? addZonedDays(now, zone, -randomInt(rand, 5, 120))).toISOString();
    customer.lastChannel = activity?.lastChannel ?? "voice";
    customer.totalAppointments = custAppointments.length;
    customer.upcomingAppointmentId = upcoming?.id;

    // "Customer since" must never post-date their earliest recorded interaction.
    const firstSeen = Math.min(
      ...conversations.filter((c) => c.customerId === customer.id).map((c) => new Date(c.timestamp).getTime()),
      ...custAppointments.map((a) => new Date(a.createdAt).getTime()),
      new Date(customer.lastInteraction).getTime()
    );
    customer.createdAt = addZonedDays(new Date(firstSeen), zone, -randomInt(rand, 0, 20)).toISOString();
  }

  conversations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  appointments.sort((a, b) => instantOf(a).getTime() - instantOf(b).getTime());

  return {
    generatedAt: now.toISOString(),
    customers,
    conversations,
    calls,
    appointments,
    activityEvents,
  };
}
