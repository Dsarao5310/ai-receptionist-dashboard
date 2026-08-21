"use client";

import { useMemo, useState } from "react";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { getCustomers, type CustomerFilters, type CustomerSortField, type CustomerStatus } from "@/services/customers";
import type { SortDirection } from "@/services/conversations";
import type { Channel } from "@/types";

const PAGE_SIZE = 12;

export function useCustomersData() {
  const { liveDataset: dataset, loading, error, retry } = useWorkspaceData();
  // Upcoming-vs-past depends on appointment instants, which are wall-clock values
  // in the business timezone.
  const config = useConfiguration();

  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<CustomerStatus | "all">("all");
  const [channel, setChannelState] = useState<Channel | "all">("all");
  const [sortBy, setSortBy] = useState<CustomerSortField>("lastInteraction");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const now = useMemo(() => (dataset ? new Date(dataset.generatedAt) : null), [dataset]);

  const result = useMemo(() => {
    if (!dataset || !now) return { items: [], total: 0 };
    const filters: CustomerFilters = { search, status, channel, sortBy, sortDir, page, pageSize: PAGE_SIZE };
    return getCustomers(dataset, config, now, filters);
  }, [dataset, config, now, search, status, channel, sortBy, sortDir, page]);

  function setSearch(v: string) {
    setSearchState(v);
    setPage(1);
  }
  function setStatus(v: CustomerStatus | "all") {
    setStatusState(v);
    setPage(1);
  }
  function setChannel(v: Channel | "all") {
    setChannelState(v);
    setPage(1);
  }
  function toggleSort(field: CustomerSortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  return {
    dataset,
    now,
    loading,
    error,
    retry,
    search,
    setSearch,
    status,
    setStatus,
    channel,
    setChannel,
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
