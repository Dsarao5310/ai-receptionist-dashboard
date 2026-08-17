"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 rounded-md bg-[var(--color-text-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-page)] shadow-lg",
            "data-[state=delayed-open]:animate-[pop-in_150ms_ease-out]",
            "data-[state=closed]:animate-[pop-out_120ms_ease-in]"
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--color-text-primary)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
