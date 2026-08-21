"use client";

import { CheckCircle2, Info, X } from "lucide-react";
import { useToastStore } from "@/lib/store/toast";
import { cn } from "@/lib/utils";

const TONE_ICON = {
  default: Info,
  success: CheckCircle2,
  danger: Info,
} as const;

const TONE_ICON_CLASS = {
  default: "text-text-muted",
  success: "text-success",
  danger: "text-danger",
} as const;

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[999999] flex w-full max-w-sm flex-col gap-2" role="region" aria-label="Notifications">
      {toasts.map((t) => {
        const Icon = TONE_ICON[t.tone];
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3.5 shadow-lg",
              "animate-[slide-in-bottom_220ms_ease-out]"
            )}
            role="status"
          >
            <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", TONE_ICON_CLASS[t.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-text-muted">{t.description}</p>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-1.5 text-xs font-semibold text-accent-text hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
