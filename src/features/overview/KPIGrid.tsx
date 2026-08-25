import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Appointments booked is the answer to "is this thing actually working?" —
 * the one number worth seeing before any other. It gets the hero fill; the
 * other five are equal-weight siblings at the same size, same row.
 */
const HERO_KEY = "appointments_booked";

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6";

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className={GRID}>
      {kpis.map((kpi) => (
        <KPICard key={kpi.key} kpi={kpi} hero={kpi.key === HERO_KEY} raised />
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
