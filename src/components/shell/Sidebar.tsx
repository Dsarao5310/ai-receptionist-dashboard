"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, Palette, PanelLeftClose, PanelLeftOpen, Sparkles, UserRound } from "lucide-react";
import { getNavGroups, isNavItemActive } from "@/lib/nav-config";
import { useOptionalSession } from "@/lib/session-context";
import { useAccountSummary } from "@/lib/use-account-summary";
import { usePreferences } from "@/lib/store/preferences";
import { signOutAction } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const toggleSidebar = usePreferences((s) => s.toggleSidebar);
  const pathname = usePathname();
  // The Administration group is hidden for roles without it. Presentation only
  // — see lib/permissions.ts.
  const session = useOptionalSession();
  const navGroups = getNavGroups({
    platformRole: session?.user.platformRole ?? "member",
    workspaceRole: session?.workspaceRole ?? null,
  });
  const account = useAccountSummary();

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
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavItemActive(item.href, pathname);
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

        {/* ── Account area ─────────────────────────────────────────────────
            The account menu lives here rather than in the top bar: it is
            identity and session control, which reads as part of "where am I
            in this app" rather than a page-level utility. Collapse stays as
            its own quiet row above it, unchanged in behaviour. */}
        <div className="border-t border-border p-2.5 space-y-1">
          {collapsed ? (
            <Tooltip content="Expand sidebar" side="right">
              <button
                onClick={toggleSidebar}
                className="flex h-9 w-full items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-[18px] w-[18px]" />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={toggleSidebar}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" />
              <span>Collapse</span>
            </button>
          )}

          <DropdownMenu>
            {collapsed ? (
              <Tooltip content="Account" side="right">
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 w-full items-center justify-center rounded-md hover:bg-surface-hover transition-colors" aria-label="Account menu">
                    <Avatar name={account.name || "?"} size="sm" />
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>
            ) : (
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-surface-hover transition-colors"
                  aria-label="Account menu"
                >
                  <Avatar name={account.name || "?"} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">{account.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {account.roleLabel ?? account.workspaceName}
                    </span>
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                </button>
              </DropdownMenuTrigger>
            )}
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64 mb-1">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-medium text-text-primary">{account.name}</p>
                <p className="truncate text-xs text-text-muted">{account.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <UserRound className="h-4 w-4 text-text-muted" />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings?tab=appearance">
                  <Palette className="h-4 w-4 text-text-muted" />
                  Appearance
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Sign-out is a form post to a server action, so it goes through
                  Auth.js's own CSRF-protected endpoint rather than a client fetch. */}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-danger transition-colors hover:bg-surface-hover"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </aside>
  );
}
