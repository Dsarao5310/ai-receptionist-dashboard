"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useOptionalSession } from "@/lib/session-context";
import { toast } from "@/lib/store/toast";
import { switchWorkspace } from "@/server/actions/workspace";
import { cn } from "@/lib/utils";

/**
 * Switch which business this session is looking at.
 *
 * Only rendered when the session actually has more than one authorized
 * workspace — a business owner with a single business never sees it, and a
 * client user's list contains only businesses they are a member of, so it can
 * never become a way to discover other tenants.
 *
 * The selection is a *request*. `switchWorkspace` re-verifies authority on the
 * server before setting the scoping cookie, and revalidates every route so the
 * next paint is built from the new workspace rather than briefly showing the
 * previous business's data under the new business's name.
 */
export function WorkspaceSwitcher() {
  const session = useOptionalSession();
  const [switching, startSwitch] = useTransition();

  if (!session || session.availableWorkspaces.length < 2) return null;

  const current = session.availableWorkspaces.find((w) => w.id === session.workspaceId);

  function select(workspaceId: string) {
    if (workspaceId === session?.workspaceId) return;
    startSwitch(async () => {
      const result = await switchWorkspace(workspaceId);
      if (!result.ok) toast("Could not switch workspace", { description: result.error });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="hidden items-center gap-2 rounded-md border border-border px-2.5 h-9 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:flex"
          aria-label="Switch workspace"
          disabled={switching}
        >
          <Building2 className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          <span className="max-w-[10rem] truncate">{current?.name ?? "Select workspace"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Workspaces you can access</DropdownMenuLabel>
        {session.availableWorkspaces.map((workspace) => {
          const active = workspace.id === session.workspaceId;
          return (
            <DropdownMenuItem key={workspace.id} onSelect={() => select(workspace.id)}>
              <Check className={cn("h-4 w-4", active ? "text-accent-text" : "opacity-0")} aria-hidden="true" />
              <span className="truncate">{workspace.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
