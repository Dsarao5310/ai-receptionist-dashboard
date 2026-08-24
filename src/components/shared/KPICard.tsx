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

/**
 * A single headline metric.
 *
 * ── Why the sparkline is on its own row ─────────────────────────────────────
 * It used to sit beside the label, capped at 2.75rem. In a six- or seven-column
 * grid that left the label roughly 70px, and `break-words` then split it
 * mid-word — "Conversati / ons handled". Stacking the rows gives the label the
 * full card width and the sparkline a readable one, so neither has to lose.
 *
 * The delta is a filled chip rather than bare text: at a glance the direction
 * should be readable from the shape, and the arrow icon carries the meaning for
 * anyone who cannot rely on the color.
 */
export function KPICard({ kpi, emphasize = false }: { kpi: KPI; emphasize?: boolean }) {
  const delta = formatDelta(kpi);
  const inverted = INVERTED_KEYS.has(kpi.key);
  const goodDirection = inverted ? !delta.positive : delta.positive;
  const Icon = delta.flat ? Minus : goodDirection ? TrendingUp : TrendingDown;

  const deltaChip = delta.flat
    ? "bg-surface-sunken text-text-muted"
    : goodDirection
      ? "bg-success-bg text-success"
      : "bg-danger-bg text-danger";

  return (
    <Card
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden p-4",
        emphasize && "border-accent/40 bg-accent-subtle/40 shadow-md"
      )}
    >
      <span
        className={cn(
          "min-w-0 text-xs font-medium leading-snug hyphens-none",
          emphasize ? "text-accent-text" : "text-text-muted"
        )}
      >
        {kpi.label}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "font-semibold tracking-tight tabular-nums text-text-primary",
            emphasize ? "text-3xl" : "text-2xl"
          )}
        >
          {formatValue(kpi)}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
            deltaChip
          )}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          {delta.text}
        </span>
      </div>

      <Sparkline values={kpi.sparkline} tone={emphasize ? "accent" : "muted"} className="mt-auto" />
    </Card>
  );
}
