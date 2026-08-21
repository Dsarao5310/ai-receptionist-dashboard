"use client";

import { useMemo, useState } from "react";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { getAppointmentRangeBounds, type Bounds } from "@/lib/date-range";
import { getAppointments, type AppointmentSortField } from "@/services/appointments";
import type { SortDirection } from "@/services/conversations";
import type { AppointmentSource, AppointmentStatus, DateRangeKey } from "@/types";

const PAGE_SIZE = 12;

/** Initial filter values, used by Analytics drill-down links that arrive with URL params. */
export interface AppointmentsInitialFilters {
  status?: AppointmentStatus | "all";
  source?: AppointmentSource | "all";
}

export function useAppointmentsData(initial: AppointmentsInitialFilters = {}) {
  const { liveDataset: dataset, loading, error, retry } = useWorkspaceData();
  // Appointment dates and times are wall-clock values in the business timezone,
  // so every comparison here needs the configuration to resolve them.
  const config = useConfiguration();

  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<AppointmentStatus | "all">(initial.status ?? "all");
  const [source, setSourceState] = useState<AppointmentSource | "all">(initial.source ?? "all");
  const zone = config.business.timezone;

  const [rangeKey, setRangeKey] = useState<DateRangeKey>("90d");
  const [customBounds, setCustomBounds] = useState<Bounds | null>(null);
  const [sortBy, setSortBy] = useState<AppointmentSortField>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const now = useMemo(() => (dataset ? new Date(dataset.generatedAt) : null), [dataset]);
  const bounds = useMemo(
    () => (now ? getAppointmentRangeBounds(rangeKey, now, zone, customBounds ?? undefined) : null),
    [rangeKey, now, zone, customBounds]
  );

  const result = useMemo(() => {
    if (!dataset || !bounds) return { items: [], total: 0 };
    return getAppointments(dataset, config, { search, status, source, bounds, sortBy, sortDir, page, pageSize: PAGE_SIZE });
  }, [dataset, config, bounds, search, status, source, sortBy, sortDir, page]);

  /** Search/status/source filtered, but not date-range-bounded or paginated — for the calendar view, which navigates dates on its own. */
  const allFiltered = useMemo(() => {
    if (!dataset) return [];
    return getAppointments(dataset, config, { search, status, source, sortBy: "date", sortDir: "asc", page: 1, pageSize: Number.MAX_SAFE_INTEGER })
      .items;
  }, [dataset, config, search, status, source]);

  function setRange(key: DateRangeKey, custom?: Bounds) {
    setRangeKey(key);
    if (key === "custom" && custom) setCustomBounds(custom);
    setPage(1);
  }
  function setSearch(v: string) {
    setSearchState(v);
    setPage(1);
  }
  function setStatus(v: AppointmentStatus | "all") {
    setStatusState(v);
    setPage(1);
  }
  function setSource(v: AppointmentSource | "all") {
    setSourceState(v);
    setPage(1);
  }
  function toggleSort(field: AppointmentSortField) {
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
    status,
    setStatus,
    source,
    setSource,
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
    allFiltered,
    now,
  };
}
