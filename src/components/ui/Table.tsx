import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A horizontally scrollable table.
 *
 * `min-w` is a prop because the old fixed 640px was wrong in both directions:
 * a five-column list wasted the guarantee, while the nine-column workflows
 * table was crushed to ~71px per column. Callers state what their content
 * actually needs.
 *
 * `tabIndex`/`role` make the scroll region reachable by keyboard — a mouse-only
 * scroll container hides the right-hand columns from anyone not using a
 * pointer, which on the admin tables is where the action buttons live.
 */
export function Table({
  className,
  minWidth = "min-w-[640px]",
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { minWidth?: string }) {
  return (
    <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className={cn("w-full border-collapse text-sm", minWidth, className)} {...props} />
    </div>
  );
}

/**
 * Not sticky.
 *
 * It used to carry `sticky top-0`, but the only scroll container above it is
 * the horizontal wrapper, which never scrolls vertically — so the header never
 * stuck to anything. Where it did resolve against the page it slid underneath
 * the z-30 top bar. Dead styling either way; removed rather than left implying
 * behaviour that does not exist.
 */
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableRow({
  className,
  clickable,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0 transition-colors",
        clickable && "cursor-pointer hover:bg-surface-hover",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-text-muted border-b border-border whitespace-nowrap",
        className
      )}
      {...props}
    />
  );
}

export function SortableHead({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1 hover:text-text-primary transition-colors",
          active && "text-text-primary"
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("h-[var(--density-row-h,44px)] px-4 align-middle text-text-primary", className)}
      {...props}
    />
  );
}
