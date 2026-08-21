import { describe, expect, it, vi } from "vitest";
import { DEV_USERS, DEV_WORKSPACES } from "@/server/db/fixtures";
import { InMemoryIdentityRepository } from "@/server/db/repository";
import { resolveSignInUser } from "./identity-flow";

vi.mock("server-only", () => ({}));

describe("Auth.js identity resolution", () => {
  it("accepts an active user whose workspace authority comes from membership", async () => {
    const repo = new InMemoryIdentityRepository();
    const user = await resolveSignInUser(
      { email: "alex@coastalbloom.example", name: "Alex Updated", avatarUrl: null },
      repo
    );
    expect(user?.id).toBe("usr_alex");
    expect(user?.platformRole).toBe("member");
  });

  it("does not turn a verified email address into tenant access", async () => {
    const repo = new InMemoryIdentityRepository();
    const user = await resolveSignInUser(
      { email: "stranger@example.com", name: "Stranger", avatarUrl: null },
      repo
    );
    expect(user).toBeNull();
    expect((await repo.findUserByEmail("stranger@example.com"))?.platformRole).toBe("member");
    expect(await repo.listMembershipsForUser((await repo.findUserByEmail("stranger@example.com"))!.id)).toEqual([]);
  });

  it("refuses a suspended account even when a membership exists", async () => {
    const alex = DEV_USERS.find((user) => user.id === "usr_alex")!;
    const repo = new InMemoryIdentityRepository({
      users: [{ ...alex, status: "suspended" }],
      workspaces: DEV_WORKSPACES,
    });
    expect(
      await resolveSignInUser({ email: alex.email, name: alex.name, avatarUrl: null }, repo)
    ).toBeNull();
  });
});
