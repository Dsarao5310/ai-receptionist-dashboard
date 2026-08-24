import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The heading block every page starts with.
 *
 * ── Why there is no `title` prop ────────────────────────────────────────────
 * The application chrome already renders the route's name as the page `h1`
 * (see `AppShell` → `TopBar`). Pages used to print their own title again just
 * below it, which produced two headings with the same words — and on the admin
 * pages, two competing `h1`s. So this component owns the *supporting* half of
 * the header: the one-line description and the page's primary actions.
 *
 * Pages that genuinely need a second-level heading (a tab panel, say) should
 * use a real `h2` inside their content, not another copy of the page name.
 */
export function PageHeader({
  description,
  actions,
  children,
  className,
}: {
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!description && !actions && !children) return null;

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        {description && <p className="text-sm text-text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
