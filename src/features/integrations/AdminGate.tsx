"use client";

import { usePermissions } from "@/lib/session-context";
import type { Permission } from "@/lib/permissions";
import { AdminDenied } from "./AdminDenied";

/**
 * Hides an admin surface from a role that should not see it.
 *
 * ── This is presentation, not protection ────────────────────────────────────
 * A user who types the URL still loads this route; all this does is refuse to
 * render the contents. That is the correct amount of work for a frontend to do,
 * and it is nowhere near enough on its own.
 *
 * Real enforcement has to live where the data is:
 *
 *     browser → authenticated API → provider adapters → provider
 *
 * When the backend exists it will reject an unauthorised request regardless of
 * what the browser chose to render, and every mutation behind these screens
 * will be checked there. Do not add a route guard and consider the surface
 * secured.
 */
export function AdminGate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = usePermissions();

  if (can(permission)) return <>{children}</>;
  return <AdminDenied />;
}
