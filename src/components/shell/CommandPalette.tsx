"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

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

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global search"
      contentClassName={cn(
        "fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2",
        "rounded-xl border border-border bg-surface-raised shadow-xl overflow-hidden focus:outline-none",
        "data-[state=open]:animate-[pop-in_150ms_ease-out]"
      )}
      overlayClassName="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[overlay-in_180ms_ease-out]"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="h-4 w-4 text-text-muted shrink-0" />
        <Command.Input
          placeholder="Search customers, calls, appointments, or navigate..."
          className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border px-1.5 text-[10px] text-text-muted shrink-0">
          Esc
        </kbd>
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-text-muted">No results found.</Command.Empty>
        <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-muted">
          {ALL_NAV_ITEMS.map((item) => (
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
