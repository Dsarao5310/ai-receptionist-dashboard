import "server-only";

import { cookies } from "next/headers";
import type { AuthenticatedSession, User } from "@/types/identity";
import { can, isPlatformOperator, type Permission } from "@/lib/permissions";
import type { IdentityRepository } from "@/server/db/repository";
import { identityRepository } from "@/server/db/identity";
import { auth } from "./index";
import {
  AuthenticationError,
  AuthorizationError,
  authorizeWorkspace,
  listAuthorizedWorkspaces,
  type AuthContext,
} from "./policy";

/**
 * The security boundary: session in, authorized context out.
 *
 * ── The order every protected operation follows ─────────────────────────────
 *
 *     verify the session  →  resolve membership  →  check the permission
 *                                                    →  act, scoped to the
 *                                                       authorized workspace
 *
 * Nothing skips a step, and nothing takes a shortcut through data the client
 * sent. A `workspaceId` arriving in a request body, query string or cookie is
 * treated as a *request for context*, never as proof of access — it goes
 * through `authorizeWorkspace` every time. That is what stops one tenant
 * reading another's records by editing an id.
 *
 * ── What is not security ────────────────────────────────────────────────────
 * The navigation filter, `AdminGate` and Proxy decide what to render
 * or where to redirect. They are convenience. What actually protects a route is
 * that every read and write behind it comes through this file.
 *
 * The policy itself lives in `./policy.ts` so it can be tested without a
 * request; this module only adds the session and the cookie.
 */

export { AuthenticationError, AuthorizationError } from "./policy";
export type { AuthContext } from "./policy";
export { authorizeWorkspace, listAuthorizedWorkspaces } from "./policy";

/** The cookie holding the workspace this session has selected. */
export const WORKSPACE_COOKIE = "rc_workspace";

/**
 * The signed-in user, or a thrown error.
 *
 * Reads the verified Auth.js session and re-loads the account, so a deleted or
 * suspended user cannot keep operating on a still-valid cookie.
 */
export async function requireUser(repo: IdentityRepository = identityRepository): Promise<User> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthenticationError("no_session");

  const user = await repo.findUserById(userId);
  if (!user) throw new AuthenticationError("user_not_found");
  if (user.status !== "active") throw new AuthorizationError("account_not_active");
  return user;
}

/**
 * The workspace this request operates in.
 *
 * Resolution order: an explicitly requested id, then the workspace cookie, then
 * the user's first authorized workspace. Every path ends in
 * `authorizeWorkspace`, so none of them can widen access — an unauthorized
 * cookie value is rejected exactly like an unauthorized parameter.
 */
export async function requireWorkspace(
  requestedWorkspaceId?: string,
  repo: IdentityRepository = identityRepository
): Promise<AuthContext> {
  const user = await requireUser(repo);

  if (requestedWorkspaceId) return authorizeWorkspace(user, requestedWorkspaceId, repo);

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(WORKSPACE_COOKIE)?.value;
  if (fromCookie) {
    try {
      return await authorizeWorkspace(user, fromCookie, repo);
    } catch {
      // A stale or tampered cookie falls through to the default rather than
      // failing the request outright. It grants nothing either way.
    }
  }

  const available = await listAuthorizedWorkspaces(user, repo);
  if (available.length === 0) throw new AuthorizationError("no_workspaces");
  return authorizeWorkspace(user, available[0].id, repo);
}

/**
 * Authorize a specific permission in a specific workspace.
 *
 * This is the call every protected read and write should make. It returns the
 * authorized context so the caller can scope its query by
 * `context.workspaceId` — the authorized value, never the requested one.
 */
export async function requirePermission(
  permission: Permission,
  requestedWorkspaceId?: string,
  repo: IdentityRepository = identityRepository
): Promise<AuthContext> {
  const context = await requireWorkspace(requestedWorkspaceId, repo);
  const allowed = can({ platformRole: context.user.platformRole, workspaceRole: context.workspaceRole }, permission);
  if (!allowed) throw new AuthorizationError(`missing_permission:${permission}`);
  return context;
}

/**
 * Platform-operator authority, independent of any workspace.
 *
 * A business owner never passes this check, however complete their authority
 * over their own business.
 */
export async function requirePlatformOperator(repo: IdentityRepository = identityRepository): Promise<User> {
  const user = await requireUser(repo);
  if (!isPlatformOperator(user)) throw new AuthorizationError("not_platform_operator");
  return user;
}

/**
 * The read-only session shape a client component may safely receive.
 *
 * Null means *not signed in*, and only that. Anything else — a database that
 * cannot be reached, a bug in a repository — is rethrown rather than folded
 * into the same answer.
 *
 * The distinction matters more than it looks. Swallowing everything here sent a
 * user with a perfectly good session to the sign-in page saying "your session
 * has ended" whenever the database was down: a misleading message, an action
 * that cannot help, and an outage disguised as an expiry. The caller decides
 * what to show; this only reports whether there is a session.
 */
export async function getAuthenticatedSession(
  repo: IdentityRepository = identityRepository
): Promise<AuthenticatedSession | null> {
  try {
    const context = await requireWorkspace(undefined, repo);
    return {
      user: {
        id: context.user.id,
        name: context.user.name,
        email: context.user.email,
        avatarUrl: context.user.avatarUrl,
        platformRole: context.user.platformRole,
      },
      workspaceId: context.workspaceId,
      workspaceRole: context.workspaceRole,
      availableWorkspaces: await listAuthorizedWorkspaces(context.user, repo),
    };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return null;
    // Not a signed-out user. Let it surface.
    throw error;
  }
}
