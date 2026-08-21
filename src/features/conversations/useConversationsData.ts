"use client";

import { useMemo, useState } from "react";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { getRangeBounds, type Bounds } from "@/lib/date-range";
import { getConversations, type BookingStatusFilter, type SortDirection, type SortField } from "@/services/conversations";
import type { Channel, ConversationOutcome, DateRangeKey, Intent } from "@/types";

const PAGE_SIZE = 12;

/** Initial filter values, used by Analytics drill-down links that arrive with URL params. */
export interface ConversationsInitialFilters {
  channel?: Channel | "all";
  intent?: Intent | "all";
  outcome?: ConversationOutcome | "all";
}

export function useConversationsData(initial: ConversationsInitialFilters = {}) {
  const { liveDataset: dataset, loading, error, retry } = useWorkspaceData();

  // Ranges are whole days on the business's calendar, not the viewer's.
  const zone = useConfiguration((s) => s.business.timezone);

  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<Channel | "all">(initial.channel ?? "all");
  const [intent, setIntent] = useState<Intent | "all">(initial.intent ?? "all");
  const [outcome, setOutcome] = useState<ConversationOutcome | "all">(initial.outcome ?? "all");
  const [bookingStatus, setBookingStatus] = useState<BookingStatusFilter>("all");
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("90d");
  const [customBounds, setCustomBounds] = useState<Bounds | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const now = useMemo(() => (dataset ? new Date(dataset.generatedAt) : null), [dataset]);
  const bounds = useMemo(() => (now ? getRangeBounds(rangeKey, now, zone, customBounds ?? undefined) : null), [rangeKey, now, zone, customBounds]);

  const result = useMemo(() => {
    if (!dataset || !bounds) return { items: [], total: 0 };
    return getConversations(dataset, {
      search,
      channel,
      intent,
      outcome,
      bookingStatus,
      bounds,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    });
  }, [dataset, bounds, search, channel, intent, outcome, bookingStatus, sortBy, sortDir, page]);

  function setRange(key: DateRangeKey, custom?: Bounds) {
    setRangeKey(key);
    if (key === "custom" && custom) setCustomBounds(custom);
    setPage(1);
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function resetToPage1<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return {
    loading,
    error,
    retry,
    search,
    setSearch: resetToPage1(setSearch),
    channel,
    setChannel: resetToPage1(setChannel),
    intent,
    setIntent: resetToPage1(setIntent),
    outcome,
    setOutcome: resetToPage1(setOutcome),
    bookingStatus,
    setBookingStatus: resetToPage1(setBookingStatus),
    rangeKey,
    customBounds,
    setRange,
    sortBy,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    items: result.items,
    total: result.total,
  };
}
