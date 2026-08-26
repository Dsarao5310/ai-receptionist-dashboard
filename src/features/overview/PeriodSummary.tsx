import Link from "next/link";
import type { DashboardStats, DateRangeKey, KPI } from "@/types";
import type { ReadinessChannel } from "./readiness";
import { Card } from "@/components/ui/Card";
import { SkeletonText } from "@/components/ui/Skeleton";
import { formatKpiDelta, KPI_DRILL_HREF } from "@/lib/kpi-format";
import { cn } from "@/lib/utils";

/**
 * The one-sentence answer to "what did my receptionist actually do", read
 * before any of the six KPI tiles or the trend chart below it. StatusStrip
 * above already answers "is it connected" — this answers "did it work, and
 * is anything owed my attention" in plain language, which is what a business
 * owner (not a dashboard-literate analyst) scans for first.
 *
 * Deliberately not framed as an AI-generated insight — it's a template over
 * numbers already computed by `getDashboardStats`/`getReadiness`, not a live
 * model call, and claiming otherwise would be exactly the kind of dishonest
 * provenance copy the project's design rules rule out.
 */
const RANGE_PHRASE: Record<DateRangeKey, string> = {
  today: "Today",
  "7d": "Over the last 7 days",
  "30d": "Over the last 30 days",
  "90d": "Over the last 90 days",
  custom: "In this period",
};

function findKpi(kpis: KPI[], key: string): KPI {
  const found = kpis.find((k) => k.key === key);
  if (!found) throw new Error(`Missing expected KPI: ${key}`);
  return found;
}

function DeltaNote({ kpi }: { kpi: KPI }) {
  const delta = formatKpiDelta(kpi);
  if (delta.flat) return null;
  return <span className={cn("font-medium", delta.positive ? "text-success" : "text-danger")}> ({delta.text})</span>;
}

export function PeriodSummary({
  stats,
  rangeKey,
  breakdown,
}: {
  stats: DashboardStats;
  rangeKey: DateRangeKey;
  /** Same channel list StatusStrip and the readiness gauge already show. */
  breakdown: ReadinessChannel[];
}) {
  const conversations = findKpi(stats.kpis, "conversations_handled");
  const appointments = findKpi(stats.kpis, "appointments_booked");
  const missed = findKpi(stats.kpis, "missed_escalated");
  const needsAttention = breakdown.filter((ch) => ch.state !== "connected");

  return (
    <Card className="p-4">
      <p className="text-sm leading-relaxed text-text-primary">
        <span className="text-text-muted">{RANGE_PHRASE[rangeKey]}, your receptionist handled </span>
        <Link href={KPI_DRILL_HREF.conversations_handled} className="font-semibold hover:underline">
          {conversations.value.toLocaleString()} conversation{conversations.value === 1 ? "" : "s"}
        </Link>
        <DeltaNote kpi={conversations} />
        <span className="text-text-muted"> and booked </span>
        <Link href={KPI_DRILL_HREF.appointments_booked} className="font-semibold hover:underline">
          {appointments.value.toLocaleString()} appointment{appointments.value === 1 ? "" : "s"}
        </Link>
        <DeltaNote kpi={appointments} />
        <span className="text-text-muted">.</span>
      </p>

      <p className="mt-1.5 text-sm text-text-secondary">
        {needsAttention.length > 0 ? (
          <>
            <Link href="/connections" className="font-medium text-warning hover:underline">
              {needsAttention.map((ch) => ch.label).join(" and ")}
            </Link>{" "}
            {needsAttention.length === 1 ? "needs" : "need"} attention.
            {missed.value > 0 && (
              <>
                {" "}
                <Link href={KPI_DRILL_HREF.missed_escalated} className="font-medium text-text-primary hover:underline">
                  {missed.value} conversation{missed.value === 1 ? "" : "s"}
                </Link>{" "}
                needed a human.
              </>
            )}
          </>
        ) : missed.value > 0 ? (
          <>
            <Link href={KPI_DRILL_HREF.missed_escalated} className="font-medium text-text-primary hover:underline">
              {missed.value} conversation{missed.value === 1 ? "" : "s"}
            </Link>{" "}
            needed a human — worth a look.
          </>
        ) : (
          "Every channel is connected and nothing needs your attention."
        )}
      </p>
    </Card>
  );
}

export function PeriodSummarySkeleton() {
  return (
    <Card className="p-4">
      <SkeletonText lines={2} />
    </Card>
  );
}
