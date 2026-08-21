"use client";

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
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1 sm:flex-row sm:items-center">
        <div>
          <CardTitle>Receptionist activity</CardTitle>
          <p className="mt-1 text-xs text-text-muted">Conversations handled vs. appointments booked</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-secondary sm:ml-auto">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> Conversations
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" /> Appointments
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
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
                strokeWidth={2}
                fill="url(#conversationsFill)"
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="appointments"
                name="Appointments"
                stroke="var(--color-success)"
                strokeWidth={2}
                fill="url(#appointmentsFill)"
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  );
}
