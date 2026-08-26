"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, User } from "lucide-react";
import { getNavGroups } from "@/lib/nav-config";
import { useOptionalSession } from "@/lib/session-context";
import { useWorkspaceData } from "@/lib/workspace-data";
import { normalizePhone } from "@/services/customers";
import { cn } from "@/lib/utils";

const MAX_CUSTOMER_RESULTS = 6;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  // Same role filter as the sidebar, so the palette cannot become a back door
  // into admin routes for a role that has no business seeing them listed.
  const session = useOptionalSession();
  const allNavItems = getNavGroups({
    platformRole: session?.user.platformRole ?? "member",
    workspaceRole: session?.workspaceRole ?? null,
  }).flatMap((g) => g.items);

  // cmdk's own built-in fuzzy filter (against each Command.Item's `value`)
  // runs independently of the filtering below and can hide a result this
  // component already decided is a match — e.g. a phone-number query scores
  // 0 against a `value` that only contains the customer's name. Rather than
  // keep two filters in sync, `shouldFilter={false}` on Command.Dialog turns
  // cmdk's off entirely and this component is the single source of truth for
  // what matches, for both groups.
  const q = query.trim().toLowerCase();
  const navItems = q
    ? allNavItems.filter((item) => item.label.toLowerCase().includes(q))
    : allNavItems;

  // Customers are the one record type with a proven, working deep link
  // (`/customers?open=id` opens straight to the drawer — already used by
  // Conversations/Calls rows). Calls, appointments, and conversations don't
  // have an equivalent free-text query param on their list pages, so this
  // deliberately does not promise searching those yet rather than linking
  // somewhere that doesn't actually filter.
  //
  // Phone matching reuses the same digit-normalization as the Customers page
  // search (services/customers.ts) rather than a raw substring compare, so a
  // query like "5550192" finds a customer stored as "(555) 019-2000" instead
  // of being a second, subtly different phone search from the one on
  // /customers.
  const { liveDataset } = useWorkspaceData();
  const customerMatches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || !liveDataset) return [];
    const digits = normalizePhone(trimmed);
    return liveDataset.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(trimmed) ||
          c.email.toLowerCase().includes(trimmed) ||
          (digits.length > 0 && normalizePhone(c.phone).includes(digits))
      )
      .slice(0, MAX_CUSTOMER_RESULTS);
  }, [liveDataset, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      label="Global search"
      contentClassName={cn(
        "fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2",
        "rounded-xl border border-border bg-surface-raised shadow-xl overflow-hidden focus:outline-none",
        "data-[state=open]:animate-[pop-in_150ms_ease-out]"
      )}
      overlayClassName="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[overlay-in_180ms_ease-out]"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="h-4 w-4 text-text-muted shrink-0" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search customers, or navigate..."
          className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border px-1.5 text-[10px] text-text-muted shrink-0">
          Esc
        </kbd>
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-text-muted">No results found.</Command.Empty>
        {customerMatches.length > 0 && (
          <Command.Group heading="Customers" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-muted">
            {customerMatches.map((customer) => (
              <Command.Item
                key={customer.id}
                value={`customer-${customer.id}-${customer.name}`}
                onSelect={() => go(`/customers?open=${customer.id}`)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-primary cursor-pointer data-[selected=true]:bg-surface-hover"
              >
                <User className="h-4 w-4 text-text-muted shrink-0" />
                <span className="min-w-0 flex-1 truncate">{customer.name}</span>
                <span className="shrink-0 text-xs text-text-muted">{customer.phone}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-muted">
          {navItems.map((item) => (
            <Command.Item
              key={item.href}
              value={item.label}
              onSelect={() => go(item.href)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-primary cursor-pointer data-[selected=true]:bg-surface-hover"
            >
              <item.icon className="h-4 w-4 text-text-muted" />
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
