import type { KPI } from "@/types";
import { KPICard } from "@/components/shared/KPICard";
import { SkeletonCard } from "@/components/ui/Skeleton";

const EMPHASIZED_KEY = "appointments_booked";

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
      {kpis.map((kpi) => {
        const emphasize = kpi.key === EMPHASIZED_KEY;
        return (
          <div key={kpi.key} className={emphasize ? "xl:col-span-2 col-span-2 md:col-span-1" : "col-span-1"}>
            <KPICard kpi={kpi} emphasize={emphasize} />
          </div>
        );
      })}
    </div>
  );
}

export function KPIGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={i === 0 ? "xl:col-span-2 col-span-2 md:col-span-1" : "col-span-1"}>
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}
