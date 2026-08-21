"use server";

import { signIn, signOut } from "@/server/auth";
import { requireUser } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { clearWorkspaceSelection } from "./workspace";

/**
 * Sign-in and sign-out, as server actions.
 *
 * They delegate to Auth.js rather than setting cookies directly, so the
 * library's own CSRF protection and cookie handling apply. Nothing here reads
 * anything the browser claims about identity.
 */

export async function signInWithGoogle(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeRedirectPath(formData.get("next")) });
}

/**
 * Development sign-in.
 *
 * The provider this calls is not registered in production, so a deployed build
 * has nothing behind this action — it cannot become a back door by being left
 * in the bundle.
 */
export async function signInWithDevelopmentAccount(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  await signIn("development", { email, redirectTo: safeRedirectPath(formData.get("next")) });
}

/**
 * Sign out.
 *
 * Order matters: the workspace cookie is cleared *before* the session ends, so
 * nothing about the last tenant survives into whatever session comes next on
 * this browser. Auth.js then invalidates the session cookie and redirects, and
 * because every page is server-rendered from the session, a back-navigation
 * re-runs the layout and finds no session rather than replaying cached content.
 */
export async function signOutAction(): Promise<void> {
  try {
    const user = await requireUser();
    await recordAuditEvent({ actorUserId: user.id, workspaceId: null, action: "user.signed_out" });
  } catch {
    // Signing out without a valid session is not an error worth surfacing.
  }
  await clearWorkspaceSelection();
  await signOut({ redirectTo: "/sign-in" });
}
