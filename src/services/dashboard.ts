import type {
  AppConfiguration,
  Appointment,
  Call,
  ChannelBreakdownEntry,
  Conversation,
  DashboardStats,
  Dataset,
  IntentBreakdownEntry,
  KPI,
  TrendPoint,
  Weekday,
} from "@/types";
import { WEEKDAYS } from "@/types";
import { CHANNEL_LABELS, INTENT_LABELS } from "@/data/constants";
import { getPreviousPeriod, inBounds, type Bounds } from "@/lib/date-range";
import { buildBuckets, countInBucket } from "@/lib/buckets";
import { getZonedParts } from "@/lib/timezone";
import { appointmentInstant } from "./business";

/**
 * Pure selector functions over an already-loaded demo Dataset.
 * Swapping the demo adapter for a real backend later means making these
 * `async` and fetching remotely — call sites (hooks) already treat the
 * dataset as an opaque, already-resolved source, so the UI won't change.
 */

export function getDashboardStats(dataset: Dataset, bounds: Bounds, timeZone: string): DashboardStats {
  const prevBounds = getPreviousPeriod(bounds);
  const buckets = buildBuckets(bounds, timeZone);

  const conversationsInRange = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const conversationsPrev = dataset.conversations.filter((c) => inBounds(c.timestamp, prevBounds));
  const callsInRange = dataset.calls.filter((c) => inBounds(c.timestamp, bounds));
  const callsPrev = dataset.calls.filter((c) => inBounds(c.timestamp, prevBounds));
  const appointmentsInRange = dataset.appointments.filter((a) => inBounds(a.createdAt, bounds));
  const appointmentsPrev = dataset.appointments.filter((a) => inBounds(a.createdAt, prevBounds));

  const answeredCalls = (calls: Call[]) => calls.filter((c) => c.outcome !== "missed").length;
  const bookingIntent = (convs: Conversation[]) => convs.filter((c) => c.intent === "booking").length;
  const booked = (convs: Conversation[]) => convs.filter((c) => c.outcome === "booked").length;
  const missedEscalated = (convs: Conversation[]) => convs.filter((c) => c.outcome === "missed" || c.outcome === "escalated").length;

  const answerRate = (calls: Call[]) => (calls.length === 0 ? 0 : (answeredCalls(calls) / calls.length) * 100);
  const bookingConversion = (convs: Conversation[]) => {
    const intent = bookingIntent(convs);
    return intent === 0 ? 0 : (booked(convs) / intent) * 100;
  };

  const kpis: KPI[] = [
    {
      key: "appointments_booked",
      label: "Appointments booked",
      value: appointmentsInRange.length,
      previousValue: appointmentsPrev.length,
      format: "number",
      sparkline: buckets.map((b) => countInBucket(dataset.appointments, (a) => a.createdAt, b)),
    },
    {
      key: "conversations_handled",
      label: "Conversations handled",
      value: conversationsInRange.length,
      previousValue: conversationsPrev.length,
      format: "number",
      sparkline: buckets.map((b) => countInBucket(dataset.conversations, (c) => c.timestamp, b)),
    },
    {
      key: "calls_answered",
      label: "Calls answered",
      value: answeredCalls(callsInRange),
      previousValue: answeredCalls(callsPrev),
      format: "number",
      sparkline: buckets.map((b) => countInBucket(dataset.calls.filter((c) => c.outcome !== "missed"), (c) => c.timestamp, b)),
    },
    {
      key: "answer_rate",
      label: "Answer rate",
      value: answerRate(callsInRange),
      previousValue: answerRate(callsPrev),
      format: "percent",
      sparkline: buckets.map((b) => {
        const inBucket = dataset.calls.filter((c) => inBounds(c.timestamp, b));
        return Math.round(answerRate(inBucket));
      }),
    },
    {
      key: "booking_conversion",
      label: "Booking conversion",
      value: bookingConversion(conversationsInRange),
      previousValue: bookingConversion(conversationsPrev),
      format: "percent",
      sparkline: buckets.map((b) => {
        const inBucket = dataset.conversations.filter((c) => inBounds(c.timestamp, b));
        return Math.round(bookingConversion(inBucket));
      }),
    },
    {
      key: "missed_escalated",
      label: "Missed / escalated",
      value: missedEscalated(conversationsInRange),
      previousValue: missedEscalated(conversationsPrev),
      format: "number",
      sparkline: buckets.map((b) => countInBucket(dataset.conversations.filter((c) => c.outcome === "missed" || c.outcome === "escalated"), (c) => c.timestamp, b)),
    },
  ];

  const trend: TrendPoint[] = buckets.map((b) => ({
    date: b.dateKey,
    label: b.label,
    conversations: countInBucket(dataset.conversations, (c) => c.timestamp, b),
    appointments: countInBucket(dataset.appointments, (a) => a.createdAt, b),
  }));

  return { kpis, trend };
}

export interface TopServicesByDay {
  /** Up to `limit` service names, ordered by total bookings in the period, most first. */
  services: string[];
  /** One entry per (service, weekday) pair, including zero counts, for a dense grid. */
  cells: { service: string; day: Weekday; count: number }[];
  /** The single highest cell count, for scaling a bubble's size against the rest of the grid. */
  maxCount: number;
}

/**
 * Which services get booked on which day of the week — a different lens than
 * the trend chart's "how much, over time" (this is "what, and when in the
 * week"), scoped to the same selected period and re-using the exact
 * booked-vs-scheduled distinction the rest of this file already draws:
 * `createdAt` (booked), not the appointment's future `date`.
 *
 * Fixed at seven weekday columns regardless of the selected range — unlike
 * the trend chart's buckets, which grow from hourly to weekly as the range
 * widens, a compact grid has no room for 30 or 90 daily columns, and "which
 * weekday" is a meaningful axis on its own rather than a cramped substitute
 * for a longer one.
 */
export function getTopServicesByDay(dataset: Dataset, bounds: Bounds, timeZone: string, limit = 5): TopServicesByDay {
  const appointmentsIn = dataset.appointments.filter((a) => inBounds(a.createdAt, bounds));

  const totals = new Map<string, number>();
  for (const a of appointmentsIn) {
    totals.set(a.service.name, (totals.get(a.service.name) ?? 0) + 1);
  }
  const services = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
  const serviceSet = new Set(services);

  const counts = new Map<string, number>();
  for (const a of appointmentsIn) {
    if (!serviceSet.has(a.service.name)) continue;
    const day = getZonedParts(new Date(a.createdAt), timeZone).weekday;
    const key = `${a.service.name}|${day}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: TopServicesByDay["cells"] = [];
  let maxCount = 0;
  for (const service of services) {
    for (const day of WEEKDAYS) {
      const count = counts.get(`${service}|${day}`) ?? 0;
      cells.push({ service, day, count });
      maxCount = Math.max(maxCount, count);
    }
  }

  return { services, cells, maxCount };
}

export function getCallVolume(dataset: Dataset, bounds: Bounds, timeZone: string): { date: string; label: string; answered: number; missed: number }[] {
  const buckets = buildBuckets(bounds, timeZone);
  return buckets.map((b) => {
    const inBucket = dataset.calls.filter((c) => inBounds(c.timestamp, b));
    return {
      date: b.dateKey,
      label: b.label,
      answered: inBucket.filter((c) => c.outcome !== "missed").length,
      missed: inBucket.filter((c) => c.outcome === "missed").length,
    };
  });
}

export function getChannelBreakdown(dataset: Dataset, bounds: Bounds): ChannelBreakdownEntry[] {
  const inRange = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const total = inRange.length || 1;
  return (Object.keys(CHANNEL_LABELS) as (keyof typeof CHANNEL_LABELS)[]).map((channel) => {
    const count = inRange.filter((c) => c.channel === channel).length;
    return { channel, count, percent: Math.round((count / total) * 100) };
  });
}

export function getIntentDistribution(dataset: Dataset, bounds: Bounds): IntentBreakdownEntry[] {
  const inRange = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const total = inRange.length || 1;
  return (Object.keys(INTENT_LABELS) as (keyof typeof INTENT_LABELS)[])
    .map((intent) => {
      const count = inRange.filter((c) => c.intent === intent).length;
      return { intent, count, percent: Math.round((count / total) * 100) };
    })
    .sort((a, b) => b.count - a.count);
}

export function getRecentActivity(dataset: Dataset, limit = 8) {
  return dataset.activityEvents.slice(0, limit);
}

export function getRecentConversations(dataset: Dataset, limit = 6): Conversation[] {
  return dataset.conversations.slice(0, limit);
}

export function getUpcomingAppointments(dataset: Dataset, config: AppConfiguration, now: Date, limit = 6): Appointment[] {
  const instantOf = (a: Appointment) => appointmentInstant(config, a);
  return dataset.appointments
    .filter((a) => instantOf(a) >= now && a.status !== "cancelled")
    .sort((a, b) => instantOf(a).getTime() - instantOf(b).getTime())
    .slice(0, limit);
}
