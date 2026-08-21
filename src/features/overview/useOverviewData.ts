"use client";

import { useMemo, useState } from "react";
import { useWorkspaceData } from "@/lib/workspace-data";
import { useConfiguration } from "@/lib/store/configuration";
import { getRangeBounds, type Bounds } from "@/lib/date-range";
import { getDashboardStats, getRecentActivity, getRecentConversations, getUpcomingAppointments } from "@/services/dashboard";
import { getReceptionistStatus } from "@/services/ai-receptionist";
import { useIntegrations } from "@/lib/store/integrations";
import type { DateRangeKey } from "@/types";

export function useOverviewData() {
  const { liveDataset, loading, error, retry } = useWorkspaceData();
  // Status comes from the shared AI configuration, so turning the receptionist
  // off (or disabling a channel) is reflected on the Overview immediately.
  const config = useConfiguration();
  const zone = config.business.timezone;

  // Channel status is derived from the provider integrations for this
  // workspace, so a calendar outage shows up here without a second copy of
  // "calendar connected" to maintain.
  const capabilities = useIntegrations((s) => s.capabilities);

  const [rangeKey, setRangeKey] = useState<DateRangeKey>("7d");
  const [customBounds, setCustomBounds] = useState<Bounds | null>(null);

  const now = useMemo(() => (liveDataset ? new Date(liveDataset.generatedAt) : null), [liveDataset]);
  const bounds = useMemo(() => (now ? getRangeBounds(rangeKey, now, zone, customBounds ?? undefined) : null), [rangeKey, now, zone, customBounds]);

  const stats = useMemo(() => (liveDataset && bounds ? getDashboardStats(liveDataset, bounds, zone) : null), [liveDataset, bounds, zone]);
  const activity = useMemo(() => (liveDataset ? getRecentActivity(liveDataset, 8) : []), [liveDataset]);
  const conversations = useMemo(() => (liveDataset ? getRecentConversations(liveDataset, 6) : []), [liveDataset]);
  const appointments = useMemo(() => (liveDataset && now ? getUpcomingAppointments(liveDataset, config, now, 6) : []), [liveDataset, config, now]);
  const status = useMemo(
    () => getReceptionistStatus(config, capabilities),
    [config, capabilities]
  );

  function setRange(key: DateRangeKey, custom?: Bounds) {
    setRangeKey(key);
    if (key === "custom" && custom) setCustomBounds(custom);
  }

  return {
    dataset: liveDataset,
    loading,
    error,
    retry,
    rangeKey,
    customBounds,
    setRange,
    stats,
    activity,
    conversations,
    appointments,
    status,
  };
}
