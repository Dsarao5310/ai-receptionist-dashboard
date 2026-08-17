"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ALL_NAV_ITEMS, MOBILE_NAV_ITEMS } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

export function MoreMenuSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const pathname = usePathname();
  const mobileHrefs = new Set(MOBILE_NAV_ITEMS.map((i) => i.href));
  const rest = ALL_NAV_ITEMS.filter((i) => !mobileHrefs.has(i.href));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 md:hidden data-[state=open]:animate-[overlay-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_180ms_ease-in]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 md:hidden rounded-t-xl border-t border-border bg-surface shadow-xl pb-[calc(env(safe-area-inset-bottom)+12px)]",
            "data-[state=open]:animate-[slide-in-bottom_220ms_ease-out] data-[state=closed]:animate-[slide-out-bottom_180ms_ease-in]"
          )}
        >
          <DialogPrimitive.Title className="sr-only">More navigation</DialogPrimitive.Title>
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border-strong" />
          <div className="grid grid-cols-3 gap-1.5 p-4">
            {rest.map((item) => {
              const active = pathname === item.href;
              return (
                <DialogPrimitive.Close asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3.5 text-center text-xs font-medium",
                      active
                        ? "border-accent bg-accent-subtle text-accent-text"
                        : "border-border text-text-secondary hover:bg-surface-hover"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </DialogPrimitive.Close>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
