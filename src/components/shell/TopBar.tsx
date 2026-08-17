"use client";

import { Search, ChevronDown, LogOut, UserRound, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
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

export function TopBar({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 backdrop-blur px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {title && <h1 className="truncate text-[15px] font-semibold text-text-primary">{title}</h1>}
        <Badge tone="warning" className="hidden sm:inline-flex">
          Demo mode
        </Badge>
      </div>

      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 h-9 text-sm text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors w-40 sm:w-64"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search...</span>
        <kbd className="ml-auto hidden sm:inline-flex h-5 items-center rounded border border-border px-1.5 text-[10px] shrink-0">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        <AppearanceMenu />
        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md pl-1 pr-2 h-9 hover:bg-surface-hover transition-colors ml-1">
              <Avatar name="Alex Rivera" size="sm" />
              <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2.5 py-2">
              <p className="text-sm font-medium text-text-primary">Alex Rivera</p>
              <p className="text-xs text-text-muted">Coastal Bloom Salon</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserRound className="h-4 w-4 text-text-muted" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="h-4 w-4 text-text-muted" />
              Help &amp; support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger">
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
