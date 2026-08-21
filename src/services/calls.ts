import type { Call, ConversationOutcome, Dataset, Intent } from "@/types";
import { inBounds, type Bounds } from "@/lib/date-range";
import type { PagedResult, SortDirection } from "./conversations";

export type CallSortField = "timestamp" | "customerName" | "durationSec";

export interface CallFilters {
  search?: string;
  intent?: Intent | "all";
  outcome?: ConversationOutcome | "all";
  bounds?: Bounds;
  sortBy?: CallSortField;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

export function getCalls(dataset: Dataset, filters: CallFilters = {}): PagedResult<Call> {
  let items = dataset.calls;

  if (filters.bounds) items = items.filter((c) => inBounds(c.timestamp, filters.bounds!));
  if (filters.intent && filters.intent !== "all") items = items.filter((c) => c.intent === filters.intent);
  if (filters.outcome && filters.outcome !== "all") items = items.filter((c) => c.outcome === filters.outcome);
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    items = items.filter((c) => c.customerName.toLowerCase().includes(q) || c.customerPhone.includes(q));
  }

  const sortBy = filters.sortBy ?? "timestamp";
  const sortDir = filters.sortDir ?? "desc";
  const sorted = [...items].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "timestamp") cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    else if (sortBy === "durationSec") cmp = a.durationSec - b.durationSec;
    else cmp = a.customerName.localeCompare(b.customerName);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = sorted.length;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 15;
  const start = (page - 1) * pageSize;

  return { items: sorted.slice(start, start + pageSize), total };
}
