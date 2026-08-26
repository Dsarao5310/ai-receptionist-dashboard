import { Wrench } from "lucide-react";
import { WEEKDAYS } from "@/types";
import type { TopServicesByDay } from "@/services/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * A calendar-style activity heatmap: rows are the business's own top
 * services, columns are the seven weekdays, and a cell's *fill color* — not
 * its size — is how many of that service were booked on that day this
 * period. Modeled directly on the activity/contribution-graph family
 * (GitHub's contribution graph; the same pattern turns up across
 * professional heatmap-widget references on Dribbble/Figma Community under
 * that name) rather than a bubble/dot-size matrix: fixed-size rounded cells,
 * a single-hue intensity ramp, no per-cell numbers, day headers along the
 * top. Every reference surveyed skips a size encoding entirely for this
 * exact row-category × weekday shape — color is the whole signal, which
 * only works because the ramp (`--color-heat-1/2/3` in globals.css) is real:
 * validated steps arrived at by looking at the rendered result, not evenly
 * spaced hex guesses.
 *
 * `table-fixed` with an explicit `<colgroup>` rather than letting the table
 * size to its content: a content-sized table leaves the card's actual width
 * unused (every cell content-fits at its minimum), which is what made an
 * earlier pass of this look cramped in a corner instead of occupying the
 * card the way its Figma/Dribbble references do.
 *
 * Built as a real `<table>` with `scope="row"/"col"` headers rather than
 * styled `div`s, so every cell's value is reachable through native
 * row/column header semantics — the accessible "table view" other charts on
 * this page have to construct separately.
 */
const HEAT_CLASS = ["bg-surface-sunken", "bg-heat-1", "bg-heat-2", "bg-heat-3"];

/** 1–3 non-zero intensity steps, scaled off this grid's own busiest cell. */
function levelFor(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) return 0;
  return Math.min(3, Math.ceil((count / maxCount) * 3));
}

function Cell({ count, maxCount }: { count: number; maxCount: number }) {
  const level = levelFor(count, maxCount);
  return <div aria-hidden className={cn("aspect-square w-full rounded-[6px]", HEAT_CLASS[level])} />;
}

export function TopServices({ data }: { data: TopServicesByDay }) {
  return (
    <Card className="flex h-full flex-col rounded-2xl card-raised">
      <CardHeader className="p-5 pb-0">
        <CardTitle className="text-section">Top services</CardTitle>
        <CardDescription>Which services get booked, and on which day.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center p-5">
        {data.services.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No bookings yet"
            description="Booked services will appear here once your receptionist starts taking appointments."
            className="py-6"
          />
        ) : (
          <>
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[34%]" />
                {WEEKDAYS.map((day) => (
                  <col key={day} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" />
                  {WEEKDAYS.map((day) => (
                    <th key={day} scope="col" className="pb-3 text-center text-xs font-medium text-text-muted">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.services.map((service) => (
                  <tr key={service}>
                    <th scope="row" className="truncate pr-3 text-left text-sm font-normal text-text-secondary">
                      {service}
                    </th>
                    {WEEKDAYS.map((day) => {
                      const cell = data.cells.find((c) => c.service === service && c.day === day);
                      const count = cell?.count ?? 0;
                      return (
                        <td
                          key={day}
                          className="p-1.5"
                          title={`${service} · ${day}: ${count} booking${count === 1 ? "" : "s"}`}
                        >
                          <span className="sr-only">
                            {count} booking{count === 1 ? "" : "s"}
                          </span>
                          <Cell count={count} maxCount={data.maxCount} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-text-muted">
              <span>Fewer</span>
              {HEAT_CLASS.map((cls) => (
                <div key={cls} aria-hidden className={cn("h-3.5 w-3.5 rounded-[4px]", cls)} />
              ))}
              <span>More</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function TopServicesSkeleton() {
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader className="p-5 pb-0">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-1 h-3.5 w-56" />
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
