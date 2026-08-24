import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";

const EMPHASIZED_KEY = "appointments_booked";

/**
 * Six metrics on one row at desktop.
 *
 * The emphasized card used to span two columns of a seven-column grid, which
 * made every other card narrower than it needed to be and left the row ragged
 * at the breakpoints where the span did not divide evenly. Emphasis is now
 * carried by the card's own accent treatment instead of by width, so the grid
 * stays regular and each card gets an equal, readable share.
 */
const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6";

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className={GRID}>
      {kpis.map((kpi) => (
        <KPICard key={kpi.key} kpi={kpi} emphasize={kpi.key === EMPHASIZED_KEY} />
      ))}
    </div>
  );
}

export function KPIGridSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
