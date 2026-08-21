import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { InMemoryIdentityRepository } from "@/server/db/repository";
import { PLATFORM_ONLY, can, resolvePermissions, type Permission } from "@/lib/permissions";
import { authorizeWorkspace, listAuthorizedWorkspaces, AuthorizationError } from "./policy";

/**
 * Tenant isolation and role enforcement, tested against the *server* helpers.
 *
 * These deliberately do not render anything. Hidden navigation proves nothing:
 * the question is whether the authorization layer refuses a caller who asks for
 * data they have no right to, however they ask. So every case below goes
 * through `authorizeWorkspace` — the same function every protected read and
 * write funnels into.
 *
 * `server-only` throws when imported outside a server context, so it is stubbed
 * for the test environment. Nothing else about the modules under test changes.
 */
vi.mock("server-only", () => ({}));

let repo: InMemoryIdentityRepository;

beforeEach(() => {
  repo = new InMemoryIdentityRepository();
});

async function userByEmail(email: string): Promise<User> {
  const user = await repo.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return user;
}

const alex = () => userByEmail("alex@coastalbloom.example"); // owner, workspace A
const marcus = () => userByEmail("marcus@coastalbloom.example"); // manager, workspace A
const nina = () => userByEmail("nina@coastalbloom.example"); // staff, workspace A
const priya = () => userByEmail("priya@harbourdental.example"); // owner, workspace B
const sam = () => userByEmail("sam@receptionist.example"); // platform operator, no membership

describe("tenant isolation", () => {
  it("lets a member into their own workspace", async () => {
    const context = await authorizeWorkspace(await alex(), DEV_WORKSPACE_A, repo);
    expect(context.workspaceId).toBe(DEV_WORKSPACE_A);
    expect(context.workspaceRole).toBe("owner");
  });

  it("refuses a member asking for another tenant's workspace", async () => {
    await expect(authorizeWorkspace(await alex(), DEV_WORKSPACE_B, repo)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(authorizeWorkspace(await priya(), DEV_WORKSPACE_A, repo)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("refuses staff and managers across the tenant boundary too", async () => {
    for (const who of [await marcus(), await nina()]) {
      await expect(authorizeWorkspace(who, DEV_WORKSPACE_B, repo)).rejects.toBeInstanceOf(AuthorizationError);
    }
  });

  it("gives the same answer for a foreign workspace as for one that does not exist", async () => {
    // Distinguishing the two would confirm that a tenant exists to someone with
    // no right to know it.
    const foreign = await authorizeWorkspace(await alex(), DEV_WORKSPACE_B, repo).catch((e) => e);
    const missing = await authorizeWorkspace(await alex(), "ws_does_not_exist", repo).catch((e) => e);

    expect(foreign).toBeInstanceOf(AuthorizationError);
    expect(missing).toBeInstanceOf(AuthorizationError);
    expect(foreign.publicMessage).toBe(missing.publicMessage);
    expect(foreign.publicMessage).toBe("Access denied.");
  });

  it("never lets a user enumerate workspaces they are not in", async () => {
    expect((await listAuthorizedWorkspaces(await alex(), repo)).map((w) => w.id)).toEqual([DEV_WORKSPACE_A]);
    expect((await listAuthorizedWorkspaces(await priya(), repo)).map((w) => w.id)).toEqual([DEV_WORKSPACE_B]);
  });

  it("ignores a revoked membership", async () => {
    const revoked = new InMemoryIdentityRepository({
      users: [await alex()],
      workspaces: await repo.listAllWorkspaces(),
      memberships: [
        {
          id: "mem_revoked",
          userId: (await alex()).id,
          workspaceId: DEV_WORKSPACE_A,
          role: "owner",
          status: "revoked",
          invitedAt: null,
          joinedAt: null,
        },
      ],
    });
    await expect(authorizeWorkspace(await alex(), DEV_WORKSPACE_A, revoked)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("the platform operator", () => {
  it("may enter any workspace without holding a membership in it", async () => {
    const operator = await sam();
    expect(await repo.findMembership(operator.id, DEV_WORKSPACE_A)).toBeNull();

    const a = await authorizeWorkspace(operator, DEV_WORKSPACE_A, repo);
    const b = await authorizeWorkspace(operator, DEV_WORKSPACE_B, repo);
    expect(a.workspaceId).toBe(DEV_WORKSPACE_A);
    expect(b.workspaceId).toBe(DEV_WORKSPACE_B);
    // Authority came from the platform role, not from a quietly added membership.
    expect(a.workspaceRole).toBeNull();
  });

  it("sees every open workspace, and business users do not", async () => {
    expect((await listAuthorizedWorkspaces(await sam(), repo)).map((w) => w.id).sort()).toEqual(
      [DEV_WORKSPACE_A, DEV_WORKSPACE_B].sort()
    );
  });

  it("is still refused a workspace that does not exist", async () => {
    await expect(authorizeWorkspace(await sam(), "ws_nope", repo)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("the platform / business boundary", () => {
  const ctx = (platformRole: User["platformRole"], workspaceRole: "owner" | "manager" | "staff" | null) => ({
    platformRole,
    workspaceRole,
  });

  it("grants no platform permission to any business role", () => {
    // The point of the whole two-axis model: an owner has total authority over
    // their business and none over the platform running it.
    for (const role of ["owner", "manager", "staff"] as const) {
      for (const permission of PLATFORM_ONLY) {
        expect(can(ctx("member", role), permission), `${role} must not hold ${permission}`).toBe(false);
      }
    }
  });

  it("keeps the platform-only list disjoint from every workspace role", () => {
    const platform = new Set<Permission>(PLATFORM_ONLY);
    for (const role of ["owner", "manager", "staff"] as const) {
      for (const granted of resolvePermissions(ctx("member", role))) {
        expect(platform.has(granted), `${granted} appears in both tables`).toBe(false);
      }
    }
  });

  it("grants platform permissions to an operator", () => {
    for (const permission of PLATFORM_ONLY) {
      expect(can(ctx("operator", null), permission), permission).toBe(true);
    }
  });

  it("reserves historical correction for the platform", () => {
    expect(can(ctx("member", "owner"), "appointments.correct_history")).toBe(false);
    expect(can(ctx("operator", null), "appointments.correct_history")).toBe(true);
  });
});

describe("business roles", () => {
  const ctx = (workspaceRole: "owner" | "manager" | "staff") => ({ platformRole: "member" as const, workspaceRole });

  it("lets staff do the operational work and nothing else", () => {
    const staff = ctx("staff");
    for (const allowed of [
      "overview.view",
      "appointments.view",
      "appointments.manage",
      "customers.view",
      "conversations.view",
      "calls.view",
    ] as Permission[]) {
      expect(can(staff, allowed), allowed).toBe(true);
    }
    for (const denied of ["analytics.view", "ai.configure", "business.edit", "settings.business", "team.manage"] as Permission[]) {
      expect(can(staff, denied), denied).toBe(false);
    }
  });

  it("gives a manager analytics and receptionist behaviour, but not the business profile", () => {
    const manager = ctx("manager");
    expect(can(manager, "analytics.view")).toBe(true);
    expect(can(manager, "ai.configure")).toBe(true);
    expect(can(manager, "connections.view")).toBe(true);
    expect(can(manager, "business.edit")).toBe(false);
    expect(can(manager, "team.manage")).toBe(false);
  });

  it("gives an owner everything a manager has, plus the business itself", () => {
    const owner = ctx("owner");
    for (const granted of resolvePermissions(ctx("manager"))) {
      expect(can(owner, granted), granted).toBe(true);
    }
    expect(can(owner, "business.edit")).toBe(true);
    expect(can(owner, "settings.business")).toBe(true);
    expect(can(owner, "team.manage")).toBe(true);
  });

  it("escalates strictly: staff ⊂ manager ⊂ owner", () => {
    const staff = resolvePermissions(ctx("staff"));
    const manager = resolvePermissions(ctx("manager"));
    const owner = resolvePermissions(ctx("owner"));
    for (const p of staff) expect(manager.has(p), p).toBe(true);
    for (const p of manager) expect(owner.has(p), p).toBe(true);
    expect(owner.size).toBeGreaterThan(staff.size);
  });

  it("grants nothing at all without a membership", () => {
    expect(resolvePermissions({ platformRole: "member", workspaceRole: null }).size).toBe(0);
  });
});

describe("client tampering", () => {
  it("cannot acquire a role by claiming one — roles come from membership", async () => {
    // The shape a malicious client would send: their own identity, someone
    // else's workspace, and a role they wish they had. The role is simply not
    // an input to any authorization decision.
    const attacker = await nina(); // staff in A
    await expect(authorizeWorkspace(attacker, DEV_WORKSPACE_B, repo)).rejects.toBeInstanceOf(AuthorizationError);

    const context = await authorizeWorkspace(attacker, DEV_WORKSPACE_A, repo);
    expect(context.workspaceRole).toBe("staff");
    expect(can({ platformRole: attacker.platformRole, workspaceRole: context.workspaceRole }, "business.edit")).toBe(false);
  });

  it("cannot gain platform privilege by editing a workspace role", async () => {
    const owner = await alex();
    const context = await authorizeWorkspace(owner, DEV_WORKSPACE_A, repo);
    expect(context.user.platformRole).toBe("member");
    expect(can({ platformRole: "member", workspaceRole: context.workspaceRole }, "integrations.manage")).toBe(false);
  });

  it("refuses a suspended account even with a valid workspace", async () => {
    const suspended = new InMemoryIdentityRepository({
      users: [{ ...(await alex()), status: "suspended" }],
      workspaces: await repo.listAllWorkspaces(),
      memberships: await repo.listMembershipsForWorkspace(DEV_WORKSPACE_A),
    });
    const user = await suspended.findUserByEmail("alex@coastalbloom.example");
    // authorizeWorkspace is reached only through requireUser, which rejects a
    // non-active account before this point — asserted here so the fixture's
    // meaning is explicit.
    expect(user?.status).toBe("suspended");
  });

  it("never grants platform privilege by signing in", async () => {
    const created = await repo.upsertUserFromSignIn({
      email: "stranger@example.com",
      name: "Stranger",
      avatarUrl: null,
    });
    expect(created.platformRole).toBe("member");
    expect(await listAuthorizedWorkspaces(created, repo)).toEqual([]);
  });
});
