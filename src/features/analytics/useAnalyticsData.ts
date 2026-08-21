"use client";

import { useMemo, useState } from "react";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { getRangeBounds, type Bounds } from "@/lib/date-range";
import {
  getAnalyticsSummary,
  getAppointmentOutcomes,
  getBookingFunnel,
  getChannelPerformance,
  getConversationTrend,
  getIntentDistribution,
  getPeakContactTimes,
  getReceptionistImpact,
} from "@/services/analytics";
import type { DateRangeKey } from "@/types";

/**
 * Each selector memoizes on [dataset, bounds] independently, so changing the
 * channel toggle on the trend chart never re-runs the funnel or peak-time maths.
 */
export function useAnalyticsData() {
  const { liveDataset: dataset, loading, error, retry } = useWorkspaceData();
  // After-hours activity depends on the configured opening hours, so this page
  // re-derives when Business Profile changes them.
  const config = useConfiguration();

  const zone = config.business.timezone;

  const [rangeKey, setRangeKey] = useState<DateRangeKey>("30d");
  const [customBounds, setCustomBounds] = useState<Bounds | null>(null);

  const now = useMemo(() => (dataset ? new Date(dataset.generatedAt) : null), [dataset]);
  const bounds = useMemo(
    () => (now ? getRangeBounds(rangeKey, now, zone, customBounds ?? undefined) : null),
    [rangeKey, now, zone, customBounds]
  );

  const ready = !!dataset && !!bounds;

  const summary = useMemo(() => (ready ? getAnalyticsSummary(dataset, config, bounds) : null), [ready, dataset, config, bounds]);
  const trend = useMemo(() => (ready ? getConversationTrend(dataset, config, bounds) : []), [ready, dataset, config, bounds]);
  const funnel = useMemo(
    () => (ready ? getBookingFunnel(dataset, config, bounds) : { stages: [], directBookings: 0 }),
    [ready, dataset, config, bounds]
  );
  const outcomes = useMemo(
    () => (ready ? getAppointmentOutcomes(dataset, config, bounds) : { entries: [], total: 0 }),
    [ready, dataset, config, bounds]
  );
  const channels = useMemo(() => (ready ? getChannelPerformance(dataset, bounds) : []), [ready, dataset, bounds]);
  const intents = useMemo(() => (ready ? getIntentDistribution(dataset, bounds) : []), [ready, dataset, bounds]);
  const peakTimes = useMemo(() => (ready ? getPeakContactTimes(dataset, config, bounds) : null), [ready, dataset, config, bounds]);
  const impact = useMemo(() => (ready ? getReceptionistImpact(dataset, config, bounds) : []), [ready, dataset, config, bounds]);

  /** Drives the empty state — a zero-filled set of charts communicates far less than saying so plainly. */
  const hasActivity = useMemo(
    () => trend.some((t) => t.total > 0) || outcomes.total > 0,
    [trend, outcomes.total]
  );

  function setRange(key: DateRangeKey, custom?: Bounds) {
    setRangeKey(key);
    if (key === "custom" && custom) setCustomBounds(custom);
  }

  return {
    loading,
    error,
    retry,
    rangeKey,
    customBounds,
    setRange,
    bounds,
    hasActivity,
    summary,
    trend,
    funnel,
    outcomes,
    channels,
    intents,
    peakTimes,
    impact,
  };
}
