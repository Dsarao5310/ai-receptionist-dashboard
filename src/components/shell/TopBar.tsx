"use client";

import { Search, ChevronDown, LogOut, UserRound, Palette } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { AppearanceMenu } from "./AppearanceMenu";
import { NotificationCenter } from "./NotificationCenter";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useAccountSummary } from "@/lib/use-account-summary";
import { signOutAction } from "@/server/actions/auth";

export function TopBar({ title }: { title?: string }) {
  const account = useAccountSummary();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 backdrop-blur px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {title && <h1 className="truncate text-[15px] font-semibold text-text-primary">{title}</h1>}
      </div>

      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        aria-label="Search"
        /* Icon-only below `sm`. At 375px a fixed-width box left the heading
           too little room and every page title rendered truncated to "Ov…". */
        className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface-sunken h-9 w-9 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary sm:w-64 sm:justify-start sm:px-3"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">Search...</span>
        <kbd className="ml-auto hidden h-5 shrink-0 items-center rounded border border-border px-1.5 text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        <AppearanceMenu />
        <NotificationCenter />
        <WorkspaceSwitcher />

        {/* The sidebar owns the account menu on desktop; the sidebar itself
            is `hidden md:flex`, so below that breakpoint there would be no
            way to reach account settings or sign out at all without this. */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-md pl-1 pr-2 h-9 hover:bg-surface-hover transition-colors ml-1"
                aria-label="Account menu"
              >
                <Avatar name={account.name || "?"} size="sm" />
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-medium text-text-primary">{account.name}</p>
                <p className="truncate text-xs text-text-muted">{account.email}</p>
                <p className="mt-1 truncate text-xs text-text-secondary">
                  {account.workspaceName}
                  {account.roleLabel && ` · ${account.roleLabel}`}
                </p>
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
      </div>
    </header>
  );
}
