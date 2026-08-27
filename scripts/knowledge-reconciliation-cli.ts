import type { User, WorkspaceMembership } from "../src/types/identity";

export interface ReconciliationActorRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  listMembershipsForWorkspace(workspaceId: string): Promise<WorkspaceMembership[]>;
}

export function argument(args: string[], name: string): string {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() ?? "" : "";
}

export function positiveLimit(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

export function connectionMatchesProject(connection: string, expectedProjectRef: string): boolean {
  try {
    const url = new URL(connection);
    const username = decodeURIComponent(url.username);
    return (
      username.endsWith(`.${expectedProjectRef}`) ||
      url.hostname === `db.${expectedProjectRef}.supabase.co`
    );
  } catch {
    return false;
  }
}

export async function resolveActor(
  repository: ReconciliationActorRepository,
  workspaceId: string,
  actorEmail: string,
  resolveActiveOwner: boolean,
): Promise<User | null> {
  if (actorEmail) return repository.findUserByEmail(actorEmail);
  if (!resolveActiveOwner) return null;

  const memberships = await repository.listMembershipsForWorkspace(workspaceId);
  for (const membership of memberships) {
    if (membership.role !== "owner" || membership.status !== "active") continue;
    const candidate = await repository.findUserById(membership.userId);
    if (candidate?.status === "active") return candidate;
  }
  return null;
}

export function safePreviewMetadata(metadata: Record<string, unknown> | null | undefined) {
  const number = (key: string) => {
    const value = metadata?.[key];
    return typeof value === "number" ? value : null;
  };
  return {
    mode: metadata?.mode === "dry_run" ? "dry_run" : null,
    limit: number("limit"),
    eligible: number("eligible"),
    pending: number("pending"),
    error: number("error"),
    syncRequired: number("syncRequired"),
    retryable: number("retryable"),
  };
}
