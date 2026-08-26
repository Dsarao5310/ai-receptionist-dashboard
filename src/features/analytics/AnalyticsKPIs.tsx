import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { KPI_DRILL_HREF } from "@/lib/kpi-format";

/** Booking conversion is the headline answer to "is the receptionist working?" — give it the visual weight. */
const HERO_KEY = "booking_conversion";

/**
 * Matches the Overview grid so the two dashboards read as one system.
 *
 * The `md` step matters: without it, 768–1024px fell straight from two columns
 * to three, stacking six tall cards into three rows before any chart appeared.
 */
const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6";

export function AnalyticsKPIs({ kpis, basis }: { kpis: KPI[]; basis: string }) {
  return (
    <div className="space-y-2">
      <div className={GRID}>
        {kpis.map((kpi) => (
          <KPICard key={kpi.key} kpi={kpi} hero={kpi.key === HERO_KEY} href={KPI_DRILL_HREF[kpi.key]} />
        ))}
      </div>
      <p className="text-xs text-text-muted">{basis} Comparisons are against the immediately preceding period of the same length.</p>
    </div>
  );
}

export function AnalyticsKPIsSkeleton() {
  // Wrapped to match the real component's `space-y-2` + footnote, so hydrating
  // does not shift everything below it upward by a line.
  return (
    <div className="space-y-2">
      <div className={GRID}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="h-4" />
    </div>
  );
}
