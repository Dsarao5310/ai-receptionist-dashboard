import type { Appointment, AppointmentStatus, AppConfiguration, Channel, Conversation, Dataset, Intent, KPI, Weekday } from "@/types";
import { CHANNEL_LABELS, INTENT_LABELS } from "@/data/constants";
import { WEEKDAYS } from "@/types";
import { appointmentInstant, businessZone, isOutsideBusinessHours } from "./business";
import { getZonedParts } from "@/lib/timezone";
import { getPreviousPeriod, inBounds, type Bounds } from "@/lib/date-range";
import { buildBuckets } from "@/lib/buckets";

/**
 * Analytics selectors. Every number here is derived from the same live Dataset
 * that powers Conversations, Calls, Appointments and Customers — there is no
 * separate analytics store, so a mutation anywhere (cancel, reschedule) shows up
 * here on the next render without a refresh.
 *
 * ── Three different date questions, deliberately kept apart ──────────────────
 *   occurred   — an interaction happened      → conversation/call `timestamp`
 *   booked     — an appointment was created   → appointment `createdAt`
 *   scheduled  — an appointment will happen   → appointment `date` + `time`
 * Appointments are routinely scheduled into the future, so mixing these would
 * silently double-count or drop records. Each selector states which it uses.
 */

export type AppointmentDateBasis = "booked" | "scheduled";

function appointmentDate(config: AppConfiguration, a: Appointment, basis: AppointmentDateBasis): Date {
  return basis === "booked" ? new Date(a.createdAt) : appointmentInstant(config, a);
}

export function filterAppointments(
  dataset: Dataset,
  config: AppConfiguration,
  bounds: Bounds,
  basis: AppointmentDateBasis
): Appointment[] {
  return dataset.appointments.filter((a) => inBounds(appointmentDate(config, a, basis), bounds));
}

/**
 * Maps appointmentId → the conversation that produced it. Reschedule and
 * cancellation conversations also create appointment rows, so an appointment's
 * existence alone does not mean a *new* booking was won — the originating
 * conversation's outcome is what distinguishes them.
 */
function buildOriginIndex(dataset: Dataset): Map<string, Conversation> {
  const index = new Map<string, Conversation>();
  for (const c of dataset.conversations) {
    if (c.appointmentId) index.set(c.appointmentId, c);
  }
  return index;
}

/**
 * A *new* booking: either it came from a conversation whose outcome was "booked",
 * or it has no originating conversation at all (booked directly/manually).
 * Appointments spawned by reschedule or cancellation conversations are excluded,
 * so a reschedule never inflates the "appointments booked" count.
 */
function isNewBooking(appointment: Appointment, origins: Map<string, Conversation>): boolean {
  const origin = origins.get(appointment.id);
  return !origin || origin.outcome === "booked";
}

export function getNewBookings(dataset: Dataset, config: AppConfiguration, bounds: Bounds): Appointment[] {
  const origins = buildOriginIndex(dataset);
  return filterAppointments(dataset, config, bounds, "booked").filter((a) => isNewBooking(a, origins));
}

/** Booking-intent conversations — the denominator for booking conversion. */
function bookingRequests(conversations: Conversation[]): Conversation[] {
  return conversations.filter((c) => c.intent === "booking");
}

function bookingConversionRate(conversations: Conversation[]): number {
  const requests = bookingRequests(conversations);
  if (requests.length === 0) return 0;
  const won = requests.filter((c) => c.outcome === "booked").length;
  return (won / requests.length) * 100;
}

// ── Summary KPIs ────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  kpis: KPI[];
  /** Plain-language note on how booking conversion is computed, shown in the UI. */
  conversionBasis: string;
}

export function getAnalyticsSummary(dataset: Dataset, config: AppConfiguration, bounds: Bounds): AnalyticsSummary {
  const prev = getPreviousPeriod(bounds);
  const buckets = buildBuckets(bounds, businessZone(config));
  const origins = buildOriginIndex(dataset);

  const convsIn = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const convsPrev = dataset.conversations.filter((c) => inBounds(c.timestamp, prev));
  const callsIn = dataset.calls.filter((c) => inBounds(c.timestamp, bounds));
  const callsPrev = dataset.calls.filter((c) => inBounds(c.timestamp, prev));

  const newBookings = (b: Bounds) => filterAppointments(dataset, config, b, "booked").filter((a) => isNewBooking(a, origins)).length;

  // Reschedules and cancellations are counted from the *appointment* state, using
  // updatedAt as the moment the change happened — so cancelling from the drawer
  // right now lands in today's bucket immediately.
  const rescheduledCount = (b: Bounds) =>
    dataset.appointments.filter((a) => a.status === "rescheduled" && inBounds(a.updatedAt, b)).length;
  const cancelledCount = (b: Bounds) =>
    dataset.appointments.filter((a) => a.status === "cancelled" && inBounds(a.updatedAt, b)).length;

  const answerRate = (calls: typeof callsIn) =>
    calls.length === 0 ? 0 : (calls.filter((c) => c.outcome !== "missed").length / calls.length) * 100;

  const convsInBucket = (b: Bounds) => dataset.conversations.filter((c) => inBounds(c.timestamp, b));
  const callsInBucket = (b: Bounds) => dataset.calls.filter((c) => inBounds(c.timestamp, b));

  const kpis: KPI[] = [
    {
      key: "conversations_handled",
      label: "Conversations handled",
      value: convsIn.length,
      previousValue: convsPrev.length,
      format: "number",
      sparkline: buckets.map((b) => convsInBucket(b).length),
    },
    {
      key: "appointments_booked",
      label: "Appointments booked",
      value: newBookings(bounds),
      previousValue: newBookings(prev),
      format: "number",
      sparkline: buckets.map((b) => newBookings(b)),
    },
    {
      key: "booking_conversion",
      label: "Booking conversion",
      value: bookingConversionRate(convsIn),
      previousValue: bookingConversionRate(convsPrev),
      format: "percent",
      sparkline: buckets.map((b) => Math.round(bookingConversionRate(convsInBucket(b)))),
    },
    {
      key: "answer_rate",
      label: "Call answer rate",
      value: answerRate(callsIn),
      previousValue: answerRate(callsPrev),
      format: "percent",
      sparkline: buckets.map((b) => Math.round(answerRate(callsInBucket(b)))),
    },
    {
      key: "reschedules",
      label: "Reschedules",
      value: rescheduledCount(bounds),
      previousValue: rescheduledCount(prev),
      format: "number",
      sparkline: buckets.map((b) => rescheduledCount(b)),
    },
    {
      key: "cancellations",
      label: "Cancellations",
      value: cancelledCount(bounds),
      previousValue: cancelledCount(prev),
      format: "number",
      sparkline: buckets.map((b) => cancelledCount(b)),
    },
  ];

  return {
    kpis,
    conversionBasis: "Booking conversion = conversations that ended in a booking ÷ conversations where the customer asked to book.",
  };
}

// ── Conversation trend ──────────────────────────────────────────────────────

export interface AnalyticsTrendPoint {
  date: string;
  label: string;
  voice: number;
  sms: number;
  email: number;
  total: number;
}

/** Interactions that *occurred* in each bucket, split by channel. */
export function getConversationTrend(dataset: Dataset, config: AppConfiguration, bounds: Bounds): AnalyticsTrendPoint[] {
  return buildBuckets(bounds, businessZone(config)).map((bucket) => {
    const inBucket = dataset.conversations.filter((c) => inBounds(c.timestamp, bucket));
    const voice = inBucket.filter((c) => c.channel === "voice").length;
    const sms = inBucket.filter((c) => c.channel === "sms").length;
    const email = inBucket.filter((c) => c.channel === "email").length;
    return { date: bucket.dateKey, label: bucket.label, voice, sms, email, total: inBucket.length };
  });
}

// ── Booking funnel ──────────────────────────────────────────────────────────

export interface FunnelStage {
  key: string;
  label: string;
  description: string;
  value: number;
  /** Conversion from the previous stage, null for the first stage. */
  conversionFromPrevious: number | null;
  drillHref?: string;
}

export interface BookingFunnel {
  stages: FunnelStage[];
  /**
   * Bookings taken directly (walk-in, phone-in, manual entry) with no logged
   * conversation. They are real bookings and count toward the KPI, but they
   * never entered this funnel — surfaced separately so the funnel's final
   * number and the "appointments booked" KPI don't look contradictory.
   */
  directBookings: number;
}

/**
 * Only stages the data model genuinely supports. "Availability checked" comes
 * from the AI's recorded action steps on the conversation, not an assumption.
 */
export function getBookingFunnel(dataset: Dataset, config: AppConfiguration, bounds: Bounds): BookingFunnel {
  const convsIn = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const requests = bookingRequests(convsIn);
  const availabilityChecked = requests.filter((c) => c.actions.some((a) => a.label === "Availability checked" && a.done));
  const booked = requests.filter((c) => c.outcome === "booked");

  const origins = buildOriginIndex(dataset);
  const directBookings = filterAppointments(dataset, config, bounds, "booked").filter((a) => !origins.has(a.id)).length;

  const stages: Omit<FunnelStage, "conversionFromPrevious">[] = [
    {
      key: "interactions",
      label: "Customer interactions",
      description: "Every voice, SMS and email conversation handled",
      value: convsIn.length,
      drillHref: "/conversations",
    },
    {
      key: "booking_intent",
      label: "Booking requests",
      description: "Customer asked to book an appointment",
      value: requests.length,
      drillHref: "/conversations?intent=booking",
    },
    {
      key: "availability_checked",
      label: "Availability checked",
      description: "AI looked up open slots for the customer",
      value: availabilityChecked.length,
      drillHref: "/conversations?intent=booking",
    },
    {
      key: "booked",
      label: "Appointment booked",
      description: "Conversation ended with a confirmed booking",
      value: booked.length,
      drillHref: "/conversations?intent=booking&outcome=booked",
    },
  ];

  return {
    stages: stages.map((stage, i) => {
      const prevValue = i === 0 ? null : stages[i - 1].value;
      return {
        ...stage,
        conversionFromPrevious: prevValue === null ? null : prevValue === 0 ? 0 : (stage.value / prevValue) * 100,
      };
    }),
    directBookings,
  };
}

// ── Appointment outcomes ────────────────────────────────────────────────────

export interface OutcomeEntry {
  status: AppointmentStatus;
  label: string;
  count: number;
  percent: number;
  drillHref: string;
}

const OUTCOME_ORDER: { status: AppointmentStatus; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "pending", label: "Pending" },
  { status: "completed", label: "Completed" },
  { status: "rescheduled", label: "Rescheduled" },
  { status: "cancelled", label: "Cancelled" },
];

/**
 * Current status of the appointments *booked* during the period. Scoped to the
 * same set as the "appointments booked" KPI (new bookings only, excluding the
 * rows that reschedule/cancellation conversations create) so the two always
 * agree. Reads live appointment state, so cancelling or rescheduling elsewhere
 * moves an appointment between buckets immediately.
 */
export function getAppointmentOutcomes(dataset: Dataset, config: AppConfiguration, bounds: Bounds): { entries: OutcomeEntry[]; total: number } {
  const created = getNewBookings(dataset, config, bounds);
  const total = created.length;
  const entries = OUTCOME_ORDER.map(({ status, label }) => {
    const count = created.filter((a) => a.status === status).length;
    return {
      status,
      label,
      count,
      percent: total === 0 ? 0 : (count / total) * 100,
      drillHref: `/appointments?status=${status}`,
    };
  });
  return { entries, total };
}

// ── Channel performance ─────────────────────────────────────────────────────

export interface ChannelPerformanceEntry {
  channel: Channel;
  label: string;
  conversations: number;
  bookingRequests: number;
  bookings: number;
  /** bookings ÷ bookingRequests, as a percentage. */
  conversionRate: number;
  drillHref: string;
}

export function getChannelPerformance(dataset: Dataset, bounds: Bounds): ChannelPerformanceEntry[] {
  const convsIn = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));

  return (["voice", "sms", "email"] as Channel[]).map((channel) => {
    const own = convsIn.filter((c) => c.channel === channel);
    const requests = bookingRequests(own);
    const bookings = requests.filter((c) => c.outcome === "booked").length;
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      conversations: own.length,
      bookingRequests: requests.length,
      bookings,
      conversionRate: requests.length === 0 ? 0 : (bookings / requests.length) * 100,
      drillHref: channel === "voice" ? "/calls" : `/conversations?channel=${channel}`,
    };
  });
}

// ── Intent distribution ─────────────────────────────────────────────────────

export interface IntentEntry {
  intent: Intent;
  label: string;
  count: number;
  percent: number;
  drillHref: string;
}

export function getIntentDistribution(dataset: Dataset, bounds: Bounds): IntentEntry[] {
  const convsIn = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const total = convsIn.length;

  return (Object.keys(INTENT_LABELS) as Intent[])
    .map((intent) => {
      const count = convsIn.filter((c) => c.intent === intent).length;
      return {
        intent,
        label: INTENT_LABELS[intent],
        count,
        percent: total === 0 ? 0 : (count / total) * 100,
        drillHref: `/conversations?intent=${intent}`,
      };
    })
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ── Peak contact times ──────────────────────────────────────────────────────

export interface PeakBucket {
  key: string;
  label: string;
  count: number;
}

export interface PeakContactTimes {
  byDay: PeakBucket[];
  byHour: PeakBucket[];
  busiestDay: PeakBucket | null;
  busiestHour: PeakBucket | null;
}

/** Hour blocks wide enough to stay readable on mobile while still showing a real shape. */
const HOUR_BLOCKS: { key: string; label: string; startHour: number; endHour: number }[] = [
  { key: "early", label: "Before 9am", startHour: 0, endHour: 9 },
  { key: "morning", label: "9am–12pm", startHour: 9, endHour: 12 },
  { key: "midday", label: "12–3pm", startHour: 12, endHour: 15 },
  { key: "afternoon", label: "3–6pm", startHour: 15, endHour: 18 },
  { key: "evening", label: "After 6pm", startHour: 18, endHour: 24 },
];

/**
 * "When do customers call?" is a question about the business's own clock. Read
 * in the viewer's timezone instead, a 9am local call would be reported as 6pm to
 * a manager travelling three zones away, and the busiest-hour headline would be
 * wrong. Each timestamp is therefore projected into the business zone.
 */
export function getPeakContactTimes(dataset: Dataset, config: AppConfiguration, bounds: Bounds): PeakContactTimes {
  const convsIn = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const zone = businessZone(config);

  const dayCounts: Record<Weekday, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const blockCounts = new Array(HOUR_BLOCKS.length).fill(0);

  for (const c of convsIn) {
    const parts = getZonedParts(new Date(c.timestamp), zone);
    dayCounts[parts.weekday]++;
    const blockIndex = HOUR_BLOCKS.findIndex((b) => parts.hour >= b.startHour && parts.hour < b.endHour);
    if (blockIndex >= 0) blockCounts[blockIndex]++;
  }

  // Present Monday-first, which reads more naturally for a business week.
  const byDay: PeakBucket[] = WEEKDAYS.map((day) => ({ key: day, label: day, count: dayCounts[day] }));

  const byHour: PeakBucket[] = HOUR_BLOCKS.map((b, i) => ({ key: b.key, label: b.label, count: blockCounts[i] }));

  const peak = (list: PeakBucket[]) =>
    list.reduce<PeakBucket | null>((best, item) => (item.count > 0 && (!best || item.count > best.count) ? item : best), null);

  return { byDay, byHour, busiestDay: peak(byDay), busiestHour: peak(byHour) };
}

// ── AI receptionist impact ──────────────────────────────────────────────────

export interface ImpactMetric {
  key: string;
  label: string;
  value: number;
  description: string;
  drillHref?: string;
}

/**
 * Business outcomes that the dataset genuinely supports. Deliberately excludes
 * revenue, hours saved and ROI — none of those are derivable from this data,
 * so showing them would be fabrication.
 */
export function getReceptionistImpact(dataset: Dataset, config: AppConfiguration, bounds: Bounds): ImpactMetric[] {
  const convsIn = dataset.conversations.filter((c) => inBounds(c.timestamp, bounds));
  const callsIn = dataset.calls.filter((c) => inBounds(c.timestamp, bounds));
  const origins = buildOriginIndex(dataset);

  // Derived from the hours configured in Business Profile — editing them here
  // changes this number, rather than reading from a second hard-coded schedule.
  const afterHours = convsIn.filter((c) => isOutsideBusinessHours(config, c.timestamp));
  const questionsAnswered = convsIn.filter((c) => c.outcome === "answered");
  const escalated = convsIn.filter((c) => c.outcome === "escalated");
  const missedCalls = callsIn.filter((c) => c.outcome === "missed");
  const bookings = filterAppointments(dataset, config, bounds, "booked").filter((a) => isNewBooking(a, origins));

  return [
    {
      key: "handled",
      label: "Conversations handled",
      value: convsIn.length,
      description: "Answered without a person stepping in",
      drillHref: "/conversations",
    },
    {
      key: "booked",
      label: "Appointments booked",
      value: bookings.length,
      description: "New appointments added to the calendar",
      drillHref: "/appointments",
    },
    {
      key: "after_hours",
      label: "After-hours interactions",
      value: afterHours.length,
      description: "Handled while the business was closed",
    },
    {
      key: "questions",
      label: "Questions answered",
      value: questionsAnswered.length,
      description: "Hours, pricing and service questions resolved",
    },
    {
      key: "escalated",
      label: "Escalated to your team",
      value: escalated.length,
      description: "Flagged for a human follow-up",
    },
    {
      key: "missed",
      label: "Missed calls",
      value: missedCalls.length,
      description: "Calls that went unanswered",
      drillHref: "/calls?outcome=missed",
    },
  ];
}
