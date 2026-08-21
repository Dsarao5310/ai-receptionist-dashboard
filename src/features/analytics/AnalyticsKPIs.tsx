import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";

/** Booking conversion is the headline answer to "is the receptionist working?" — give it the visual weight. */
const EMPHASIZED_KEY = "booking_conversion";

export function AnalyticsKPIs({ kpis, basis }: { kpis: KPI[]; basis: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KPICard key={kpi.key} kpi={kpi} emphasize={kpi.key === EMPHASIZED_KEY} />
        ))}
      </div>
      <p className="text-xs text-text-muted">{basis} Comparisons are against the immediately preceding period of the same length.</p>
    </div>
  );
}

export function AnalyticsKPIsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
