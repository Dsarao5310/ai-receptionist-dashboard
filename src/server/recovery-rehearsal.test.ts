import { describe, expect, it } from "vitest";
import { localRehearsalTarget, validateLocalRehearsal } from "../../scripts/recovery-rehearsal-cli";

const localUrl = "postgresql://postgres:secret@127.0.0.1:54322/postgres";

describe("local recovery rehearsal target guard", () => {
  it("accepts an explicitly confirmed loopback database", () => {
    expect(validateLocalRehearsal({
      connection: localUrl,
      confirmation: "REHEARSE LOCAL MIGRATIONS postgres",
      nodeEnv: "development",
    })).toEqual([]);
  });

  it.each([
    "postgresql://postgres:secret@db.jhkbsfsbnynysplvnwca.supabase.co:5432/postgres",
    "postgresql://postgres.jhkbsfsbnynysplvnwca:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres:secret@database.internal:5432/postgres",
  ])("refuses every non-loopback database before connecting: %s", (connection) => {
    expect(validateLocalRehearsal({
      connection,
      confirmation: "REHEARSE LOCAL MIGRATIONS postgres",
      nodeEnv: "development",
    })).toContain("RECOVERY_REHEARSAL_DATABASE_URL must use a loopback host");
  });

  it("refuses production execution and an incorrect database confirmation", () => {
    expect(validateLocalRehearsal({
      connection: localUrl,
      confirmation: "REHEARSE LOCAL MIGRATIONS something_else",
      nodeEnv: "production",
    })).toEqual(expect.arrayContaining([
      "recovery rehearsal is refused in production",
      "--confirm must exactly identify the local rehearsal database",
    ]));
  });

  it("parses local targets without retaining credentials", () => {
    expect(localRehearsalTarget(localUrl)).toEqual({
      database: "postgres",
      hostname: "127.0.0.1",
      protocol: "postgresql:",
    });
    expect(localRehearsalTarget("not-a-url")).toEqual({ database: null, hostname: null, protocol: null });
  });

  it("refuses a non-Postgres loopback URL", () => {
    expect(validateLocalRehearsal({
      connection: "https://127.0.0.1/postgres",
      confirmation: "REHEARSE LOCAL MIGRATIONS postgres",
      nodeEnv: "development",
    })).toContain("RECOVERY_REHEARSAL_DATABASE_URL must be a Postgres connection URL");
  });
});
