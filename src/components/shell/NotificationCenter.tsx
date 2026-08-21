"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Bell, CalendarCheck, CalendarX, PhoneMissed, Plug, AlertCircle, Info } from "lucide-react";
import { useNotifications } from "@/lib/store/notifications";
import { useBusinessFormat } from "@/lib/business-format";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationSeverity } from "@/types";

function iconFor(n: AppNotification) {
  if (n.relatedType === "appointment") return n.severity === "success" ? CalendarCheck : CalendarX;
  if (n.relatedType === "call") return PhoneMissed;
  if (n.relatedType === "integration") return Plug;
  return n.severity === "critical" || n.severity === "warning" ? AlertCircle : Info;
}

const SEVERITY_CLASSES: Record<NotificationSeverity, string> = {
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  critical: "bg-danger-bg text-danger",
};

export function NotificationCenter() {
  const notifications = useNotifications((s) => s.notifications);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const unreadCount = notifications.filter((n) => !n.read).length;
  // The stored value is an instant; "26 min ago" is produced here, against the
  // business clock, rather than being baked in when the row was written.
  const fmt = useBusinessFormat();

  return (
    <PopoverPrimitive.Root>
      <Tooltip content="Notifications">
        <PopoverPrimitive.Trigger asChild>
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
            )}
          </button>
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[380px] max-w-[92vw] rounded-xl border border-border bg-surface-raised shadow-xl",
            "data-[state=open]:animate-[pop-in_150ms_ease-out] data-[state=closed]:animate-[pop-out_120ms_ease-in]"
          )}
        >
          <div className="flex items-center justify-between p-4 pb-3">
            <span className="text-sm font-semibold text-text-primary">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-accent-text hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-text-muted">You&apos;re all caught up.</div>
            ) : (
              notifications.map((n) => {
                const Icon = iconFor(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left border-t border-border first:border-t-0 transition-colors hover:bg-surface-hover",
                      !n.read && "bg-accent-subtle/40"
                    )}
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", SEVERITY_CLASSES[n.severity])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-text-primary truncate">{n.title}</span>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted line-clamp-2">{n.description}</span>
                      <span className="mt-1 block text-[11px] text-text-muted">{fmt.relative(n.timestamp)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
