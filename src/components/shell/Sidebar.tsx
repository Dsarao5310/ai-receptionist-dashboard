"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav-config";
import { usePreferences } from "@/lib/store/preferences";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const toggleSidebar = usePreferences((s) => s.toggleSidebar);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 border-r border-border bg-surface h-screen sticky top-0",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px]" : "w-[248px]"
      )}
    >
      <div className={cn("flex items-center h-14 shrink-0 border-b border-border", collapsed ? "justify-center px-0" : "px-4 gap-2")}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-text-on-accent shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-text-primary truncate">Receptionist AI</span>
        )}
      </div>

      <TooltipProvider>
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const link = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                        collapsed && "justify-center px-0 h-9",
                        active
                          ? "bg-accent-subtle text-accent-text"
                          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                  return collapsed ? (
                    <Tooltip key={item.href} content={item.label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </TooltipProvider>

      <div className="p-2.5 border-t border-border">
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors w-full",
            collapsed && "justify-center px-0"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
