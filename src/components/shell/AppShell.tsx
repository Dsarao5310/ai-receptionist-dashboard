"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { CommandPalette } from "./CommandPalette";
import { ALL_NAV_ITEMS } from "@/lib/nav-config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = ALL_NAV_ITEMS.find((i) => i.href === pathname)?.label;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <MobileBottomNav />
      <CommandPalette />
    </div>
  );
}
