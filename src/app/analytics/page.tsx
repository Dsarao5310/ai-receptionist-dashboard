"use client";

import { BarChart3 } from "lucide-react";
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
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AnalyticsPage() {
  const { loading, error, retry, rangeKey, customBounds, setRange, hasActivity, summary, trend, funnel, outcomes, channels, intents, peakTimes, impact } =
    useAnalyticsData();

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Performance</h2>
          <p className="mt-0.5 text-xs text-text-muted">How your AI receptionist is performing and what it&apos;s producing</p>
        </div>
        <DateRangeControl rangeKey={rangeKey} customBounds={customBounds} onChange={setRange} />
      </div>

      {loading || !summary || !peakTimes ? (
        <AnalyticsSkeleton />
      ) : !hasActivity ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Not enough activity yet"
            description="Analytics will appear as your AI receptionist handles customer conversations. Try selecting a longer date range."
          />
        </Card>
      ) : (
        <>
          <AnalyticsKPIs kpis={summary.kpis} basis={summary.conversionBasis} />

          <ConversationTrendChart trend={trend} />

          <div className="grid gap-4 lg:grid-cols-2">
            <BookingFunnel funnel={funnel} />
            <AppointmentOutcomes entries={outcomes.entries} total={outcomes.total} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChannelPerformance entries={channels} />
            <IntentDistribution entries={intents} />
          </div>

          <PeakContactTimes data={peakTimes} />

          <ReceptionistImpact metrics={impact} />
        </>
      )}
    </div>
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
