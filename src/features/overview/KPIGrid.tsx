import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";

/**
 * The secondary metrics, below the hero.
 *
 * There is no emphasized card here any more: the page's emphasis now lives in
 * the hero panel above, and a second highlighted tile would compete with it.
 * Five equal cards read as a set; one loud one among them reads as a mistake.
 */
const GRID = "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5";

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className={GRID}>
      {kpis.map((kpi) => (
        <KPICard key={kpi.key} kpi={kpi} raised />
      ))}
    </div>
  );
}

export function KPIGridSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
