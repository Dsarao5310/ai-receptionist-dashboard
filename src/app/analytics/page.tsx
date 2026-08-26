"use client";

import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { useSectionMotion } from "@/lib/motion";
import { useAnalyticsData } from "@/features/analytics/useAnalyticsData";
import { AnalyticsKPIs, AnalyticsKPIsSkeleton } from "@/features/analytics/AnalyticsKPIs";
import { ConversationTrendChart, ConversationTrendChartSkeleton } from "@/features/analytics/ConversationTrendChart";
import { BookingFunnel } from "@/features/analytics/BookingFunnel";
import { AppointmentOutcomes } from "@/features/analytics/AppointmentOutcomes";
import { ChannelPerformance } from "@/features/analytics/ChannelPerformance";
import { IntentDistribution } from "@/features/analytics/IntentDistribution";
import { PeakContactTimes } from "@/features/analytics/PeakContactTimes";
import { ReceptionistImpact } from "@/features/analytics/ReceptionistImpact";
import { DateRangeControl } from "@/components/shared/DateRangeControl";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AnalyticsPage() {
  const { loading, error, retry, rangeKey, customBounds, setRange, hasActivity, summary, trend, funnel, outcomes, channels, intents, peakTimes, impact } =
    useAnalyticsData();
  const { container, item } = useSectionMotion();

  if (error) {
    return (
      <div>
        <Card>
          <ErrorState title="Couldn't load analytics" description="We could not load this from the server. Your data is safe — try again." onRetry={retry} />
        </Card>
      </div>
    );
  }

  return (
    <motion.div className="space-y-4" {...container}>
      <motion.div {...item}>
        <PageHeader
          description="How your AI receptionist is performing and what it's producing."
          actions={<DateRangeControl rangeKey={rangeKey} customBounds={customBounds} onChange={setRange} />}
        />
      </motion.div>

      {loading || !summary || !peakTimes ? (
        <AnalyticsSkeleton />
      ) : !hasActivity ? (
        <motion.div {...item}>
          <Card>
            <EmptyState
              icon={BarChart3}
              title="Not enough activity yet"
              description="Analytics will appear as your AI receptionist handles customer conversations. Try selecting a longer date range."
            />
          </Card>
        </motion.div>
      ) : (
        <>
          <motion.div {...item}>
            <AnalyticsKPIs kpis={summary.kpis} basis={summary.conversionBasis} />
          </motion.div>

          <motion.div {...item}>
            <ConversationTrendChart trend={trend} />
          </motion.div>

          <motion.div {...item} className="grid gap-4 lg:grid-cols-2">
            <BookingFunnel funnel={funnel} />
            <AppointmentOutcomes entries={outcomes.entries} total={outcomes.total} />
          </motion.div>

          <motion.div {...item} className="grid gap-4 lg:grid-cols-2">
            <ChannelPerformance entries={channels} />
            <IntentDistribution entries={intents} />
          </motion.div>

          <motion.div {...item}>
            <PeakContactTimes data={peakTimes} />
          </motion.div>

          <motion.div {...item}>
            <ReceptionistImpact metrics={impact} />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function AnalyticsSkeleton() {
  return (
    <>
      <AnalyticsKPIsSkeleton />
      <ConversationTrendChartSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>
      </div>
    </>
  );
}
