import "server-only";

import type {
  AuditEvent,
  Invitation,
  User,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRole,
} from "@/types/identity";
import { DEV_AUDIT, DEV_MEMBERSHIPS, DEV_USERS, DEV_WORKSPACES } from "./fixtures";

/**
 * Persistence, behind an interface.
 *
 * ── Why an interface ────────────────────────────────────────────────────────
 * Everything above this file talks to `IdentityRepository` rather than to a
 * database. That was written before one existed, and it paid for itself: the
 * production implementation is now Postgres (`db/identity.ts`) and not one
 * guard, server action or authorization test changed to get there.
 *
 * The in-memory implementation below stays, for unit tests that exercise
 * authorization policy without needing a database round trip. It is not used by
 * the application.
 *
 * The method names describe *authorization questions*, not SQL. That is
 * deliberate: `findMembership(userId, workspaceId)` is what a guard actually
 * needs to know, and expressing it that way stops call sites from fetching a
 * whole workspace and filtering it themselves.
 *
 * ── `server-only` ───────────────────────────────────────────────────────────
 * The import at the top makes it a build error to pull this into a client
 * bundle. Identity rows, memberships and the audit trail must never be
 * shipped to a browser wholesale — a client receives only the narrow,
 * already-authorized `AuthenticatedSession`.
 *
 * ── The schema this models ──────────────────────────────────────────────────
 * See `supabase/migrations/0001_identity.sql`. Provider credentials appear
 * nowhere in it: they belong in a secrets store the application reads through a
 * separate, server-only path — never in a table a client-facing query could
 * join against.
 */
export interface IdentityRepository {
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  upsertUserFromSignIn(input: { email: string; name: string; avatarUrl: string | null }): Promise<User>;

  findWorkspaceById(id: string): Promise<WorkspaceRecord | null>;
  listAllWorkspaces(): Promise<WorkspaceRecord[]>;

  /** The single membership lookup every authorization decision funnels through. */
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>;
  listMembershipsForUser(userId: string): Promise<WorkspaceMembership[]>;
  listMembershipsForWorkspace(workspaceId: string): Promise<WorkspaceMembership[]>;
  setMembershipRole(membershipId: string, role: WorkspaceRole): Promise<WorkspaceMembership | null>;

  createInvitation(input: Omit<Invitation, "id">): Promise<Invitation>;
  listInvitations(workspaceId: string): Promise<Invitation[]>;
  revokeInvitation(id: string): Promise<void>;

  recordAudit(event: Omit<AuditEvent, "id">): Promise<AuditEvent>;
  listAudit(filter: { workspaceId?: string; limit?: number }): Promise<AuditEvent[]>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In-memory implementation for development and tests.
 *
 * Rows are cloned on the way out so a caller cannot mutate the store by
 * holding onto a returned object — the same discipline a real driver gives for
 * free, and worth keeping so tests behave like production will.
 */
export class InMemoryIdentityRepository implements IdentityRepository {
  private users: User[];
  private workspaces: WorkspaceRecord[];
  private memberships: WorkspaceMembership[];
  private invitations: Invitation[];
  private audit: AuditEvent[];

  constructor(seed?: {
    users?: User[];
    workspaces?: WorkspaceRecord[];
    memberships?: WorkspaceMembership[];
    invitations?: Invitation[];
    audit?: AuditEvent[];
  }) {
    this.users = clone(seed?.users ?? DEV_USERS);
    this.workspaces = clone(seed?.workspaces ?? DEV_WORKSPACES);
    this.memberships = clone(seed?.memberships ?? DEV_MEMBERSHIPS);
    this.invitations = clone(seed?.invitations ?? []);
    this.audit = clone(seed?.audit ?? DEV_AUDIT);
  }

  async findUserById(userId: string) {
    return clone(this.users.find((u) => u.id === userId) ?? null);
  }

  async findUserByEmail(email: string) {
    const match = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return clone(match ?? null);
  }

  async upsertUserFromSignIn({ email, name, avatarUrl }: { email: string; name: string; avatarUrl: string | null }) {
    const existing = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const now = new Date().toISOString();

    if (existing) {
      existing.name = name || existing.name;
      existing.avatarUrl = avatarUrl ?? existing.avatarUrl;
      existing.updatedAt = now;
      return clone(existing);
    }

    // A brand-new account is an ordinary business user with no memberships.
    // Platform privilege is never granted by signing in; it is assigned.
    const created: User = {
      id: id("usr"),
      name: name || email.split("@")[0],
      email,
      avatarUrl,
      jobTitle: "",
      platformRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(created);
    return clone(created);
  }

  async findWorkspaceById(workspaceId: string) {
    return clone(this.workspaces.find((w) => w.id === workspaceId) ?? null);
  }

  async listAllWorkspaces() {
    return clone(this.workspaces);
  }

  async findMembership(userId: string, workspaceId: string) {
    const match = this.memberships.find(
      (m) => m.userId === userId && m.workspaceId === workspaceId && m.status === "active"
    );
    return clone(match ?? null);
  }

  async listMembershipsForUser(userId: string) {
    return clone(this.memberships.filter((m) => m.userId === userId && m.status === "active"));
  }

  async listMembershipsForWorkspace(workspaceId: string) {
    return clone(this.memberships.filter((m) => m.workspaceId === workspaceId));
  }

  async setMembershipRole(membershipId: string, role: WorkspaceRole) {
    const membership = this.memberships.find((m) => m.id === membershipId);
    if (!membership) return null;
    membership.role = role;
    return clone(membership);
  }

  async createInvitation(input: Omit<Invitation, "id">) {
    const created: Invitation = { ...input, id: id("inv") };
    this.invitations.push(created);
    return clone(created);
  }

  async listInvitations(workspaceId: string) {
    return clone(this.invitations.filter((i) => i.workspaceId === workspaceId));
  }

  async revokeInvitation(invitationId: string) {
    const invitation = this.invitations.find((i) => i.id === invitationId);
    if (invitation) invitation.status = "revoked";
  }

  async recordAudit(event: Omit<AuditEvent, "id">) {
    const created: AuditEvent = { ...event, id: id("aud") };
    this.audit.unshift(created);
    // Bounded: this is a product audit trail, not a log platform.
    this.audit = this.audit.slice(0, 500);
    return clone(created);
  }

  async listAudit({ workspaceId, limit = 50 }: { workspaceId?: string; limit?: number }) {
    const rows = workspaceId ? this.audit.filter((e) => e.workspaceId === workspaceId) : this.audit;
    return clone(rows.slice(0, limit));
  }
}
