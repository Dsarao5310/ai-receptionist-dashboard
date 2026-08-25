import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "./db/client";
import { hasDatabase, resetTestDatabase, testDb, testMigratorDb } from "@/test/database";
import {
  PRIVACY_MIGRATIONS,
  PRIVACY_PREFLIGHT_TABLES,
  inspectPrivacyPreflightDatabase,
  privacyPreflightConfigurationProblems,
  privacyPreflightDatabaseProblems,
  type PrivacyPreflightDatabaseState,
} from "./privacy-preflight";

const describeDb = hasDatabase ? describe : describe.skip;
let sql: Sql;

const OPTIONS = {
  expectedProjectRef: "jhkbsfsbnynysplvnwca",
  expectedMode: "disabled" as const,
};

function validEnv() {
  return {
    DATABASE_URL:
      "postgresql://app_runtime.jhkbsfsbnynysplvnwca:password@pooler.example.com:6543/postgres",
    PRIVACY_PURGE_MODE: "disabled",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
  };
}

function validDatabaseState(): PrivacyPreflightDatabaseState {
  return {
    currentUser: "app_runtime",
    appliedMigrations: [...PRIVACY_MIGRATIONS],
    tables: PRIVACY_PREFLIGHT_TABLES.map((tableName) => ({
      tableName,
      exists: true,
      canSelect: true,
      canInsert: tableName !== "schema_migrations",
      canUpdate: !["schema_migrations", "call_consent_events"].includes(tableName),
      canDelete: ["workspace_privacy_policies", "call_privacy_state"].includes(tableName),
    })),
  };
}

describe("privacy staging preflight", () => {
  it("accepts an isolated disabled staging target and the least-privilege schema", () => {
    expect(privacyPreflightConfigurationProblems(validEnv(), OPTIONS)).toEqual([]);
    expect(privacyPreflightDatabaseProblems(validDatabaseState())).toEqual([]);
  });

  it("rejects production, a migrator connection, and a non-staging environment", () => {
    const problems = privacyPreflightConfigurationProblems(
      {
        ...validEnv(),
        DATABASE_URL:
          "postgresql://app_migrator.rkzwubwogtezqbuhieuo:password@pooler.example.com:6543/postgres",
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "master",
      },
      { expectedProjectRef: "rkzwubwogtezqbuhieuo", expectedMode: "disabled" }
    );
    expect(problems).toContain("the production Supabase project cannot be used for privacy staging preflight");
    expect(problems).toContain("DATABASE_URL must authenticate as app_runtime");
    expect(problems).toContain("privacy staging preflight requires VERCEL_ENV=preview");
    expect(problems).toContain("privacy staging preflight requires the staging Git branch");
  });

  it("requires a strong dedicated secret only for scheduled mode", () => {
    const weak = privacyPreflightConfigurationProblems(
      { ...validEnv(), PRIVACY_PURGE_MODE: "scheduled", CRON_SECRET: "short" },
      { ...OPTIONS, expectedMode: "scheduled" }
    );
    expect(weak).toContain("scheduled mode requires CRON_SECRET with at least 32 characters");

    const sharedSecret = "shared-secret-that-is-at-least-32-characters";
    const shared = privacyPreflightConfigurationProblems(
      {
        ...validEnv(),
        PRIVACY_PURGE_MODE: "scheduled",
        CRON_SECRET: sharedSecret,
        AUTH_SECRET: sharedSecret,
      },
      { ...OPTIONS, expectedMode: "scheduled" }
    );
    expect(shared).toContain(
      "CRON_SECRET must be dedicated and different from authentication/provider secrets"
    );
  });

  it("reports missing migrations, missing tables, excess grants, and the wrong role", () => {
    const state = validDatabaseState();
    state.currentUser = "app_migrator";
    state.appliedMigrations.pop();
    state.tables = state.tables.filter((row) => row.tableName !== "privacy_purge_lease");
    const consent = state.tables.find((row) => row.tableName === "call_consent_events")!;
    consent.canDelete = true;

    const problems = privacyPreflightDatabaseProblems(state);
    expect(problems).toContain("database session is not using app_runtime");
    expect(problems).toContain(`missing applied privacy migration ${PRIVACY_MIGRATIONS.at(-1)}`);
    expect(problems).toContain("missing app.privacy_purge_lease");
    expect(problems).toContain("app_runtime delete privilege is incorrect for app.call_consent_events");
  });
});

describeDb("privacy staging preflight database inspection", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    const migrator = testMigratorDb();
    try {
      for (const name of PRIVACY_MIGRATIONS) {
        await migrator`
          insert into schema_migrations (name, checksum)
          values (${name}, 'test-harness')
          on conflict (name) do nothing`;
      }
    } finally {
      await migrator.end({ timeout: 5 });
    }
    sql = testDb();
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("inspects the migration ledger and runtime grants inside a read-only transaction", async () => {
    const state = await inspectPrivacyPreflightDatabase(sql);
    expect(state.currentUser).toBe("app_runtime");
    expect(state.appliedMigrations.sort()).toEqual([...PRIVACY_MIGRATIONS].sort());
    expect(privacyPreflightDatabaseProblems(state)).toEqual([]);
  });
});
