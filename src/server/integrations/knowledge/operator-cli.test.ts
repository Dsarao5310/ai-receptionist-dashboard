import { describe, expect, it, vi } from "vitest";
import type { User, WorkspaceMembership } from "@/types/identity";
import {
  argument,
  connectionMatchesProject,
  positiveLimit,
  resolveActor,
  safePreviewMetadata,
  type ReconciliationActorRepository,
} from "../../../../scripts/knowledge-reconciliation-cli";

const activeOwner: User = {
  id: "usr_owner",
  name: "Owner",
  email: "owner@example.test",
  avatarUrl: null,
  jobTitle: "Owner",
  platformRole: "member",
  status: "active",
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

const activeMembership: WorkspaceMembership = {
  id: "wsm_owner",
  userId: activeOwner.id,
  workspaceId: "ws_expected",
  role: "owner",
  status: "active",
  invitedAt: null,
  joinedAt: "2026-08-27T00:00:00.000Z",
};

function repository(overrides: Partial<ReconciliationActorRepository> = {}): ReconciliationActorRepository {
  return {
    findUserByEmail: vi.fn(async () => activeOwner),
    findUserById: vi.fn(async () => activeOwner),
    listMembershipsForWorkspace: vi.fn(async () => [activeMembership]),
    ...overrides,
  };
}

describe("Knowledge reconciliation operator CLI guards", () => {
  it("parses exact CLI arguments without accepting missing values", () => {
    expect(argument(["--workspace", " ws_expected "], "--workspace")).toBe("ws_expected");
    expect(argument(["--workspace"], "--workspace")).toBe("");
    expect(argument([], "--workspace")).toBe("");
  });

  it("accepts only integer limits from 1 through 100", () => {
    expect(positiveLimit("1")).toBe(1);
    expect(positiveLimit("100")).toBe(100);
    for (const value of ["", "0", "101", "1.5", "not-a-number"]) {
      expect(positiveLimit(value)).toBeNull();
    }
  });

  it("matches the expected Supabase direct host or pooler username only", () => {
    const ref = "expectedref";
    expect(connectionMatchesProject(`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`, ref)).toBe(true);
    expect(connectionMatchesProject(`postgresql://postgres.${ref}:secret@pooler.example.test:6543/postgres`, ref)).toBe(true);
    expect(connectionMatchesProject("postgresql://postgres.other:secret@pooler.example.test:6543/postgres", ref)).toBe(false);
    expect(connectionMatchesProject("not-a-url", ref)).toBe(false);
  });

  it("never falls back to another owner after an invalid explicit actor", async () => {
    const listMembershipsForWorkspace = vi.fn(async () => [activeMembership]);
    const actor = await resolveActor(repository({
      findUserByEmail: vi.fn(async () => null),
      listMembershipsForWorkspace,
    }), "ws_expected", "missing@example.test", true);
    expect(actor).toBeNull();
    expect(listMembershipsForWorkspace).not.toHaveBeenCalled();
  });

  it("skips inactive memberships and inactive users during owner resolution", async () => {
    const inactiveMembership = { ...activeMembership, id: "wsm_inactive", status: "revoked" as const };
    const inactiveUser = { ...activeOwner, id: "usr_inactive", status: "suspended" as const };
    const inactiveOwnerMembership = { ...activeMembership, id: "wsm_suspended", userId: inactiveUser.id };
    const actor = await resolveActor(repository({
      listMembershipsForWorkspace: vi.fn(async () => [inactiveMembership, inactiveOwnerMembership, activeMembership]),
      findUserById: vi.fn(async (id) => id === inactiveUser.id ? inactiveUser : activeOwner),
    }), "ws_expected", "", true);
    expect(actor?.id).toBe(activeOwner.id);
  });

  it("projects only known content-free preview metadata", () => {
    expect(safePreviewMetadata({
      mode: "dry_run",
      limit: 25,
      eligible: 4,
      pending: 4,
      error: 0,
      syncRequired: 0,
      retryable: 4,
      content: "must not escape",
    })).toEqual({
      mode: "dry_run",
      limit: 25,
      eligible: 4,
      pending: 4,
      error: 0,
      syncRequired: 0,
      retryable: 4,
    });
  });
});
