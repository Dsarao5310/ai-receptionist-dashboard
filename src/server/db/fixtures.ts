import type { AuditEvent, User, WorkspaceMembership, WorkspaceRecord } from "@/types/identity";

/**
 * Development identity fixtures.
 *
 * These exist so the product can be demonstrated and so the isolation tests
 * have concrete tenants to prove separation between. They are development data,
 * not a weakening of the security model: the guards treat these rows exactly as
 * they will treat database rows, and every test below runs against the same
 * code path a real request takes.
 *
 * The shape is chosen to make cross-tenant mistakes visible:
 *
 *   Alex   — owner of Coastal Bloom, no platform privilege
 *   Priya  — owner of Harbour Dental, no platform privilege
 *   Marcus — manager at Coastal Bloom
 *   Nina   — staff at Coastal Bloom
 *   Sam    — platform operator, member of neither
 *
 * Sam having *no* membership anywhere is the important detail: it proves
 * platform access is granted by `platformRole` and not by quietly enrolling the
 * operator in every workspace.
 */

const NOW = "2026-01-19T09:00:00.000Z";

export const DEV_WORKSPACE_A = "ws_coastal_bloom";
export const DEV_WORKSPACE_B = "ws_harbour_dental";

export const DEV_USERS: User[] = [
  {
    id: "usr_alex",
    name: "Alex Rivera",
    email: "alex@coastalbloom.example",
    avatarUrl: null,
    jobTitle: "Owner",
    platformRole: "member",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "usr_priya",
    name: "Priya Nair",
    email: "priya@harbourdental.example",
    avatarUrl: null,
    jobTitle: "Owner",
    platformRole: "member",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "usr_marcus",
    name: "Marcus Bennett",
    email: "marcus@coastalbloom.example",
    avatarUrl: null,
    jobTitle: "Manager",
    platformRole: "member",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "usr_nina",
    name: "Nina Larsen",
    email: "nina@coastalbloom.example",
    avatarUrl: null,
    jobTitle: "Stylist",
    platformRole: "member",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "usr_sam",
    name: "Sam Fadez",
    email: "sam@receptionist.example",
    avatarUrl: null,
    jobTitle: "Platform operations",
    platformRole: "operator",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const DEV_WORKSPACES: WorkspaceRecord[] = [
  {
    id: DEV_WORKSPACE_A,
    name: "Coastal Bloom Salon",
    slug: "coastal-bloom",
    status: "active",
    subscriptionStatus: "active",
    ownerUserId: "usr_alex",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: DEV_WORKSPACE_B,
    name: "Harbour Dental",
    slug: "harbour-dental",
    status: "trialing",
    subscriptionStatus: "trialing",
    ownerUserId: "usr_priya",
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const DEV_MEMBERSHIPS: WorkspaceMembership[] = [
  {
    id: "mem_alex_a",
    userId: "usr_alex",
    workspaceId: DEV_WORKSPACE_A,
    role: "owner",
    status: "active",
    invitedAt: null,
    joinedAt: NOW,
  },
  {
    id: "mem_marcus_a",
    userId: "usr_marcus",
    workspaceId: DEV_WORKSPACE_A,
    role: "manager",
    status: "active",
    invitedAt: NOW,
    joinedAt: NOW,
  },
  {
    id: "mem_nina_a",
    userId: "usr_nina",
    workspaceId: DEV_WORKSPACE_A,
    role: "staff",
    status: "active",
    invitedAt: NOW,
    joinedAt: NOW,
  },
  {
    id: "mem_priya_b",
    userId: "usr_priya",
    workspaceId: DEV_WORKSPACE_B,
    role: "owner",
    status: "active",
    invitedAt: null,
    joinedAt: NOW,
  },
];

export const DEV_AUDIT: AuditEvent[] = [
  {
    id: "aud_seed_1",
    actorUserId: "usr_alex",
    workspaceId: DEV_WORKSPACE_A,
    action: "business_profile.changed",
    targetType: "configuration",
    targetId: "business",
    timestamp: "2026-08-14T17:20:00.000Z",
    metadata: { field: "hours" },
  },
  {
    id: "aud_seed_2",
    actorUserId: "usr_sam",
    workspaceId: DEV_WORKSPACE_A,
    action: "integration.disconnected",
    targetType: "integration",
    targetId: "google_calendar",
    timestamp: "2026-08-17T16:00:00.000Z",
    metadata: { reason: "authorisation expired" },
  },
];

/**
 * Accounts offered by the development sign-in form.
 *
 * There are no passwords here because there is no password system: this
 * provider is registered only outside production (see `server/auth/config.ts`),
 * and exists so the role and tenancy behaviour can be exercised. A production
 * deployment signs in through Google or an email link and never reaches this
 * list.
 */
export const DEV_SIGN_IN_ACCOUNTS = [
  { email: "alex@coastalbloom.example", label: "Alex Rivera", hint: "Owner — Coastal Bloom Salon" },
  { email: "marcus@coastalbloom.example", label: "Marcus Bennett", hint: "Manager — Coastal Bloom Salon" },
  { email: "nina@coastalbloom.example", label: "Nina Larsen", hint: "Staff — Coastal Bloom Salon" },
  { email: "priya@harbourdental.example", label: "Priya Nair", hint: "Owner — Harbour Dental" },
  { email: "sam@receptionist.example", label: "Sam Fadez", hint: "Platform operator — all workspaces" },
] as const;
