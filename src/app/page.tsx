"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ActivityEvent, Conversation } from "@/types";
import { useOverviewData } from "@/features/overview/useOverviewData";
import { useSectionMotion } from "@/lib/motion";
import { DateRangeControl } from "@/components/shared/DateRangeControl";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusStrip } from "@/features/overview/StatusStrip";
import { PeriodSummary, PeriodSummarySkeleton } from "@/features/overview/PeriodSummary";
import { KPIGrid, KPIGridSkeleton } from "@/features/overview/KPIGrid";
import { TrendChart, TrendChartSkeleton } from "@/features/overview/TrendChart";
import { RecentActivity, RecentActivitySkeleton } from "@/features/overview/RecentActivity";
import { RecentConversations, RecentConversationsSkeleton } from "@/features/overview/RecentConversations";
import { UpcomingAppointments, UpcomingAppointmentsSkeleton } from "@/features/overview/UpcomingAppointments";
import { TopServices, TopServicesSkeleton } from "@/features/overview/TopServices";
import { getReadiness } from "@/features/overview/readiness";
import { ConversationDrawer } from "@/features/conversations/ConversationDrawer";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export default function OverviewPage() {
  const { dataset, loading, error, retry, rangeKey, customBounds, setRange, stats, activity, conversations, appointments, topServices, status } =
    useOverviewData();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const readiness = getReadiness(status);
  const { container, item } = useSectionMotion();

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
    <motion.div className="space-y-4" {...container}>
      <motion.div {...item}>
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
      </motion.div>

      <motion.div {...item}>
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
      </motion.div>

      {/* StatusStrip above answers "is it connected"; this answers "did it
          work, and what needs me" in one sentence — the thing a business
          owner actually wants before they scan six tiles and a chart. */}
      <motion.div {...item}>
        {loading || !stats ? (
          <PeriodSummarySkeleton />
        ) : (
          <PeriodSummary stats={stats} rangeKey={rangeKey} breakdown={readiness} />
        )}
      </motion.div>

      {/* The stat row carries the headline number now, not the chart below it —
          one solid-filled tile among six equal siblings, the way a DocTime-style
          stat row puts its loudest number in the same row as its context rather
          than in an oversized panel of its own. The chart's job shrinks to what
          only it can show: the shape of the trend, not the total again. */}
      <motion.div {...item}>{loading || !stats ? <KPIGridSkeleton /> : <KPIGrid kpis={stats.kpis} />}</motion.div>

      <motion.div {...item} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {loading || !stats ? <TrendChartSkeleton /> : <TrendChart trend={stats.trend} />}
        {loading || !topServices ? <TopServicesSkeleton /> : <TopServices data={topServices} />}
      </motion.div>

      <motion.div {...item} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {loading ? (
          <UpcomingAppointmentsSkeleton />
        ) : (
          <UpcomingAppointments appointments={appointments} onSelect={(a) => setSelectedAppointmentId(a.id)} />
        )}
        {loading ? <RecentActivitySkeleton /> : <RecentActivity events={activity} onSelect={openActivity} />}
        {loading ? <RecentConversationsSkeleton /> : <RecentConversations conversations={conversations} onSelect={setSelectedConversation} />}
      </motion.div>

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
    </motion.div>
  );
}
