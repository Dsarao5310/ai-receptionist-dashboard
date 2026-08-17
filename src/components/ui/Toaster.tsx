"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-surface-raised! border! border-border! shadow-lg! text-text-primary! rounded-lg!",
          title: "text-sm! font-medium!",
          description: "text-text-muted!",
          actionButton: "bg-accent! text-white!",
          cancelButton: "bg-surface-sunken! text-text-secondary!",
        },
      }}
    />
  );
}
