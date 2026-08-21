import "server-only";

import type {
  AuditEvent,
  Invitation,
  User,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRole,
} from "@/types/identity";
import { getDb, type Sql } from "./client";
import { newId } from "./ids";
import type { IdentityRepository } from "./repository";

/**
 * Identity and tenancy, in Postgres.
 *
 * This implements the same `IdentityRepository` interface the in-memory version
 * did, which is the point of having had one: the guards, server actions and
 * authorization tests above it are unchanged by this migration. What changes is
 * only that the rows now survive a restart.
 *
 * Every method still describes an *authorization question* rather than SQL.
 * `findMembership(userId, workspaceId)` is what a guard actually needs to know,
 * and phrasing it that way keeps call sites from fetching a workspace's whole
 * membership list and filtering it themselves — which is how a filter gets
 * forgotten.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const nullableStr = (v: unknown): string | null => (v == null ? null : String(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const nullableIso = (v: unknown): string | null => (v == null ? null : iso(v));

function toUser(row: Row): User {
  return {
    id: str(row.id),
    name: str(row.name),
    email: str(row.email),
    avatarUrl: nullableStr(row.avatar_url),
    jobTitle: str(row.job_title),
    platformRole: row.platform_role === "operator" ? "operator" : "member",
    status: str(row.status) as User["status"],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toWorkspace(row: Row): WorkspaceRecord {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    status: str(row.status) as WorkspaceRecord["status"],
    subscriptionStatus: str(row.subscription_status) as WorkspaceRecord["subscriptionStatus"],
    ownerUserId: str(row.owner_user_id),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMembership(row: Row): WorkspaceMembership {
  return {
    id: str(row.id),
    userId: str(row.user_id),
    workspaceId: str(row.workspace_id),
    role: str(row.role) as WorkspaceRole,
    status: str(row.status) as WorkspaceMembership["status"],
    invitedAt: nullableIso(row.invited_at),
    joinedAt: nullableIso(row.joined_at),
  };
}

function toInvitation(row: Row): Invitation {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    email: str(row.email),
    role: str(row.role) as WorkspaceRole,
    invitedByUserId: str(row.invited_by_user_id),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    status: str(row.status) as Invitation["status"],
  };
}

function toAuditEvent(row: Row): AuditEvent {
  return {
    id: str(row.id),
    actorUserId: nullableStr(row.actor_user_id),
    workspaceId: nullableStr(row.workspace_id),
    action: str(row.action) as AuditEvent["action"],
    targetType: nullableStr(row.target_type),
    targetId: nullableStr(row.target_id),
    timestamp: iso(row.occurred_at),
    metadata: (row.metadata ?? {}) as AuditEvent["metadata"],
  };
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly sqlOverride?: Sql) {}

  private get sql(): Sql {
    return this.sqlOverride ?? getDb();
  }

  async findUserById(id: string): Promise<User | null> {
    const [row] = await this.sql`select * from users where id = ${id}`;
    return row ? toUser(row) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.sql`select * from users where lower(email) = lower(${email})`;
    return row ? toUser(row) : null;
  }

  /**
   * A first sign-in creates an ordinary account: `member`, no memberships.
   *
   * Platform privilege is never granted by signing in — the insert does not set
   * `platform_role` at all, so the column default decides, and no provider
   * profile field can influence it. An existing account keeps its role: the
   * update touches name, avatar and nothing else.
   */
  async upsertUserFromSignIn(input: {
    email: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<User> {
    const name = input.name?.trim() || input.email.split("@")[0];
    const [row] = await this.sql`
      insert into users (id, name, email, avatar_url)
      values (${newId("usr")}, ${name}, ${input.email}, ${input.avatarUrl})
      on conflict (lower(email)) do update
        set name       = excluded.name,
            avatar_url = coalesce(excluded.avatar_url, users.avatar_url)
      returning *`;
    return toUser(row);
  }

  async findWorkspaceById(id: string): Promise<WorkspaceRecord | null> {
    const [row] = await this.sql`select * from workspaces where id = ${id}`;
    return row ? toWorkspace(row) : null;
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    const rows = await this.sql`select * from workspaces order by name`;
    return rows.map(toWorkspace);
  }

  /** Active memberships only. A revoked row must never authorize anything. */
  async findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null> {
    const [row] = await this.sql`
      select * from workspace_memberships
      where user_id = ${userId} and workspace_id = ${workspaceId} and status = 'active'`;
    return row ? toMembership(row) : null;
  }

  async listMembershipsForUser(userId: string): Promise<WorkspaceMembership[]> {
    const rows = await this.sql`
      select * from workspace_memberships where user_id = ${userId} and status = 'active'`;
    return rows.map(toMembership);
  }

  async listMembershipsForWorkspace(workspaceId: string): Promise<WorkspaceMembership[]> {
    const rows = await this.sql`
      select * from workspace_memberships where workspace_id = ${workspaceId} order by role`;
    return rows.map(toMembership);
  }

  async setMembershipRole(membershipId: string, role: WorkspaceRole): Promise<WorkspaceMembership | null> {
    const [row] = await this.sql`
      update workspace_memberships set role = ${role} where id = ${membershipId} returning *`;
    return row ? toMembership(row) : null;
  }

  async createInvitation(input: Omit<Invitation, "id">): Promise<Invitation> {
    const [row] = await this.sql`
      insert into invitations
        (id, workspace_id, email, role, invited_by_user_id, status, created_at, expires_at)
      values
        (${newId("inv")}, ${input.workspaceId}, ${input.email}, ${input.role},
         ${input.invitedByUserId}, ${input.status}, ${input.createdAt}, ${input.expiresAt})
      returning *`;
    return toInvitation(row);
  }

  async listInvitations(workspaceId: string): Promise<Invitation[]> {
    const rows = await this.sql`
      select * from invitations where workspace_id = ${workspaceId} order by created_at desc`;
    return rows.map(toInvitation);
  }

  async revokeInvitation(id: string): Promise<void> {
    await this.sql`update invitations set status = 'revoked' where id = ${id}`;
  }

  /**
   * Append-only, and enforced as such: the runtime role holds INSERT and SELECT
   * on this table and no UPDATE or DELETE, so there is deliberately no method
   * here to amend or remove an event — there could not be a working one.
   */
  async recordAudit(event: Omit<AuditEvent, "id">): Promise<AuditEvent> {
    const [row] = await this.sql`
      insert into audit_events
        (id, actor_user_id, workspace_id, action, target_type, target_id, occurred_at, metadata)
      values
        (${newId("aud")}, ${event.actorUserId}, ${event.workspaceId}, ${event.action},
         ${event.targetType}, ${event.targetId}, ${event.timestamp},
         ${this.sql.json(event.metadata as never)})
      returning *`;
    return toAuditEvent(row);
  }

  async listAudit({ workspaceId, limit = 50 }: { workspaceId?: string; limit?: number }): Promise<AuditEvent[]> {
    const rows = workspaceId
      ? await this.sql`
          select * from audit_events where workspace_id = ${workspaceId}
          order by occurred_at desc limit ${limit}`
      : await this.sql`select * from audit_events order by occurred_at desc limit ${limit}`;
    return rows.map(toAuditEvent);
  }
}

/**
 * The instance the application uses.
 *
 * Constructed eagerly but connects lazily — `getDb()` is resolved per query, so
 * importing this module does not require a configured database.
 */
export const identityRepository: IdentityRepository = new PostgresIdentityRepository();
