import type { User, WorkspaceRole } from "@/types/identity";
import { isPlatformOperator } from "@/lib/permissions";
import type { IdentityRepository } from "@/server/db/repository";
import { identityRepository } from "@/server/db/identity";

/**
 * Authorization policy: the decisions, with no session plumbing attached.
 *
 * ── Why this is a separate file ─────────────────────────────────────────────
 * Everything here is a pure function of a user, a requested workspace and the
 * repository. It does not read a cookie, call Auth.js, or touch a request. That
 * makes the actual policy — who may enter which tenant — directly testable, and
 * it means the tests exercise the same code a real request does rather than a
 * reimplementation of it.
 *
 * `guards.ts` is the thin layer above: it gets the caller from the verified
 * session and then calls straight into these functions. The split is deliberate
 * — session handling is plumbing that changes with the auth library, and the
 * tenancy rules should not have to move when it does.
 */

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly publicMessage = "Please sign in to continue.";
  constructor(readonly reason: string = "no_session") {
    super("Not authenticated");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;
  /**
   * The only thing a client is ever told. It does not distinguish "no such
   * workspace" from "not a member of that workspace", because the difference
   * would confirm a tenant's existence to someone with no right to know.
   */
  readonly publicMessage = "Access denied.";
  constructor(readonly reason: string) {
    super("Access denied");
    this.name = "AuthorizationError";
  }
}

export interface AuthContext {
  user: User;
  workspaceId: string;
  workspaceRole: WorkspaceRole | null;
}

/**
 * Every workspace this user may enter.
 *
 * A platform operator may enter any open workspace; that privilege comes from
 * `platformRole` rather than from silently enrolling operators as members of
 * every tenant. Everyone else gets exactly their active memberships — which is
 * also why a client can never enumerate tenants: the list is derived from
 * membership, not filtered down from a fuller one.
 */
export async function listAuthorizedWorkspaces(
  user: User,
  repo: IdentityRepository = identityRepository
): Promise<{ id: string; name: string; role: WorkspaceRole | null }[]> {
  if (isPlatformOperator(user)) {
    const all = await repo.listAllWorkspaces();
    return all.filter((w) => w.status !== "closed").map((w) => ({ id: w.id, name: w.name, role: null }));
  }

  const memberships = await repo.listMembershipsForUser(user.id);
  const resolved = await Promise.all(
    memberships.map(async (m) => {
      const workspace = await repo.findWorkspaceById(m.workspaceId);
      return workspace && workspace.status !== "closed"
        ? { id: workspace.id, name: workspace.name, role: m.role }
        : null;
    })
  );
  return resolved.filter((w): w is { id: string; name: string; role: WorkspaceRole } => w !== null);
}

/**
 * Authorize a user for one workspace.
 *
 * The requested id is only ever a request. Membership decides — except for a
 * platform operator, whose authority is checked against the workspace actually
 * existing and being open.
 */
export async function authorizeWorkspace(
  user: User,
  requestedWorkspaceId: string,
  repo: IdentityRepository = identityRepository
): Promise<AuthContext> {
  const workspace = await repo.findWorkspaceById(requestedWorkspaceId);

  if (isPlatformOperator(user)) {
    // Same opaque failure a non-member would get: an operator with a typo is
    // not told which ids exist either.
    if (!workspace || workspace.status === "closed") throw new AuthorizationError("workspace_unavailable");
    const membership = await repo.findMembership(user.id, requestedWorkspaceId);
    return { user, workspaceId: workspace.id, workspaceRole: membership?.role ?? null };
  }

  const membership = await repo.findMembership(user.id, requestedWorkspaceId);
  // Deliberately one branch: "no such workspace" and "not a member" are
  // indistinguishable from outside.
  if (!workspace || workspace.status === "closed" || !membership) {
    throw new AuthorizationError("no_membership");
  }
  return { user, workspaceId: workspace.id, workspaceRole: membership.role };
}
