"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsTrendPoint } from "@/services/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

type ChannelView = "all" | "voice" | "sms" | "email";

/**
 * Fixed series colors rather than the user's accent — the accent is
 * configurable and could collide with another series.
 */
const SERIES: { key: "voice" | "sms" | "email"; label: string; color: string }[] = [
  { key: "voice", label: "Voice", color: "var(--color-info)" },
  { key: "sms", label: "SMS", color: "var(--color-success)" },
  { key: "email", label: "Email", color: "var(--color-warning)" },
];

const VIEW_OPTIONS: { key: ChannelView; label: string }[] = [
  { key: "all", label: "All channels" },
  { key: "voice", label: "Voice" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; payload: AnalyticsTrendPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload[0].payload.total;
  const showTotal = payload.length > 1;

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-sm text-text-primary">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-semibold tabular-nums">{p.value}</span>
        </p>
      ))}
      {showTotal && (
        <p className="mt-1 border-t border-border pt-1 flex items-center gap-1.5 text-xs text-text-muted">
          Total<span className="ml-auto pl-3 font-semibold tabular-nums text-text-primary">{total}</span>
        </p>
      )}
    </div>
  );
}

export function ConversationTrendChart({ trend }: { trend: AnalyticsTrendPoint[] }) {
  const [view, setView] = useState<ChannelView>("all");
  const visible = view === "all" ? SERIES : SERIES.filter((s) => s.key === view);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-col items-start gap-3 p-4 sm:flex-row sm:items-center md:p-5">
        <div>
          <CardTitle>Conversation volume</CardTitle>
          <p className="mt-1 text-xs text-text-muted">Interactions handled over time, by channel</p>
        </div>
        <div
          className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-sunken p-1 sm:ml-auto"
          role="group"
          aria-label="Filter chart by channel"
        >
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setView(opt.key)}
              aria-pressed={view === opt.key}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                view === opt.key ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="border-t border-border bg-surface-sunken/15 p-4">
        <div className="h-52 w-full sm:h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                {SERIES.map((series) => (
                  <linearGradient key={series.key} id={`analytics-${series.key}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={series.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={series.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                width={32}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} />
              {visible.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2.5}
                  fill={`url(#analytics-${s.key}-fill)`}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          {visible.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ConversationTrendChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 mt-2" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <Skeleton className="h-52 w-full sm:h-60" />
      </CardContent>
    </Card>
  );
}
