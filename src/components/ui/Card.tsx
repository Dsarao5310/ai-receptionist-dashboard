import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // min-w-0 overrides the grid/flex item default of min-width: auto,
        // which otherwise sizes the item to its widest descendant (e.g. a
        // Table's minWidth) and blows out the track instead of letting that
        // descendant's own overflow-x-auto scroll internally.
        "min-w-0 bg-surface border border-border rounded-xl shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Stacked by default: a bare title+description pair reads as one column,
  // not spread to opposite ends of a row. A header that genuinely pairs a
  // title with an action (a button, a badge) opts into the row explicitly
  // with its own `flex-row items-center justify-between` override.
  return <div className={cn("flex flex-col items-start gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-text-primary", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-text-muted mt-1", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-5 pt-0", className)} {...props} />;
}
