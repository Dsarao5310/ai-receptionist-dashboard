"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { getMobileNavItems, isNavItemActive } from "@/lib/nav-config";
import { useOptionalSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { MoreMenuSheet } from "./MoreMenuSheet";

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const session = useOptionalSession();
  const items = getMobileNavItems({
    platformRole: session?.user.platformRole ?? "member",
    workspaceRole: session?.workspaceRole ?? null,
  });

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        {/* Columns are derived, not fixed at five: the item list is
            permission-filtered, so a role without one of the four tabs would
            otherwise leave a dead cell at the end of the bar. */}
        <div className="grid h-14" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-accent-text" : "text-text-muted"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="truncate max-w-[64px]">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-muted"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
      <MoreMenuSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
