"use client";

import { createContext, useContext, useMemo } from "react";
import type { AuthenticatedSession } from "@/types/identity";
import { can, canAny, isPlatformOperator, type Permission } from "@/lib/permissions";

/**
 * The verified session, as the client sees it.
 *
 * ── Read-only, by construction ──────────────────────────────────────────────
 * This replaces the editable session store the demo used. There is no setter:
 * the value is resolved on the server by `getAuthenticatedSession()` and passed
 * down as props, so the browser cannot promote itself, change its workspace, or
 * invent a role. Anything it *did* change would still be ignored — every read
 * and write re-derives authority in `server/auth/guards.ts`.
 *
 * ── Why this also fixes hydration ───────────────────────────────────────────
 * Because the value is server-rendered and handed down, the server and the
 * first client render agree by definition. There is no persisted store to
 * rehydrate into a different user, and no window where a seeded identity is
 * shown before the real one arrives.
 *
 * What this context is for is deciding what to *render*. It is not security.
 */
const SessionContext = createContext<AuthenticatedSession | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: AuthenticatedSession | null;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Null when signed out. Components inside the app shell can assume non-null. */
export function useOptionalSession(): AuthenticatedSession | null {
  return useContext(SessionContext);
}

export function useSession(): AuthenticatedSession {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession requires an authenticated session; use useOptionalSession outside the app shell.");
  }
  return session;
}

export interface SessionPermissions {
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  isPlatformOperator: boolean;
}

/** Permission helpers bound to the current session's roles. */
export function usePermissions(): SessionPermissions {
  const session = useOptionalSession();

  return useMemo(() => {
    const context = {
      platformRole: session?.user.platformRole ?? ("member" as const),
      workspaceRole: session?.workspaceRole ?? null,
    };
    return {
      can: (permission: Permission) => (session ? can(context, permission) : false),
      canAny: (permissions: Permission[]) => (session ? canAny(context, permissions) : false),
      isPlatformOperator: session ? isPlatformOperator(context) : false,
    };
  }, [session]);
}
