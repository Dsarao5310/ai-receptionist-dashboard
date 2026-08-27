export const PRODUCTION_SUPABASE_REF = "rkzwubwogtezqbuhieuo";
export const STAGING_SUPABASE_REF = "jhkbsfsbnynysplvnwca";

export interface ConnectionIdentity {
  projectRef: string | null;
  role: string | null;
}

export interface RecoveryTargetInput {
  expectedProjectRef: string;
  confirmation: string;
  runtimeUrl: string;
  migrationUrl: string;
}

export function argument(args: string[], name: string): string {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() ?? "" : "";
}

export function connectionIdentity(connection: string): ConnectionIdentity {
  try {
    const url = new URL(connection);
    const [role, poolerRef] = decodeURIComponent(url.username).split(".", 2);
    const direct = /^db\.([a-z]{20})\.supabase\.co$/i.exec(url.hostname)?.[1] ?? null;
    return {
      projectRef: poolerRef?.toLowerCase() ?? direct?.toLowerCase() ?? null,
      role: role?.toLowerCase() ?? null,
    };
  } catch {
    return { projectRef: null, role: null };
  }
}

export function validateRecoveryTarget(input: RecoveryTargetInput): string[] {
  const problems: string[] = [];
  const expected = input.expectedProjectRef.toLowerCase();
  const runtime = connectionIdentity(input.runtimeUrl);
  const migrator = connectionIdentity(input.migrationUrl);

  if (!/^[a-z]{20}$/.test(expected)) problems.push("--expected-project-ref must be a Supabase project reference");
  if (expected === PRODUCTION_SUPABASE_REF) problems.push("recovery verification refuses the Production project");
  if (expected === STAGING_SUPABASE_REF) problems.push("recovery verification refuses the staging project");
  if (input.confirmation !== `VERIFY DISPOSABLE RESTORE ${expected}`) {
    problems.push("--confirm must exactly identify the disposable recovery project");
  }
  if (!runtime.projectRef || runtime.projectRef !== expected) {
    problems.push("RECOVERY_DATABASE_URL must target the expected disposable project");
  }
  if (!migrator.projectRef || migrator.projectRef !== expected) {
    problems.push("RECOVERY_MIGRATION_DATABASE_URL must target the expected disposable project");
  }
  if (runtime.role !== "app_runtime") problems.push("RECOVERY_DATABASE_URL must authenticate as app_runtime");
  if (migrator.role !== "app_migrator") problems.push("RECOVERY_MIGRATION_DATABASE_URL must authenticate as app_migrator");

  return [...new Set(problems)];
}
