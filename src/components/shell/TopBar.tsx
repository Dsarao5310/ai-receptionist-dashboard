"use client";

import { Search, ChevronDown, LogOut, UserRound, HelpCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import Link from "next/link";
import { AppearanceMenu } from "./AppearanceMenu";
import { NotificationCenter } from "./NotificationCenter";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useOptionalSession } from "@/lib/session-context";
import { WORKSPACE_ROLE_LABELS } from "@/lib/permissions";
import { signOutAction } from "@/server/actions/auth";

export function TopBar({ title }: { title?: string }) {
  const session = useOptionalSession();
  const workspaceName =
    session?.availableWorkspaces.find((w) => w.id === session.workspaceId)?.name ?? "";
  const roleLabel = session?.workspaceRole
    ? WORKSPACE_ROLE_LABELS[session.workspaceRole]
    : session?.user.platformRole === "operator"
      ? "Platform operator"
      : null;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 backdrop-blur px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {title && <h1 className="truncate text-[15px] font-semibold text-text-primary">{title}</h1>}
      </div>

      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        aria-label="Search"
        /* Icon-only below `sm`. At 375px the old fixed 160px box left the
           heading about 40 pixels, so every page title rendered as "Ov…". */
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md pl-1 pr-2 h-9 hover:bg-surface-hover transition-colors ml-1"
              aria-label="Account menu"
            >
              <Avatar name={session?.user.name ?? "?"} size="sm" />
              <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2.5 py-2">
              <p className="text-sm font-medium text-text-primary">{session?.user.name}</p>
              <p className="truncate text-xs text-text-muted">{session?.user.email}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {workspaceName}
                {roleLabel && ` · ${roleLabel}`}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserRound className="h-4 w-4 text-text-muted" />
                Account settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="h-4 w-4 text-text-muted" />
              Help &amp; support
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
    </header>
  );
}
