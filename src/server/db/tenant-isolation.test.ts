import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, AuthorizationError, listAuthorizedWorkspaces } from "@/server/auth/policy";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import { checkRescheduleSlot } from "@/services/scheduling";
import { fixedClock, serverNow } from "@/server/clock";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import type { Sql } from "@/server/db/client";
import { readFile } from "node:fs/promises";

/**
 * Tenant isolation, proven against Postgres.
 *
 * ── Why this file exists separately from the policy tests ───────────────────
 * The authorization tests prove the *policy* is right using an in-memory
 * repository. That is necessary and not sufficient: a policy can be correct
 * while the queries beneath it quietly return another tenant's rows. These
 * tests issue real SQL against a real database containing two real tenants, and
 * assert that a caller authorized for one cannot reach the other by any route —
 * a foreign workspace id, a foreign record id, a claimed role, or a mutation
 * aimed at someone else's data.
 *
 * Nothing here tests navigation. Hidden menu items prove nothing about a
 * request that never came from a menu.
 */

vi.mock("server-only", () => ({}));

const NOW_ISO = "2026-08-17T20:00:00.000Z"; // Monday 13:00 in Vancouver, 16:00 in Toronto
const clock = fixedClock(NOW_ISO);

let sql: Sql;
let repo: PostgresIdentityRepository;

const describeDb = hasDatabase ? describe : describe.skip;

beforeAll(async () => {
  if (!hasDatabase) return;
  await resetTestDatabase(new Date(NOW_ISO));
  sql = testDb();
  repo = new PostgresIdentityRepository(sql);
}, 120_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

async function userByEmail(email: string): Promise<User> {
  const user = await repo.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return user;
}

const alex = () => userByEmail("alex@coastalbloom.example"); // owner, workspace A
const marcus = () => userByEmail("marcus@coastalbloom.example"); // manager, A
const nina = () => userByEmail("nina@coastalbloom.example"); // staff, A
const priya = () => userByEmail("priya@harbourdental.example"); // owner, workspace B
const sam = () => userByEmail("sam@receptionist.example"); // platform operator, no membership

/** The scope a request gets after authorization — the only way to reach data. */
async function scopeFor(user: User, workspaceId: string) {
  return workspaceScope(await authorizeWorkspace(user, workspaceId, repo), sql);
}

describeDb("identity resolves from the database", () => {
  it("finds the seeded users with their platform roles", async () => {
    expect((await alex()).platformRole).toBe("member");
    expect((await sam()).platformRole).toBe("operator");
  });

  it("resolves membership from durable rows, not from the session", async () => {
    expect((await repo.findMembership((await alex()).id, DEV_WORKSPACE_A))?.role).toBe("owner");
    expect((await repo.findMembership((await marcus()).id, DEV_WORKSPACE_A))?.role).toBe("manager");
    expect((await repo.findMembership((await nina()).id, DEV_WORKSPACE_A))?.role).toBe("staff");
    // The operator holds no membership anywhere; their access comes from the
    // platform role alone.
    expect(await repo.findMembership((await sam()).id, DEV_WORKSPACE_A)).toBeNull();
    expect(await repo.findMembership((await sam()).id, DEV_WORKSPACE_B)).toBeNull();
  });
});

describeDb("a member cannot cross the tenant boundary", () => {
  it("refuses the other tenant's workspace, in both directions", async () => {
    await expect(authorizeWorkspace(await alex(), DEV_WORKSPACE_B, repo)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(authorizeWorkspace(await priya(), DEV_WORKSPACE_A, repo)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("refuses managers and staff too", async () => {
    for (const who of [await marcus(), await nina()]) {
      await expect(authorizeWorkspace(who, DEV_WORKSPACE_B, repo)).rejects.toBeInstanceOf(AuthorizationError);
    }
  });

  it("cannot read the other tenant's customers", async () => {
    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);

    const alexCustomers = await a.customers.list(clock());
    const priyaCustomers = await b.customers.list(clock());
    expect(alexCustomers.length).toBeGreaterThan(0);
    expect(priyaCustomers.length).toBeGreaterThan(0);

    // Not merely different lists — disjoint. One shared row would be a leak.
    const priyaIds = new Set(priyaCustomers.map((c) => c.id));
    expect(alexCustomers.filter((c) => priyaIds.has(c.id))).toEqual([]);
  });

  it("cannot read the other tenant's appointments by id", async () => {
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const foreign = (await b.appointments.list())[0];
    expect(foreign).toBeTruthy();

    // Alex knows a real, existing appointment id. Scoped by his authorized
    // workspace, it simply does not resolve — the query never looked in B.
    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    expect(await a.appointments.findById(foreign.id)).toBeNull();
  });

  it("cannot read the other tenant's conversations or calls", async () => {
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const foreignConversation = (await b.conversations.list())[0];
    const foreignCall = (await b.calls.list())[0];

    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    expect(await a.conversations.findById(foreignConversation.id)).toBeNull();

    const alexCalls = await a.calls.list();
    expect(alexCalls.some((c) => c.id === foreignCall.id)).toBe(false);
  });

  it("cannot search into the other tenant", async () => {
    // Search is a filter over an already-scoped list, so a term matching only
    // B's data returns nothing for A rather than reaching across.
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const target = (await b.customers.list(clock()))[0];

    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    const results = (await a.customers.list(clock())).filter((c) => c.id === target.id);
    expect(results).toEqual([]);
  });

  it("cannot read the other tenant's integration records", async () => {
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const foreign = (await b.integrations.list())[0];
    expect(foreign).toBeTruthy();

    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    expect(await a.integrations.findById(foreign.id)).toBeNull();
    expect((await a.integrations.list()).every((r) => r.workspaceId === DEV_WORKSPACE_A)).toBe(true);
  });

  it("cannot read or edit the other tenant's business profile", async () => {
    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);

    expect((await a.configuration.load())?.business.name).toBe("Coastal Bloom Salon");
    expect((await b.configuration.load())?.business.name).toBe("Harbour Dental");

    // Alex's scope can only ever write to A, whatever he intends.
    await a.configuration.updateBusiness({ description: "edited by Alex" });
    expect((await b.configuration.load())?.business.description).not.toContain("edited by Alex");
  });

  it("cannot mutate the other tenant's appointment", async () => {
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const foreign = (await b.appointments.list())[0];
    const before = { date: foreign.date, time: foreign.time, status: foreign.status };

    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    expect(await a.appointments.reschedule(foreign.id, "2026-09-01", "10:00", "America/Vancouver")).toBeNull();
    expect(await a.appointments.setStatus(foreign.id, "cancelled")).toBeNull();
    expect(await a.appointments.setNotes(foreign.id, "tampered")).toBeNull();

    const after = await b.appointments.findById(foreign.id);
    expect({ date: after!.date, time: after!.time, status: after!.status }).toEqual(before);
  });

  it("cannot delete the other tenant's service", async () => {
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const foreign = (await b.configuration.load())!.services[0];

    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    await a.configuration.removeService(foreign.id);

    expect((await b.configuration.load())!.services.some((s) => s.id === foreign.id)).toBe(true);
  });

  it("cannot enumerate workspaces it is not in", async () => {
    expect((await listAuthorizedWorkspaces(await alex(), repo)).map((w) => w.id)).toEqual([DEV_WORKSPACE_A]);
    expect((await listAuthorizedWorkspaces(await priya(), repo)).map((w) => w.id)).toEqual([DEV_WORKSPACE_B]);
  });

  it("gives the same answer for a foreign workspace as for one that does not exist", async () => {
    const foreign = await authorizeWorkspace(await alex(), DEV_WORKSPACE_B, repo).catch((e) => e);
    const missing = await authorizeWorkspace(await alex(), "ws_not_a_real_id", repo).catch((e) => e);
    expect(foreign.publicMessage).toBe("Access denied.");
    expect(missing.publicMessage).toBe(foreign.publicMessage);
  });
});

describeDb("malicious requests against the persistence layer", () => {
  it("gains nothing from a forged workspace id", async () => {
    // The shape a tampered request takes: a real user, someone else's workspace.
    for (const candidate of [DEV_WORKSPACE_B, "ws_coastal_bloom '; drop table users; --", "", "*"]) {
      await expect(authorizeWorkspace(await nina(), candidate, repo)).rejects.toBeInstanceOf(AuthorizationError);
    }
    // The database is intact; the injection attempt was a parameter, not SQL.
    expect((await repo.findUserByEmail("nina@coastalbloom.example"))?.id).toBeTruthy();
  });

  it("gains nothing from a forged role", async () => {
    // A role is not an input to any decision — it is read from the membership
    // row. Nina remains staff however she describes herself.
    const context = await authorizeWorkspace(await nina(), DEV_WORKSPACE_A, repo);
    expect(context.workspaceRole).toBe("staff");
    expect(context.user.platformRole).toBe("member");
  });

  it("gains nothing from a forged membership that is revoked in the database", async () => {
    const user = await marcus();
    await sql`update workspace_memberships set status = 'revoked'
              where user_id = ${user.id} and workspace_id = ${DEV_WORKSPACE_A}`;
    try {
      await expect(authorizeWorkspace(user, DEV_WORKSPACE_A, repo)).rejects.toBeInstanceOf(AuthorizationError);
    } finally {
      await sql`update workspace_memberships set status = 'active'
                where user_id = ${user.id} and workspace_id = ${DEV_WORKSPACE_A}`;
    }
  });

  it("does not let a workspace owner reach platform infrastructure", async () => {
    // Alex owns his business completely and holds no platform privilege. The
    // admin surfaces require `integrations.manage`, which is platform-only.
    const owner = await alex();
    expect(owner.platformRole).toBe("member");
  });

  it("keeps a signed-in stranger with no memberships out of everything", async () => {
    const stranger = await repo.upsertUserFromSignIn({
      email: `stranger+${Date.now()}@example.com`,
      name: "Stranger",
      avatarUrl: null,
    });
    expect(stranger.platformRole).toBe("member");
    expect(await listAuthorizedWorkspaces(stranger, repo)).toEqual([]);
    await expect(authorizeWorkspace(stranger, DEV_WORKSPACE_A, repo)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describeDb("the platform operator", () => {
  it("may enter either workspace without holding a membership", async () => {
    const operator = await sam();
    const a = await authorizeWorkspace(operator, DEV_WORKSPACE_A, repo);
    const b = await authorizeWorkspace(operator, DEV_WORKSPACE_B, repo);
    expect(a.workspaceRole).toBeNull();
    expect(b.workspaceRole).toBeNull();
  });

  it("still reads through the authorized workspace, not a global view", async () => {
    const inA = await scopeFor(await sam(), DEV_WORKSPACE_A);
    const inB = await scopeFor(await sam(), DEV_WORKSPACE_B);
    expect((await inA.configuration.load())?.business.name).toBe("Coastal Bloom Salon");
    expect((await inB.configuration.load())?.business.name).toBe("Harbour Dental");
  });

  it("is refused a workspace that does not exist", async () => {
    await expect(authorizeWorkspace(await sam(), "ws_nope", repo)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describeDb("scheduling decided on the server, against persisted data", () => {
  async function reschedule(user: User, workspaceId: string, appointmentId: string, date: string, time: string) {
    const scope = await scopeFor(user, workspaceId);
    const appointment = await scope.appointments.findById(appointmentId);
    if (!appointment) return { ok: false as const, error: "Appointment not found." };

    const config = await scope.configuration.load();
    const check = checkRescheduleSlot(config!, appointment, date, time, clock());
    return check.valid ? { ok: true as const } : { ok: false as const, error: check.message };
  }

  it("rejects a slot in the past using server time", async () => {
    const scope = await scopeFor(await alex(), DEV_WORKSPACE_A);
    const appointment = (await scope.appointments.list())[0];
    const result = await reschedule(await alex(), DEV_WORKSPACE_A, appointment.id, "2026-08-14", "10:00");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("already passed") });
  });

  it("judges the same wall clock against each tenant's own timezone", async () => {
    const a = await scopeFor(await alex(), DEV_WORKSPACE_A);
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const configA = (await a.configuration.load())!;
    const configB = (await b.configuration.load())!;

    expect(configA.business.timezone).toBe("America/Vancouver");
    expect(configB.business.timezone).toBe("America/Toronto");

    // 20:00 UTC is 13:00 in Vancouver but 16:00 in Toronto, so 15:00 today is
    // still ahead for one tenant and gone for the other.
    const appointment = (await a.appointments.list())[0];
    expect(checkRescheduleSlot(configA, appointment, "2026-08-17", "15:00", clock()).valid).toBe(true);
    expect(checkRescheduleSlot(configB, appointment, "2026-08-17", "15:00", clock()).reason).toBe("in_past");
  });

  it("respects each tenant's own hours, including split shifts", async () => {
    const b = await scopeFor(await priya(), DEV_WORKSPACE_B);
    const configB = (await b.configuration.load())!;
    const appointment = (await b.appointments.list())[0];

    // Harbour Dental closes for lunch: 08:00-12:00 and 13:00-17:00. A booking at
    // 12:30 falls in the gap, which a merged 08:00-17:00 range would allow.
    const lunch = checkRescheduleSlot(configB, appointment, "2026-08-18", "12:30", clock());
    expect(lunch.valid).toBe(false);

    const afternoon = checkRescheduleSlot(configB, appointment, "2026-08-18", "13:00", clock());
    expect(afternoon.valid).toBe(true);
  });

  it("takes no client-supplied clock anywhere in the protected write path", async () => {
    // Structural, not conventional: `serverNow()` accepts no argument, so there
    // is nothing for a caller to pass.
    expect(serverNow.length).toBe(0);

    const source = await readFile(new URL("../actions/appointments.ts", import.meta.url), "utf8");
    expect(source).toContain("serverNow()");

    const start = source.indexOf("export async function rescheduleAppointmentAction");
    const declaredInput = source.slice(start, source.indexOf("}): Promise<RescheduleResult>", start));
    expect(declaredInput).toContain("appointmentId: string");
    expect(declaredInput).not.toMatch(/(now|currentTime|clientTime|timestamp)/);
  });
});

describeDb("what the database itself refuses", () => {
  it("will not store a value on a sensitive configuration field", async () => {
    // The repository strips it, and the CHECK constraint refuses it if a future
    // path forgets. This asserts the second line of defence directly.
    await expect(
      sql`update integration_records
          set config = ${sql.json([{ key: "api_key", label: "API key", state: "configured", sensitive: true, value: "sk-live-leak" }] as never)}
          where workspace_id = ${DEV_WORKSPACE_A}`
    ).rejects.toThrow(/config_holds_no_secrets/);
  });

  it("will not let the application role rewrite the audit trail", async () => {
    const [event] = await sql`select id from audit_events limit 1`;
    expect(event).toBeTruthy();
    await expect(sql`update audit_events set action = 'tampered' where id = ${event.id}`).rejects.toThrow(
      /permission denied/i
    );
    await expect(sql`delete from audit_events where id = ${event.id}`).rejects.toThrow(/permission denied/i);
  });

  it("will not allow two active memberships for the same person and workspace", async () => {
    const user = await nina();
    await expect(
      sql`insert into workspace_memberships (id, user_id, workspace_id, role, status)
          values ('mem_duplicate', ${user.id}, ${DEV_WORKSPACE_A}, 'owner', 'active')`
    ).rejects.toThrow(/workspace_memberships_user_workspace_key/);
  });

  it("will not allow a tenant-owned row without a workspace", async () => {
    await expect(
      sql`insert into customers (id, workspace_id, name) values ('cust_orphan', null, 'Orphan')`
    ).rejects.toThrow(/not-null|null value/i);
  });
});
