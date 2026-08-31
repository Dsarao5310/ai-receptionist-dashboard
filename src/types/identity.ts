/**
 * Identity and tenancy.
 *
 * Three entities, deliberately separate:
 *
 *   • **User** — a person. One account, one email, no role.
 *   • **Workspace** — a tenant. Identity and billing for one business.
 *   • **WorkspaceMembership** — the join, and the *only* place a business role
 *     lives.
 *
 * A role is not a property of a person. The same person can own one business
 * and be staff at another, so attaching a single `role` to `User` would be
 * wrong the first time anyone belongs to two workspaces. The one privilege that
 * genuinely belongs to the person is `platformRole`, because operating the
 * platform is not a fact about any one tenant.
 *
 * `Workspace` is tenancy, not configuration. The business's hours, services,
 * knowledge and receptionist behaviour stay in the configuration document that
 * Business Profile owns. Workspace answers "which tenant, whose, on what plan";
 * Business Profile answers "how does this business operate". Keep the two
 * apart — merging them makes billing and identity depend on someone editing
 * their opening hours.
 */

/**
 * Platform-level privilege, held by the person rather than by any tenant.
 *
 * `operator` is the platform's own staff. `member` is everybody else — the
 * ordinary case, and the default for any account that has not been explicitly
 * elevated.
 */
export type PlatformRole = "operator" | "member";

/**
 * A person's role *within one workspace*.
 *
 * These are product defaults, not immutable policy: what each role may do is
 * defined in one table (`lib/permissions.ts`) precisely so it can be changed
 * without hunting through components.
 */
export type WorkspaceRole = "owner" | "manager" | "staff";

export type AccountStatus = "active" | "invited" | "suspended";

export interface User {
  id: string;
  name: string;
  email: string;
  /** URL or null. Initials are used when absent. */
  avatarUrl: string | null;
  /** Free text the person sets themselves. Presentation only; grants nothing. */
  jobTitle: string;
  platformRole: PlatformRole;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceStatus = "active" | "trialing" | "suspended" | "closed";

export type SubscriptionStatus = "active" | "past_due" | "trialing" | "cancelled";

export interface WorkspaceRecord {
  id: string;
  /** Business name for identity and billing — not the operational profile. */
  name: string;
  slug: string;
  status: WorkspaceStatus;
  subscriptionStatus: SubscriptionStatus;
  /** The user who owns the tenancy. Always has an `owner` membership too. */
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export type MembershipStatus = "active" | "invited" | "revoked";

export interface WorkspaceMembership {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  invitedAt: string | null;
  joinedAt: string | null;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

// ── Audit ───────────────────────────────────────────────────────────────────

export type AuditAction =
  | "user.signed_in"
  | "user.signed_out"
  | "membership.added"
  | "membership.removed"
  | "membership.role_changed"
  | "workspace.switched"
  | "workspace.settings_changed"
  | "integration.connected"
  | "integration.disconnected"
  | "integration.tested"
  | "workflow.reassigned"
  | "workflow.operation_invoked"
  | "workflow.operation_failed"
  | "workflow.operation_requires_sync"
  | "workflow.event_received"
  | "workflow.event_rejected"
  | "vapi.event_received"
  | "vapi.event_rejected"
  | "email.event_received"
  | "email.event_rejected"
  | "calendar.connected"
  | "calendar.disconnected"
  | "calendar.calendar_selected"
  | "calendar.event_created"
  | "calendar.event_rescheduled"
  | "calendar.event_cancelled"
  | "calendar.external_change_detected"
  | "calendar.reconciled"
  | "knowledge.reconciliation_previewed"
  | "knowledge.reconciliation_started"
  | "knowledge.reconciliation_completed"
  | "knowledge.reconciliation_failed"
  | "business_profile.changed"
  | "ai_configuration.changed"
  | "privacy.policy_changed"
  | "privacy.erasure_requested"
  | "privacy.erasure_identity_verified"
  | "privacy.erasure_rejected"
  | "privacy.content_erased"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.restored"
  | "invitation.created"
  | "invitation.revoked";

/**
 * A security-relevant thing that happened.
 *
 * Enough to answer "who did what, to what, in which tenant, when" — a product
 * audit trail, not a SIEM. `metadata` is for small, safe descriptors: ids,
 * names, before/after of non-sensitive fields. Never a credential, a token, or
 * a raw provider payload.
 */
export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  /** Null for platform-level actions that belong to no single tenant. */
  workspaceId: string | null;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  timestamp: string;
  metadata: Record<string, string | number | boolean | null>;
}

// ── Resolved session ────────────────────────────────────────────────────────

/**
 * What a verified session yields after the server has resolved it.
 *
 * Built on the server from the signed session cookie plus a membership lookup —
 * never from anything the browser sent in a request body or query string. The
 * client receives this as read-only data; it has no setter.
 */
export interface AuthenticatedSession {
  user: Pick<User, "id" | "name" | "email" | "avatarUrl" | "platformRole">;
  /** The workspace this request is operating in, after authorization. */
  workspaceId: string;
  /** Role in that workspace. Null for a platform operator acting without membership. */
  workspaceRole: WorkspaceRole | null;
  /** Workspaces this user may enter. Platform operators see all active ones. */
  availableWorkspaces: { id: string; name: string; role: WorkspaceRole | null }[];
}
