"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AuthenticationError, AuthorizationError, WORKSPACE_COOKIE, authorizeWorkspace, requireUser } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";

/**
 * Switch the workspace this session operates in.
 *
 * ── The selector is not the authorization ───────────────────────────────────
 * A dropdown is a request. This action re-derives the caller from the verified
 * session and puts the requested workspace through `authorizeWorkspace` before
 * anything is written. A user who edits the request to name a workspace they
 * have no membership in is refused with the same opaque message they would get
 * for a workspace that does not exist.
 *
 * ── Why the cookie is httpOnly ──────────────────────────────────────────────
 * The scoping cookie is set here, server-side, and cannot be read or forged
 * from JavaScript. Even so, nothing trusts it: `requireWorkspace` re-authorizes
 * whatever it contains on every request, so a stolen or hand-crafted value
 * grants nothing.
 *
 * ── Cross-tenant flashes ────────────────────────────────────────────────────
 * `revalidatePath("/", "layout")` drops the cached render for every route, so
 * the next paint is built from the new workspace rather than showing the
 * previous business's data under the new business's name.
 */
export async function switchWorkspace(workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const context = await authorizeWorkspace(user, workspaceId);

    const cookieStore = await cookies();
    cookieStore.set(WORKSPACE_COOKIE, context.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    await recordAuditEvent({
      actorUserId: user.id,
      workspaceId: context.workspaceId,
      action: "workspace.switched",
      targetType: "workspace",
      targetId: context.workspaceId,
    });

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
      return { ok: false, error: error.publicMessage };
    }
    throw error;
  }
}

/** Clears workspace scoping. Called on sign-out so nothing survives into the next session. */
export async function clearWorkspaceSelection(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(WORKSPACE_COOKIE);
}
