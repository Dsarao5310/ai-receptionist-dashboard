"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
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

// A brief hold before collapsing back on mouse-leave, so crossing the rail's
// edge (e.g. to reach the top bar) doesn't flicker the sidebar shut.
const HOVER_COLLAPSE_DELAY_MS = 250;

export function Sidebar() {
  const savedCollapsed = usePreferences((s) => s.sidebarCollapsed);
  const hoverExpand = usePreferences((s) => s.sidebarHoverExpand);
  const toggleSidebar = usePreferences((s) => s.toggleSidebar);
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  // Hovering a collapsed rail previews the expanded sidebar without touching
  // the saved preference — it snaps back the instant the pointer leaves.
  const [hovering, setHovering] = useState(false);
  // The account dropdown's content renders in a Radix portal — a real DOM
  // subtree outside <aside>, not just a visual overlap — so moving the
  // pointer from the rail onto the open menu is a genuine `mouseleave` on
  // <aside> and would otherwise start the collapse timer with the menu still
  // open: the trigger button (and the menu anchored to it) jumps as the rail
  // shrinks underneath it mid-click. Tracked separately so the preview stays
  // open for as long as this one menu does, regardless of where the pointer
  // actually is.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  // Hovering is only eligible to do anything while the rail is actually
  // collapsed and the preference allows it — both handlers gate on the same
  // condition so they can't drift out of sync with each other.
  const hoverEligible = savedCollapsed && hoverExpand;
  // True only while the rail is showing its hover preview. The outer <aside>
  // always keeps the *saved* width in flow (68px while collapsed), so a
  // preview never reflows the content column next to it — it floats an
  // absolutely-positioned panel over that content instead, the way a
  // collapsed-rail hover-peek behaves in most apps that have one. An earlier
  // version changed the in-flow width instead, which was simpler but pushed
  // every card on the page sideways for the duration of the hover — smooth
  // for the rail, not for anything beside it.
  const previewing = hoverEligible && (hovering || accountMenuOpen);
  const collapsed = savedCollapsed && !previewing;

  function handleMouseEnter() {
    if (!hoverEligible) return;
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setHovering(true);
  }
  function handleMouseLeave() {
    if (!hoverEligible) return;
    collapseTimer.current = setTimeout(() => setHovering(false), HOVER_COLLAPSE_DELAY_MS);
  }
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        // `sticky` positioning creates its own stacking context, so without
        // an explicit z-index here the *outer* <aside> — not just the
        // z-40'd overlay div inside it — falls back to plain DOM order
        // against TopBar's own `sticky z-30` header next door. TopBar comes
        // later in the DOM, so it silently painted over the expanded
        // preview (visibly clipping the "Receptionist AI" wordmark behind
        // the page title) despite the inner div's z-index, because that
        // z-index only ever competed within this stacking context, not
        // against TopBar's separate one.
        "hidden md:block relative z-40 shrink-0 h-screen sticky top-0",
        // The layout box always reflects the *saved* preference — never the
        // hover preview — so the flex sibling next to it never reflows.
        savedCollapsed ? "w-[68px]" : "w-[248px]"
      )}
    >
      <div
        className={cn(
          "flex h-full flex-col border-r border-border bg-surface",
          "transition-[width] duration-200 ease-out",
          previewing
            ? "absolute inset-y-0 left-0 z-40 w-[248px] shadow-xl"
            : "relative w-full",
          collapsed ? "w-[68px]" : undefined
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
                          "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                          collapsed && "justify-center px-0 h-9",
                          active ? "text-accent-text" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active-pill"
                            className="absolute inset-0 rounded-md bg-accent-subtle"
                            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
                          />
                        )}
                        <item.icon className="relative h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="relative truncate">{item.label}</span>}
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

            <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
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
      </div>
    </aside>
  );
}
