"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;

export function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[overlay-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_180ms_ease-in]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 bg-surface border-border shadow-xl focus:outline-none flex flex-col",
          // Desktop/tablet: right side sheet
          "top-0 right-0 h-full w-full sm:max-w-md border-l",
          "data-[state=open]:animate-[slide-in-right_220ms_ease-out] data-[state=closed]:animate-[slide-out-right_180ms_ease-in]",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 p-5 border-b border-border shrink-0",
        className
      )}
      {...props}
    />
  );
}

export function DrawerTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-base font-semibold text-text-primary", className)} {...props} />;
}

export function DrawerDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-text-muted mt-1", className)} {...props} />;
}

export function DrawerClose({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      className={cn(
        "rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors shrink-0",
        className
      )}
      {...props}
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
  );
}

/** Forwards a ref so callers can control scrolling (e.g. following a conversation). */
export const DrawerBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-5 overflow-y-auto flex-1", className)} {...props} />
);
DrawerBody.displayName = "DrawerBody";

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 p-5 border-t border-border shrink-0", className)}
      {...props}
    />
  );
}
