"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { CommandPalette } from "./CommandPalette";
import { findNavItem } from "@/lib/nav-config";
import type { AuthenticatedSession } from "@/types/identity";

/** Routes that render without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/sign-in"];

/**
 * The application chrome, shown only to a signed-in session.
 *
 * Public pages (sign-in) render bare — they are full-page and should not be
 * wrapped in navigation belonging to a workspace the visitor may not be in.
 *
 * An authenticated route reached *without* a session renders nothing at all.
 * Middleware will already be redirecting to sign-in; rendering the page anyway
 * would run components that legitimately assume a session and throw, which is a
 * worse experience than a blank frame for one paint.
 */
export function AppShell({ session, children }: { session: AuthenticatedSession | null; children: React.ReactNode }) {
  const pathname = usePathname();
  // Prefix-aware, so a nested route such as /customers/abc keeps its heading
  // instead of silently rendering no <h1> at all.
  const title = findNavItem(pathname)?.label;

  if (!session) {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? <>{children}</> : null;
  }

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
