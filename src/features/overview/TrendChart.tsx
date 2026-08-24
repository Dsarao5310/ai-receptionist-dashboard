"use client";

import { ChartNoAxesCombined } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-sm text-text-primary">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const conversationTotal = trend.reduce((sum, point) => sum + point.conversations, 0);
  const appointmentTotal = trend.reduce((sum, point) => sum + point.appointments, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-col items-start gap-3 p-4 sm:flex-row sm:items-center md:p-5">
        <div>
          <CardTitle>Receptionist activity</CardTitle>
          <p className="mt-1 text-xs text-text-muted">Conversations handled vs. appointments booked</p>
        </div>
        <div className="flex items-center gap-2 text-xs sm:ml-auto">
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
        {conversationTotal === 0 && appointmentTotal === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-text-muted">
              <ChartNoAxesCombined className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text-primary">No activity in this period</p>
            <p className="mt-1 text-xs text-text-muted">Select a longer range to see conversations and bookings over time.</p>
          </div>
        ) : (
        <div className="h-52 w-full sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="conversationsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="appointmentsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} width={32} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="conversations"
                name="Conversations"
                stroke="var(--color-accent)"
                strokeWidth={2.5}
                fill="url(#conversationsFill)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              />
              <Area
                type="monotone"
                dataKey="appointments"
                name="Appointments"
                stroke="var(--color-success)"
                strokeWidth={2.5}
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
    <Card>
      <CardHeader>
        <div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 mt-2" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <Skeleton className="h-52 w-full sm:h-56" />
      </CardContent>
    </Card>
  );
}
