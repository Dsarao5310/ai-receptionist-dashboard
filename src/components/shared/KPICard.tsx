import Link from "next/link";
import { ArrowUpRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
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
 *
 * ── `hero` is a fill, not a size bump ───────────────────────────────────────
 * A first attempt at emphasis made this card physically bigger — spanning two
 * grid columns — which made every sibling narrower and produced a ragged row.
 * The reference this now follows (a DocTime-style stat row) does it the other
 * way: the loud tile is the *same size* as its neighbours, standing out purely
 * through a solid fill instead of taking more space. Hierarchy through
 * contrast, not through size, so the row stays regular at every breakpoint.
 *
 * ── Drill-down is opt-in per tile ────────────────────────────────────────────
 * `href` reuses the same query-param drill-down vocabulary the rest of
 * Analytics already established (`/appointments?status=`, `/calls?outcome=`,
 * `/conversations?intent=` — see `AppointmentOutcomes`/`ReceptionistImpact`),
 * so a KPI card behaves like every other clickable metric in this app rather
 * than introducing a second convention. When a caller has no sensible
 * destination for a metric, it omits `href` and the tile stays a plain,
 * honestly non-interactive card — never a fake affordance on something that
 * does nothing.
 */
export function KPICard({
  kpi,
  hero = false,
  raised = false,
  href,
}: {
  kpi: KPI;
  /** Solid-fill treatment for the one tile in a row that should read first. */
  hero?: boolean;
  /** Dashboard surfaces opt into the display layer; other pages keep the flat card. */
  raised?: boolean;
  /** Where this metric drills down to. Omit if there's no meaningful destination. */
  href?: string;
}) {
  const delta = formatKpiDelta(kpi);
  const inverted = INVERTED_KPI_KEYS.has(kpi.key);
  const goodDirection = inverted ? !delta.positive : delta.positive;
  const Icon = delta.flat ? Minus : goodDirection ? TrendingUp : TrendingDown;

  // On the hero fill, red/green would fight the saturated background rather
  // than read against it — DocTime's own filled tile drops colour from its
  // delta pill too. Direction still survives without colour: the arrow shape
  // and the literal +/- in the formatted text both carry it independently.
  const deltaChip = hero
    ? "bg-white/20 text-hero-text"
    : delta.flat
      ? "bg-surface-sunken text-text-muted"
      : goodDirection
        ? "bg-success-bg text-success"
        : "bg-danger-bg text-danger";

  const body = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span
          className={cn(
            "min-w-0 text-xs font-medium leading-snug hyphens-none",
            hero ? "text-hero-muted" : "text-text-muted"
          )}
        >
          {kpi.label}
        </span>
        {/* Hidden until hover/focus rather than always-on: a static arrow on
            every tile reads as decoration, but one that appears only on the
            tiles that respond to interaction is what actually signals it. */}
        {href && (
          <ArrowUpRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              hero ? "text-hero-muted" : "text-text-muted"
            )}
            aria-hidden
          />
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("text-metric", hero ? "text-hero-text" : "text-text-primary")}>
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

      <Sparkline
        values={kpi.sparkline}
        tone={hero ? "hero" : goodDirection ? "success" : delta.flat ? "muted" : "danger"}
        variant="line"
        className="mt-auto"
      />
    </>
  );

  const sharedClassName = cn(
    "flex min-w-0 flex-col gap-3 overflow-hidden p-4",
    raised && "rounded-2xl p-5 card-raised card-raised-interactive",
    hero && "border-transparent bg-hero"
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          sharedClassName,
          "group shadow-sm transition-[transform,border-color] duration-150 active:scale-[0.98]",
          // `raised`/`hero` already picked rounding and fill/border in
          // `sharedClassName` above — repeating the un-hero, un-raised
          // defaults here unconditionally (the previous shape of this class
          // list) let tailwind-merge's same-conflict-group "last one wins"
          // rule silently override them, which is how a hero+raised+href
          // tile (the Overview KPI grid's one hero card) rendered as a plain
          // `bg-surface` card with invisible white-on-white text in light
          // mode. Only add a default when the corresponding flag is off.
          !raised && "rounded-xl",
          hero ? "hover:border-white/30" : "border border-border bg-surface hover:border-border-interactive",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        )}
      >
        {body}
      </Link>
    );
  }

  return <Card className={sharedClassName}>{body}</Card>;
}
