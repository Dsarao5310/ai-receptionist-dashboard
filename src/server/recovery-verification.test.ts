import { describe, expect, it } from "vitest";
import {
  connectionIdentity,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  validateRecoveryTarget,
} from "../../scripts/recovery-verification-cli";

const disposableRef = "abcdefghijklmnopqrst";
const input = {
  expectedProjectRef: disposableRef,
  confirmation: `VERIFY DISPOSABLE RESTORE ${disposableRef}`,
  runtimeUrl: `postgresql://app_runtime.${disposableRef}:secret@pooler.example.test:6543/postgres`,
  migrationUrl: `postgresql://app_migrator.${disposableRef}:secret@pooler.example.test:5432/postgres`,
};

describe("recovery verification target guard", () => {
  it("accepts only matching recovery roles on a separately confirmed project", () => {
    expect(validateRecoveryTarget(input)).toEqual([]);
  });

  it.each([PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF])("refuses known live project %s", (projectRef) => {
    expect(validateRecoveryTarget({
      ...input,
      expectedProjectRef: projectRef,
      confirmation: `VERIFY DISPOSABLE RESTORE ${projectRef}`,
      runtimeUrl: `postgresql://app_runtime.${projectRef}:secret@pooler.example.test:6543/postgres`,
      migrationUrl: `postgresql://app_migrator.${projectRef}:secret@pooler.example.test:5432/postgres`,
    })).toContain(projectRef === PRODUCTION_SUPABASE_REF
      ? "recovery verification refuses the Production project"
      : "recovery verification refuses the staging project");
  });

  it("rejects an incorrect confirmation, project, or role", () => {
    const problems = validateRecoveryTarget({
      ...input,
      confirmation: "VERIFY SOMETHING ELSE",
      runtimeUrl: "postgresql://postgres.otherprojectrefxyz:secret@pooler.example.test:6543/postgres",
      migrationUrl: `postgresql://postgres.${disposableRef}:secret@pooler.example.test:5432/postgres`,
    });
    expect(problems).toEqual(expect.arrayContaining([
      "--confirm must exactly identify the disposable recovery project",
      "RECOVERY_DATABASE_URL must target the expected disposable project",
      "RECOVERY_DATABASE_URL must authenticate as app_runtime",
      "RECOVERY_MIGRATION_DATABASE_URL must authenticate as app_migrator",
    ]));
  });

  it("parses direct and pooler identities without exposing credentials", () => {
    expect(connectionIdentity(`postgresql://app_runtime:secret@db.${disposableRef}.supabase.co:5432/postgres`))
      .toEqual({ projectRef: disposableRef, role: "app_runtime" });
    expect(connectionIdentity(input.migrationUrl))
      .toEqual({ projectRef: disposableRef, role: "app_migrator" });
    expect(connectionIdentity("not-a-url")).toEqual({ projectRef: null, role: null });
  });
});
