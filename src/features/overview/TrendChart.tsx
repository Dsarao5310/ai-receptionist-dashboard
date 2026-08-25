"use client";

import { useMemo } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * The shape of the trend — not the total again.
 *
 * The headline number used to live here too, first as a decorative panel,
 * then folded into this card's own header. Both were the same mistake at
 * different sizes: the KPI row above already states the appointments total
 * with more visual weight than a chart header ever gave it. Repeating it here
 * added nothing a plain section title doesn't say more honestly. What only
 * this card can show — the shape of the trend across the period, and how a
 * specific point compares to where it started — is what it shows now.
 *
 * The shaded band marks the most recent stretch of the period without
 * claiming to be precise — it carries no numbers of its own. Hovering a point
 * answers "what changed": the tooltip states the value at the start of the
 * period next to the value under the cursor, with the swing between them.
 */

interface TooltipPayloadEntry {
  value: number;
  name: string;
  color: string;
  dataKey: string;
}

function HoverCard({
  active,
  payload,
  label,
  startValues,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  startValues: { conversations: number; appointments: number };
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[180px] rounded-xl border border-border bg-surface-raised p-3 shadow-xl">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <div className="mt-2 space-y-2">
        {payload.map((p) => {
          const start = startValues[p.dataKey as keyof typeof startValues] ?? 0;
          const swing = start === 0 ? null : Math.round(((p.value - start) / start) * 100);
          return (
            <div key={p.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold tabular-nums text-text-primary">{p.value}</span>
                {swing !== null && (
                  <span className={cn("text-[11px] font-medium tabular-nums", swing >= 0 ? "text-success" : "text-danger")}>
                    {swing >= 0 ? "+" : ""}
                    {swing}%
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const conversationTotal = trend.reduce((sum, point) => sum + point.conversations, 0);
  const appointmentTotal = trend.reduce((sum, point) => sum + point.appointments, 0);
  const hasActivity = conversationTotal > 0 || appointmentTotal > 0;

  const startValues = useMemo(
    () => ({
      conversations: trend[0]?.conversations ?? 0,
      appointments: trend[0]?.appointments ?? 0,
    }),
    [trend]
  );

  // The shaded band marks roughly the final quarter of the period — the
  // "recent window" — without claiming to be a precise boundary.
  const bandStart =
    trend.length >= 4 ? trend[Math.max(trend.length - Math.ceil(trend.length / 4) - 1, 0)]?.label : null;
  const bandEnd = trend[trend.length - 1]?.label ?? null;

  return (
    <Card className="overflow-hidden rounded-2xl card-raised">
      <CardHeader className="flex-col items-start gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-section font-semibold text-text-primary">Receptionist activity</h3>
          <p className="mt-1 text-xs text-text-muted">Conversations handled vs. appointments booked</p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-2 rounded-lg border border-border bg-surface-sunken/60 px-2.5 py-1.5 text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-accent" /> Conversations
            <strong className="font-semibold tabular-nums text-text-primary">{conversationTotal}</strong>
          </span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-surface-sunken/60 px-2.5 py-1.5 text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-success" /> Appointments
            <strong className="font-semibold tabular-nums text-text-primary">{appointmentTotal}</strong>
          </span>
        </div>
      </CardHeader>

      <CardContent className="border-t border-border bg-surface-sunken/15 p-4">
        {!hasActivity ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-text-muted">
              <ChartNoAxesCombined className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text-primary">No activity in this period</p>
            <p className="mt-1 text-xs text-text-muted">Select a longer range to see conversations and bookings over time.</p>
          </div>
        ) : (
          <div className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  {/* Quieter fill than the first pass — thin, confident lines
                      carrying the shape, with the gradient underneath as a
                      hint of volume rather than the loudest thing in the
                      card. */}
                  <linearGradient id="conversationsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="appointmentsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                {bandStart && bandEnd && bandStart !== bandEnd && (
                  <ReferenceArea x1={bandStart} x2={bandEnd} fill="var(--color-accent)" fillOpacity={0.05} ifOverflow="visible" />
                )}
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
                <Tooltip
                  content={(props) => (
                    <HoverCard
                      active={props.active}
                      payload={props.payload as unknown as TooltipPayloadEntry[]}
                      label={props.label}
                      startValues={startValues}
                    />
                  )}
                  cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="conversations"
                  name="Conversations"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#conversationsFill)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
                />
                <Area
                  type="monotone"
                  dataKey="appointments"
                  name="Appointments"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  fill="url(#appointmentsFill)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TrendChartSkeleton() {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex-col items-start gap-2 p-5 pb-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="border-t border-border p-4">
        <Skeleton className="h-64 w-full sm:h-72" />
      </CardContent>
    </Card>
  );
}
