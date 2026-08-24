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
import { ConversationDrawer } from "@/features/conversations/ConversationDrawer";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export default function OverviewPage() {
  const { dataset, loading, error, retry, rangeKey, customBounds, setRange, stats, activity, conversations, appointments, status } =
    useOverviewData();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

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

      {loading || !stats ? <KPIGridSkeleton /> : <KPIGrid kpis={stats.kpis} />}

      {/* The trend used to run full-width with the three lists in a row beneath
          it, which left the lower half of a desktop viewport empty. Pairing the
          chart with what is coming up next fills the row and puts the two
          things you actually act on — the trend and today's diary — side by
          side. The remaining two lists split the row below. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading || !stats ? <TrendChartSkeleton /> : <TrendChart trend={stats.trend} />}
        </div>
        {loading ? (
          <UpcomingAppointmentsSkeleton />
        ) : (
          <UpcomingAppointments appointments={appointments} onSelect={(a) => setSelectedAppointmentId(a.id)} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
