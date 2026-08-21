import type { PlatformRole, WorkspaceRole } from "@/types/identity";

/**
 * The permission vocabulary, in one table.
 *
 * ── The rule this file exists to enforce ────────────────────────────────────
 * Platform privileges and business privileges are different in kind, not in
 * degree. A business owner has complete authority over their own business and
 * *no* authority over the platform that runs it: no provider credentials, no
 * workflow engine, no other tenants, no platform logs. That is not a matter of
 * having fewer permissions — it is a separate axis.
 *
 * So permissions come from two independent sources:
 *
 *   • **workspace role** (owner / manager / staff) → business permissions,
 *     scoped to the one workspace the membership is for.
 *   • **platform role** (operator) → platform permissions, which no workspace
 *     role can ever grant.
 *
 * `PLATFORM_ONLY` and the workspace table are disjoint, and a test asserts it.
 * That is what stops an owner reaching provider configuration by acquiring a
 * broader business role.
 *
 * ── This module decides nothing on its own ──────────────────────────────────
 * It is a pure lookup, shared by client and server. The client uses it to
 * decide what to *render*; the server uses it, behind `requirePermission`, to
 * decide what to *allow*. Only the second one is security — a hidden nav item
 * stops nobody who can type a URL, and the browser's copy of a role is a
 * suggestion, not a fact.
 *
 * ── These are product defaults ──────────────────────────────────────────────
 * Which role gets what is a product decision that will change. It lives here so
 * that changing it is a one-file edit rather than an audit of every component.
 */

export type Permission =
  // Business: reading
  | "overview.view"
  | "conversations.view"
  | "calls.view"
  | "appointments.view"
  | "customers.view"
  | "analytics.view"
  | "connections.view"
  // Business: changing
  | "appointments.manage"
  | "ai.configure"
  | "business.edit"
  | "settings.business"
  | "team.manage"
  // Platform only — never granted by a workspace role
  | "integrations.view"
  | "integrations.manage"
  | "workflows.view"
  | "workflows.manage"
  | "clients.manage"
  | "usage.view"
  | "logs.view"
  | "subscription.manage"
  | "settings.admin"
  | "appointments.correct_history";

/**
 * Permissions only a platform operator can hold.
 *
 * `appointments.correct_history` is here deliberately. Ordinary rescheduling
 * may not target the past for anyone, including an owner; correcting a
 * historical record is a distinct, auditable operator capability that does not
 * exist yet. Reserving the permission keeps the door shut rather than ajar.
 */
export const PLATFORM_ONLY: readonly Permission[] = [
  "integrations.view",
  "integrations.manage",
  "workflows.view",
  "workflows.manage",
  "clients.manage",
  "usage.view",
  "logs.view",
  "subscription.manage",
  "settings.admin",
  "appointments.correct_history",
] as const;

const STAFF: Permission[] = [
  "overview.view",
  "appointments.view",
  "appointments.manage",
  "customers.view",
  "conversations.view",
  "calls.view",
];

/** Everything staff can do, plus the analytical and configuration work of running a shift. */
const MANAGER: Permission[] = [...STAFF, "analytics.view", "connections.view", "ai.configure"];

/** Full authority over the business — and nothing beyond it. */
const OWNER: Permission[] = [...MANAGER, "business.edit", "settings.business", "team.manage"];

const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  staff: STAFF,
  manager: MANAGER,
  owner: OWNER,
};

/**
 * A platform operator gets the platform permissions *and* full business access,
 * because supporting a customer means being able to see what they see. That
 * access is still per-workspace and still checked — see `requireMembership`.
 */
const PLATFORM_OPERATOR: readonly Permission[] = [...OWNER, ...PLATFORM_ONLY];

export interface PermissionContext {
  platformRole: PlatformRole;
  /** Null when the user has no membership in the workspace being acted on. */
  workspaceRole: WorkspaceRole | null;
}

/** Every permission this context confers. The single source both sides read. */
export function resolvePermissions({ platformRole, workspaceRole }: PermissionContext): Set<Permission> {
  if (platformRole === "operator") return new Set(PLATFORM_OPERATOR);
  return new Set(workspaceRole ? WORKSPACE_ROLE_PERMISSIONS[workspaceRole] : []);
}

export function can(context: PermissionContext, permission: Permission): boolean {
  return resolvePermissions(context).has(permission);
}

export function canAny(context: PermissionContext, permissions: Permission[]): boolean {
  const granted = resolvePermissions(context);
  return permissions.some((p) => granted.has(p));
}

export function isPlatformOperator(context: Pick<PermissionContext, "platformRole">): boolean {
  return context.platformRole === "operator";
}

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Full control of the business, its receptionist, and its team.",
  manager: "Day-to-day operations, analytics and receptionist behaviour.",
  staff: "Appointments and customer records only.",
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  operator: "Platform operator",
  member: "Business user",
};
