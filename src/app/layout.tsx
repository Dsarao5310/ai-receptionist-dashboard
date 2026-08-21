import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/shell/ThemeScript";
import { PreferencesSync } from "@/components/shell/PreferencesSync";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Toaster } from "@/components/ui/Toaster";
import { unstable_rethrow } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ServiceUnavailable } from "@/components/shell/ServiceUnavailable";
import { WorkspaceDataProvider } from "@/lib/workspace-data";
import { WorkspaceStoresProvider } from "@/lib/store/workspace-stores";
import { SessionProvider } from "@/lib/session-context";
import { getAuthenticatedSession, requireWorkspace } from "@/server/auth/guards";
import { loadWorkspaceDashboard, type WorkspaceDashboardData } from "@/server/workspace-data";
import { isDatabaseReachable } from "@/server/db/client";
import type { AuthenticatedSession } from "@/types/identity";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Every page under this layout depends on the verified session and the
 * authorized workspace, so none of them may be statically prerendered — a
 * cached page would be one tenant's data served to whoever asked next.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Receptionist AI — Dashboard",
  description: "Manage your AI receptionist's calls, conversations, and appointments.",
};

/**
 * Session and workspace data are both resolved on the server and passed down.
 *
 * ── Why the data loads here ─────────────────────────────────────────────────
 * Overview, Analytics, Customers and Appointments are four views of one
 * dataset. Loading it once at the layout and handing it down keeps them
 * consistent with each other by construction, and means client-side navigation
 * between them costs nothing — the layout is not re-rendered when only the page
 * changes.
 *
 * ── Why it keeps hydration deterministic ────────────────────────────────────
 * The markup React renders on the server and the markup it hydrates on the
 * client are built from the same values. There is no window in which seeded
 * placeholder data is shown and then swapped for the real thing, and no store
 * reading local storage behind React's back. It is also why the client has no
 * way to change any of it: what arrives is data, not a store.
 *
 * ── Failure is visible ──────────────────────────────────────────────────────
 * A signed-out visitor and an unreachable database are different answers and
 * get different pages. The first sees sign-in; the second sees an outage notice
 * that says their session is fine. Neither falls back to generating a
 * plausible-looking business in the browser.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  let session: AuthenticatedSession | null = null;
  let data: WorkspaceDashboardData | null = null;
  let unavailable = false;

  try {
    session = await getAuthenticatedSession();

    // No session may mean signed out — or it may mean the database that holds
    // the sessions is unreachable, because Auth.js swallows that error and
    // reports the same thing. Check before sending anyone to sign in.
    if (!session) unavailable = !(await isDatabaseReachable());

    if (session) {
      // Re-resolved rather than reusing the session's id as a bare string: the
      // loader takes an authorized context, and this is where one comes from.
      const context = await requireWorkspace();
      data = await loadWorkspaceDashboard(context);
    }
  } catch (error) {
    // Next signals redirects and not-found by throwing; those must keep going.
    unstable_rethrow(error);
    // Anything left is the storage layer failing. Say so — do not present it as
    // an expired session, and do not fall back to inventing a business.
    unavailable = true;
  }

  if (unavailable) {
    return (
      <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <head>
          <ThemeScript />
        </head>
        <body className="min-h-full bg-page text-text-primary">
          <ServiceUnavailable />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full bg-page text-text-primary">
        <PreferencesSync />
        <TooltipProvider>
          <SessionProvider session={session}>
            <WorkspaceStoresProvider data={data} session={session}>
              <WorkspaceDataProvider dataset={data?.dataset ?? null}>
                <AppShell session={session}>{children}</AppShell>
              </WorkspaceDataProvider>
            </WorkspaceStoresProvider>
          </SessionProvider>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
