"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { useSettings, type TimestampStyle } from "@/lib/store/settings";
import type { DateRangeKey } from "@/types";

/**
 * Where the dashboard starts and how it reads. Single choices, saved on change.
 *
 * Density is not repeated here — it belongs to Appearance, and having it in two
 * places would mean two controls fighting over one value.
 */

const LANDING_PAGES = [
  { value: "/", label: "Overview" },
  { value: "/conversations", label: "Conversations" },
  { value: "/appointments", label: "Appointments" },
  { value: "/customers", label: "Customers" },
  { value: "/analytics", label: "Analytics" },
];

const RANGES: { value: DateRangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const TIMESTAMPS: { value: TimestampStyle; label: string }[] = [
  { value: "relative", label: "Relative — 2 hr ago" },
  { value: "exact", label: "Exact — Aug 17, 4:54 PM" },
];

export function DashboardSettings() {
  const { dashboard, setDashboard } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
        <CardDescription>Defaults for how the dashboard opens. Saved as you change them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="landing-page">Opening page</Label>
          <Select value={dashboard.landingPage} onValueChange={(v) => setDashboard({ landingPage: v })}>
            <SelectTrigger id="landing-page" aria-label="Opening page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANDING_PAGES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="default-range">Default date range</Label>
          <Select
            value={dashboard.defaultRange}
            onValueChange={(v) => setDashboard({ defaultRange: v as DateRangeKey })}
          >
            <SelectTrigger id="default-range" aria-label="Default date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-text-muted">Ranges are whole days on your business timezone.</p>
        </div>

        <div>
          <Label htmlFor="timestamp-style">Timestamps</Label>
          <Select
            value={dashboard.timestampStyle}
            onValueChange={(v) => setDashboard({ timestampStyle: v as TimestampStyle })}
          >
            <SelectTrigger id="timestamp-style" aria-label="Timestamp style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMESTAMPS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
