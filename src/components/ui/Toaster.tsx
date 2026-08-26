"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  const reduced = useReducedMotion();

  // Matches the entrance the CSS `slide-in-bottom` keyframe used to give this
  // alone: a toast now animates back out the same way it came in, instead of
  // vanishing the instant it leaves `toasts`. AnimatePresence is what makes an
  // exit transition possible at all — a plain conditional render unmounts
  // before any exit animation could run.
  const variants = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: "easeOut" as const } },
        exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16, ease: "easeIn" as const } },
      };

  return (
    <div
      className="fixed bottom-4 right-4 z-[999999] flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-label="Notifications"
      // The region stays mounted even at zero toasts so a dismissed toast's
      // exit animation has somewhere to play out — hidden from assistive
      // tech while genuinely empty rather than left as a permanent, empty
      // landmark.
      aria-hidden={toasts.length === 0}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={variants.initial}
              animate={variants.animate}
              exit={variants.exit}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3.5 shadow-lg"
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
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
