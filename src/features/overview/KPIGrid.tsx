import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { KPI_DRILL_HREF } from "@/lib/kpi-format";

/**
 * Appointments booked is the answer to "is this thing actually working?" —
 * the one number worth seeing before any other. It gets the hero fill; the
 * other five are equal-weight siblings at the same size, same row.
 */
const HERO_KEY = "appointments_booked";

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6";

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="space-y-2">
      <div className={GRID}>
        {kpis.map((kpi) => (
          <KPICard key={kpi.key} kpi={kpi} hero={kpi.key === HERO_KEY} raised href={KPI_DRILL_HREF[kpi.key]} />
        ))}
      </div>
      {/* Same footnote Analytics states for the identical delta math (see
          AnalyticsKPIs) — Overview was missing it, which is its own
          inconsistency: the same "-53%" chip meant the same thing on both
          pages, but only one of them said what it was measured against. */}
      <p className="text-xs text-text-muted">Comparisons are against the immediately preceding period of the same length.</p>
    </div>
  );
}

export function KPIGridSkeleton() {
  // Wrapped to match the real component's `space-y-2` + footnote, so
  // hydrating does not shift everything below it upward by a line.
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
