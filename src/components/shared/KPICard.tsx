import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { KPI } from "@/types";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/shared/Sparkline";
import { formatKpiValue, formatKpiDelta, INVERTED_KPI_KEYS } from "@/lib/kpi-format";
import { cn } from "@/lib/utils";

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
export function KPICard({
  kpi,
  emphasize = false,
  raised = false,
}: {
  kpi: KPI;
  emphasize?: boolean;
  /** Dashboard surfaces opt into the display layer; other pages keep the flat card. */
  raised?: boolean;
}) {
  const delta = formatKpiDelta(kpi);
  const inverted = INVERTED_KPI_KEYS.has(kpi.key);
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
        emphasize && "border-accent/40 bg-accent-subtle/40 shadow-md",
        raised && "rounded-2xl p-5 card-raised card-raised-interactive"
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
            "text-text-primary",
            raised ? "text-metric" : cn("font-semibold tracking-tight tabular-nums", emphasize ? "text-3xl" : "text-2xl")
          )}
        >
          {formatKpiValue(kpi)}
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

      <Sparkline values={kpi.sparkline} tone={emphasize ? "accent" : goodDirection ? "success" : "muted"} variant="bars" className="mt-auto" />
    </Card>
  );
}
