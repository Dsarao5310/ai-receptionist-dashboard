"use client";

import { useMemo, useState } from "react";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { getRangeBounds, type Bounds } from "@/lib/date-range";
import { getCalls, type CallSortField } from "@/services/calls";
import type { SortDirection } from "@/services/conversations";
import type { ConversationOutcome, DateRangeKey, Intent } from "@/types";

const PAGE_SIZE = 12;

/** Initial filter values, used by Analytics drill-down links that arrive with URL params. */
export interface CallsInitialFilters {
  intent?: Intent | "all";
  outcome?: ConversationOutcome | "all";
}

export function useCallsData(initial: CallsInitialFilters = {}) {
  const { liveDataset: dataset, loading, error, retry } = useWorkspaceData();

  // Ranges are whole days on the business's calendar, not the viewer's.
  const zone = useConfiguration((s) => s.business.timezone);

  const [search, setSearchState] = useState("");
  const [intent, setIntentState] = useState<Intent | "all">(initial.intent ?? "all");
  const [outcome, setOutcomeState] = useState<ConversationOutcome | "all">(initial.outcome ?? "all");
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("90d");
  const [customBounds, setCustomBounds] = useState<Bounds | null>(null);
  const [sortBy, setSortBy] = useState<CallSortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const now = useMemo(() => (dataset ? new Date(dataset.generatedAt) : null), [dataset]);
  const bounds = useMemo(() => (now ? getRangeBounds(rangeKey, now, zone, customBounds ?? undefined) : null), [rangeKey, now, zone, customBounds]);

  const result = useMemo(() => {
    if (!dataset || !bounds) return { items: [], total: 0 };
    return getCalls(dataset, { search, intent, outcome, bounds, sortBy, sortDir, page, pageSize: PAGE_SIZE });
  }, [dataset, bounds, search, intent, outcome, sortBy, sortDir, page]);

  function setRange(key: DateRangeKey, custom?: Bounds) {
    setRangeKey(key);
    if (key === "custom" && custom) setCustomBounds(custom);
    setPage(1);
  }

  function setSearch(v: string) {
    setSearchState(v);
    setPage(1);
  }
  function setIntent(v: Intent | "all") {
    setIntentState(v);
    setPage(1);
  }
  function setOutcome(v: ConversationOutcome | "all") {
    setOutcomeState(v);
    setPage(1);
  }

  function toggleSort(field: CallSortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  return {
    dataset,
    loading,
    error,
    retry,
    search,
    setSearch,
    intent,
    setIntent,
    outcome,
    setOutcome,
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
