export interface LocalRehearsalTarget {
  database: string | null;
  hostname: string | null;
  protocol: string | null;
}

export interface LocalRehearsalInput {
  connection: string;
  confirmation: string;
  nodeEnv?: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function localRehearsalTarget(connection: string): LocalRehearsalTarget {
  try {
    const url = new URL(connection);
    const database = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
    return {
      database: database || null,
      hostname: url.hostname.toLowerCase(),
      protocol: url.protocol.toLowerCase(),
    };
  } catch {
    return { database: null, hostname: null, protocol: null };
  }
}

export function validateLocalRehearsal(input: LocalRehearsalInput): string[] {
  const problems: string[] = [];
  const target = localRehearsalTarget(input.connection);

  if (input.nodeEnv === "production") problems.push("recovery rehearsal is refused in production");
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
    problems.push("RECOVERY_REHEARSAL_DATABASE_URL must be a Postgres connection URL");
  }
  if (!target.hostname || !LOOPBACK_HOSTS.has(target.hostname)) {
    problems.push("RECOVERY_REHEARSAL_DATABASE_URL must use a loopback host");
  }
  if (!target.database) problems.push("RECOVERY_REHEARSAL_DATABASE_URL must name a local database");
  if (target.database && input.confirmation !== `REHEARSE LOCAL MIGRATIONS ${target.database}`) {
    problems.push("--confirm must exactly identify the local rehearsal database");
  }

  return [...new Set(problems)];
}
