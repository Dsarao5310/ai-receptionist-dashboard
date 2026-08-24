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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export default function OverviewPage() {
  const { dataset, loading, error, retry, rangeKey, customBounds, setRange, stats, activity, conversations, appointments, status } =
    useOverviewData();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  // The chart carries this number directly in its own header, so it is not
  // repeated as a separate tile in the grid below.
  const HERO_KEY = "appointments_booked";
  const heroKpi = stats?.kpis.find((k) => k.key === HERO_KEY);
  const secondaryKpis = stats?.kpis.filter((k) => k.key !== HERO_KEY) ?? [];

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
    <div className="space-y-5">
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

      {/* The chart carries the headline number itself, so this row is one real
          analytical surface next to one compact score, rather than a decorative
          panel next to an unrelated dial. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {loading || !stats ? <TrendChartSkeleton /> : <TrendChart trend={stats.trend} headline={heroKpi} />}

        <Card className="flex flex-col rounded-2xl card-raised">
          <CardHeader className="flex-col items-start gap-1 p-5 pb-0">
            <CardTitle className="text-section">Receptionist readiness</CardTitle>
            <CardDescription>How ready your channels are to do the job right now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 items-center justify-center p-5">
            {loading ? (
              <Skeleton className="h-[130px] w-[130px] rounded-full" />
            ) : (
              <Gauge value={readiness.score} label="Receptionist readiness" caption={readiness.caption} showLabel={false} />
            )}
          </CardContent>
        </Card>
      </div>

      {loading || !stats ? <KPIGridSkeleton /> : <KPIGrid kpis={secondaryKpis} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
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
