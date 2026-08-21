import type { ActivityEvent, AppConfiguration, Appointment, Call, Channel, Conversation, Customer, Dataset } from "@/types";
import { appointmentInstant } from "./business";
import type { PagedResult, SortDirection } from "./conversations";

export type CustomerStatus = "new" | "active" | "inactive";
export type CustomerSortField = "name" | "lastInteraction" | "totalAppointments";

export interface CustomerListItem extends Customer {
  status: CustomerStatus;
  upcomingAppointment: Appointment | null;
}

export interface CustomerFilters {
  search?: string;
  status?: CustomerStatus | "all";
  channel?: Channel | "all";
  sortBy?: CustomerSortField;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

const ACTIVE_WINDOW_DAYS = 60;
const NEW_WINDOW_DAYS = 21;
const MS_PER_DAY = 86_400_000;

/** A customer created recently counts as "new" regardless of activity; otherwise status tracks interaction recency. */
export function getCustomerStatus(customer: Customer, now: Date): CustomerStatus {
  const createdDays = (now.getTime() - new Date(customer.createdAt).getTime()) / MS_PER_DAY;
  if (createdDays <= NEW_WINDOW_DAYS) return "new";
  const lastDays = (now.getTime() - new Date(customer.lastInteraction).getTime()) / MS_PER_DAY;
  return lastDays <= ACTIVE_WINDOW_DAYS ? "active" : "inactive";
}

/**
 * Appointment-derived fields are recomputed from the live appointments array on every read
 * rather than trusting the values baked into the customer record, which go stale the moment
 * an appointment is rescheduled or cancelled elsewhere in the app.
 */
function toListItem(dataset: Dataset, config: AppConfiguration, customer: Customer, now: Date): CustomerListItem {
  const own = dataset.appointments.filter((a) => a.customerId === customer.id);
  const instantOf = (a: Appointment) => appointmentInstant(config, a);
  const upcomingAppointment =
    own
      .filter((a) => a.status !== "cancelled" && instantOf(a) >= now)
      .sort((a, b) => instantOf(a).getTime() - instantOf(b).getTime())[0] ?? null;

  return {
    ...customer,
    totalAppointments: own.length,
    upcomingAppointmentId: upcomingAppointment?.id,
    status: getCustomerStatus(customer, now),
    upcomingAppointment,
  };
}

function normalizePhone(v: string) {
  return v.replace(/\D/g, "");
}

/** Filtered, sorted, and paginated customers — the future real-API version would take the same filters and return a Promise. */
export function getCustomers(dataset: Dataset, config: AppConfiguration, now: Date, filters: CustomerFilters = {}): PagedResult<CustomerListItem> {
  let items: CustomerListItem[] = dataset.customers.map((c) => toListItem(dataset, config, c, now));

  if (filters.status && filters.status !== "all") items = items.filter((c) => c.status === filters.status);
  if (filters.channel && filters.channel !== "all") items = items.filter((c) => c.lastChannel === filters.channel);
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    const qDigits = normalizePhone(q);
    items = items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (qDigits.length > 0 && normalizePhone(c.phone).includes(qDigits))
    );
  }

  const sortBy = filters.sortBy ?? "lastInteraction";
  const sortDir = filters.sortDir ?? "desc";
  const sorted = [...items].sort((a, b) => {
    const cmp =
      sortBy === "name"
        ? a.name.localeCompare(b.name)
        : sortBy === "totalAppointments"
          ? a.totalAppointments - b.totalAppointments
          : new Date(a.lastInteraction).getTime() - new Date(b.lastInteraction).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = sorted.length;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 15;
  const start = (page - 1) * pageSize;

  return { items: sorted.slice(start, start + pageSize), total };
}

export interface CustomerDetail {
  customer: Customer;
  status: CustomerStatus;
  appointments: Appointment[];
  upcomingAppointments: Appointment[];
  pastAppointments: Appointment[];
  cancelledAppointments: Appointment[];
  conversations: Conversation[];
  calls: Call[];
  timeline: ActivityEvent[];
  channelCounts: Record<Channel, number>;
}

/** Everything needed to render a customer's detail view, derived entirely from the shared dataset — no separate copy of customer state. */
export function getCustomerDetail(dataset: Dataset, config: AppConfiguration, customerId: string, now: Date): CustomerDetail | null {
  const customer = dataset.customers.find((c) => c.id === customerId);
  if (!customer) return null;
  const instantOf = (a: Appointment) => appointmentInstant(config, a);

  const appointments = dataset.appointments
    .filter((a) => a.customerId === customerId)
    .sort((a, b) => instantOf(b).getTime() - instantOf(a).getTime());

  const cancelledAppointments = appointments.filter((a) => a.status === "cancelled");
  const upcomingAppointments = appointments.filter((a) => a.status !== "cancelled" && instantOf(a) >= now);
  const pastAppointments = appointments.filter((a) => a.status !== "cancelled" && instantOf(a) < now);

  // Conversations/calls/activityEvents are already sorted desc-by-time at the dataset level; filtering preserves that order.
  const conversations = dataset.conversations.filter((c) => c.customerId === customerId);
  const calls = dataset.calls.filter((c) => c.customerId === customerId);
  const timeline = dataset.activityEvents.filter((e) => e.customerId === customerId);

  const channelCounts: Record<Channel, number> = { voice: 0, sms: 0, email: 0 };
  for (const c of conversations) channelCounts[c.channel]++;

  return {
    customer,
    status: getCustomerStatus(customer, now),
    appointments,
    upcomingAppointments,
    pastAppointments,
    cancelledAppointments,
    conversations,
    calls,
    timeline,
    channelCounts,
  };
}
