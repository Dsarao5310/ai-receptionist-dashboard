import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { KPI } from "@/types";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/shared/Sparkline";
import { cn } from "@/lib/utils";

function formatValue(kpi: KPI) {
  if (kpi.format === "percent") return `${Math.round(kpi.value)}%`;
  if (kpi.format === "currency") return `$${Math.round(kpi.value).toLocaleString()}`;
  return Math.round(kpi.value).toLocaleString();
}

function formatDelta(kpi: KPI) {
  if (kpi.format === "percent") {
    const pts = kpi.value - kpi.previousValue;
    return { text: `${pts >= 0 ? "+" : ""}${pts.toFixed(1)} pts`, positive: pts >= 0, flat: Math.abs(pts) < 0.05 };
  }
  if (kpi.previousValue === 0) {
    return { text: kpi.value > 0 ? "New" : "—", positive: kpi.value > 0, flat: kpi.value === 0 };
  }
  const pct = ((kpi.value - kpi.previousValue) / kpi.previousValue) * 100;
  const capped = Math.max(-999, Math.min(999, pct));
  const suffix = Math.abs(pct) > 999 ? "%+" : "%";
  return { text: `${capped >= 0 ? "+" : ""}${capped.toFixed(0)}${suffix}`, positive: pct >= 0, flat: Math.abs(pct) < 0.5 };
}

/** Metrics where a decrease is the good direction — invert the color semantics. */
const INVERTED_KEYS = new Set(["missed_escalated", "cancellations", "reschedules"]);

export function KPICard({ kpi, emphasize = false }: { kpi: KPI; emphasize?: boolean }) {
  const delta = formatDelta(kpi);
  const inverted = INVERTED_KEYS.has(kpi.key);
  const goodDirection = inverted ? !delta.positive : delta.positive;
  const Icon = delta.flat ? Minus : goodDirection ? TrendingUp : TrendingDown;
  const deltaTone = delta.flat ? "text-text-muted" : goodDirection ? "text-success" : "text-danger";

  return (
    <Card
      className={cn(
        "p-5 flex flex-col justify-between min-h-[132px]",
        emphasize && "border-accent/40 bg-accent-subtle/40 shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-xs font-medium min-w-0", emphasize ? "text-accent-text" : "text-text-muted")}>{kpi.label}</span>
        <Sparkline values={kpi.sparkline} tone={emphasize ? "accent" : "muted"} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className={cn("font-semibold tracking-tight text-text-primary", emphasize ? "text-3xl" : "text-2xl")}>
          {formatValue(kpi)}
        </span>
        <span className={cn("flex items-center gap-1 text-xs font-medium pb-1", deltaTone)}>
          <Icon className="h-3.5 w-3.5" />
          {delta.text}
        </span>
      </div>
    </Card>
  );
}
