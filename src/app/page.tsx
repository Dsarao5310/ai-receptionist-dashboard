"use client";

import { useState } from "react";
import type { ActivityEvent, Conversation } from "@/types";
import { useOverviewData } from "@/features/overview/useOverviewData";
import { DateRangeControl } from "@/components/shared/DateRangeControl";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusStrip } from "@/features/overview/StatusStrip";
import { KPIGrid, KPIGridSkeleton } from "@/features/overview/KPIGrid";
import { TrendChart, TrendChartSkeleton } from "@/features/overview/TrendChart";
import { RecentActivity, RecentActivitySkeleton } from "@/features/overview/RecentActivity";
import { RecentConversations, RecentConversationsSkeleton } from "@/features/overview/RecentConversations";
import { UpcomingAppointments, UpcomingAppointmentsSkeleton } from "@/features/overview/UpcomingAppointments";
import { Gauge } from "@/components/shared/Gauge";
import { getReadiness } from "@/features/overview/readiness";
import { ConversationDrawer } from "@/features/conversations/ConversationDrawer";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { CONNECTION_STATE_STYLES } from "@/data/constants";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const { dataset, loading, error, retry, rangeKey, customBounds, setRange, stats, activity, conversations, appointments, status } =
    useOverviewData();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const readiness = getReadiness(status);

  function openActivity(event: ActivityEvent) {
    const match = dataset?.conversations.find((c) => c.id === event.conversationId) ?? null;
    if (match) setSelectedConversation(match);
  }

  if (error) {
    return (
      <div>
        <Card>
          <ErrorState title="Couldn't load your dashboard" description="We could not load this from the server. Your data is safe — try again." onRetry={retry} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        description="A snapshot of what your AI receptionist has handled."
        actions={
          loading ? (
            <Skeleton className="h-10 w-64 rounded-lg" />
          ) : (
            <DateRangeControl rangeKey={rangeKey} customBounds={customBounds} onChange={setRange} />
          )
        }
      />

      {loading ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-6">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
          </div>
        </Card>
      ) : (
        <StatusStrip status={status} />
      )}

      {/* The stat row carries the headline number now, not the chart below it —
          one solid-filled tile among six equal siblings, the way a DocTime-style
          stat row puts its loudest number in the same row as its context rather
          than in an oversized panel of its own. The chart's job shrinks to what
          only it can show: the shape of the trend, not the total again. */}
      {loading || !stats ? <KPIGridSkeleton /> : <KPIGrid kpis={stats.kpis} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {loading || !stats ? <TrendChartSkeleton /> : <TrendChart trend={stats.trend} />}

        <Card className="flex flex-col rounded-2xl card-raised">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="text-section">Receptionist readiness</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-5">
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Skeleton className="h-[130px] w-[130px] rounded-full" />
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <Gauge value={readiness.score} label="Receptionist readiness" caption={readiness.caption} showLabel={false} />
                </div>
                {/* Skipped while offline: the score is zeroed by the master
                    switch there, not by these weights, so listing individual
                    channels as "connected" next to a 0 would read as a
                    contradiction rather than an explanation. */}
                {status.overall !== "offline" && (
                  <ul className="mt-4 space-y-2 border-t border-border pt-4">
                    {readiness.breakdown.map((ch) => {
                      const style = CONNECTION_STATE_STYLES[ch.state];
                      return (
                        <li key={ch.key} className="flex items-center gap-2 text-sm">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
                          <span className="text-text-secondary">{ch.label}</span>
                          <span className="ml-auto tabular-nums text-text-muted">{ch.weight}%</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {loading ? (
          <UpcomingAppointmentsSkeleton />
        ) : (
          <UpcomingAppointments appointments={appointments} onSelect={(a) => setSelectedAppointmentId(a.id)} />
        )}
        {loading ? <RecentActivitySkeleton /> : <RecentActivity events={activity} onSelect={openActivity} />}
        {loading ? <RecentConversationsSkeleton /> : <RecentConversations conversations={conversations} onSelect={setSelectedConversation} />}
      </div>

      <ConversationDrawer
        conversation={selectedConversation}
        open={!!selectedConversation}
        onOpenChange={(v) => !v && setSelectedConversation(null)}
      />
      <AppointmentDrawer
        appointmentId={selectedAppointmentId}
        dataset={dataset}
        open={!!selectedAppointmentId}
        onOpenChange={(v) => !v && setSelectedAppointmentId(null)}
      />
    </div>
  );
}
