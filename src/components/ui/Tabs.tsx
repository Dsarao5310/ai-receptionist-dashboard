"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

/**
 * A sliding highlight that tracks whichever trigger currently has
 * `data-state="active"` — Radix sets that attribute itself, so this needs no
 * extra prop from callers and works for every existing `Tabs` usage
 * unchanged (Settings, List/Calendar, Day/Week/Month, ...).
 *
 * This is purely decorative and additive: `TabsTrigger` below keeps its own
 * `data-[state=active]:text-text-primary` regardless of whether this
 * indicator ever successfully measures a position, so a tab's selected state
 * is never dependent on this component computing anything correctly.
 */
export function TabsList({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);
  const reduced = useReducedMotion();

  // Mount-once: the observers below react to the DOM changes that matter
  // (which trigger is active, added/removed triggers, size) directly, so
  // there's nothing to gain from tearing them down and rebuilding them on
  // every re-render — `children` is a new element array on every render of
  // whatever renders this list, so keying the effect on it would do exactly
  // that on every unrelated re-render (e.g. a page polling for fresh data).
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function measure() {
      const active = list!.querySelector<HTMLElement>('[data-state="active"]');
      setIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    }

    measure();
    const observer = new MutationObserver(measure);
    observer.observe(list, { attributes: true, attributeFilter: ["data-state"], childList: true, subtree: true });

    // Not every environment guarantees ResizeObserver (e.g. a test runner's
    // DOM). The mutation observer above still keeps the indicator correct on
    // tab changes without it — a pure window resize just goes unnoticed
    // until the next data-state change.
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(list);

    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={listRef}
      className={cn("relative inline-flex items-center gap-1 rounded-lg bg-surface-sunken p-1", className)}
      {...props}
    >
      {indicator && (
        <motion.div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-md bg-surface shadow-sm"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1, left: indicator.left, width: indicator.width }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
        />
      )}
      <div className="relative flex items-center gap-1">{children}</div>
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative z-10 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors",
        "data-[state=active]:text-text-primary",
        "hover:text-text-primary",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 focus:outline-none", className)} {...props} />;
}
