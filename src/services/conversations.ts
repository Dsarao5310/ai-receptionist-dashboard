import type { Channel, Conversation, ConversationOutcome, Dataset, Intent } from "@/types";
import { inBounds, type Bounds } from "@/lib/date-range";

export type BookingStatusFilter = "all" | "booked" | "not_booked";
export type SortField = "timestamp" | "customerName";
export type SortDirection = "asc" | "desc";

export interface ConversationFilters {
  search?: string;
  channel?: Channel | "all";
  intent?: Intent | "all";
  outcome?: ConversationOutcome | "all";
  bookingStatus?: BookingStatusFilter;
  bounds?: Bounds;
  sortBy?: SortField;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
}

/** Filtered, sorted, and paginated conversations — the future real-API version would take the same filters and return a Promise. */
export function getConversations(dataset: Dataset, filters: ConversationFilters = {}): PagedResult<Conversation> {
  let items = dataset.conversations;

  if (filters.bounds) items = items.filter((c) => inBounds(c.timestamp, filters.bounds!));
  if (filters.channel && filters.channel !== "all") items = items.filter((c) => c.channel === filters.channel);
  if (filters.intent && filters.intent !== "all") items = items.filter((c) => c.intent === filters.intent);
  if (filters.outcome && filters.outcome !== "all") items = items.filter((c) => c.outcome === filters.outcome);
  if (filters.bookingStatus && filters.bookingStatus !== "all") {
    items = items.filter((c) => (filters.bookingStatus === "booked" ? !!c.appointmentId : !c.appointmentId));
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    items = items.filter((c) => c.customerName.toLowerCase().includes(q));
  }

  const sortBy = filters.sortBy ?? "timestamp";
  const sortDir = filters.sortDir ?? "desc";
  const sorted = [...items].sort((a, b) => {
    const cmp =
      sortBy === "timestamp"
        ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        : a.customerName.localeCompare(b.customerName);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = sorted.length;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 15;
  const start = (page - 1) * pageSize;

  return { items: sorted.slice(start, start + pageSize), total };
}
