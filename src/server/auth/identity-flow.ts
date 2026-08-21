import "server-only";

import type { User } from "@/types/identity";
import type { IdentityRepository } from "@/server/db/repository";
import { identityRepository } from "@/server/db/identity";
import { listAuthorizedWorkspaces } from "./policy";

/**
 * Resolve an external identity into an account that may enter the application.
 *
 * A provider proves control of an email address, not membership in a tenant.
 * New identities may be recorded as ordinary members for a future invitation
 * flow, but Auth.js receives success only when the account is active and has an
 * authorized workspace (or is an explicitly assigned platform operator).
 */
export async function resolveSignInUser(
  profile: { email: string; name: string; avatarUrl: string | null },
  repo: IdentityRepository = identityRepository
): Promise<User | null> {
  const record = await repo.upsertUserFromSignIn(profile);
  if (record.status !== "active") return null;

  const workspaces = await listAuthorizedWorkspaces(record, repo);
  return workspaces.length > 0 ? record : null;
}
