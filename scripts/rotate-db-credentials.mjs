/**
 * Rotate the two application-owned Postgres credentials without putting either
 * the old or new value in argv, stdout, source, or shell history.
 *
 * Usage:
 *   node scripts/rotate-db-credentials.mjs inspect
 *   node scripts/rotate-db-credentials.mjs inspect-direct
 *   node scripts/rotate-db-credentials.mjs rotate
 *
 * The script deliberately changes only DATABASE_URL and
 * MIGRATION_DATABASE_URL in .env.local. The provider-secret encryption key is
 * unrelated and is never read or modified here.
 */
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env.local");
const command = process.argv[2] ?? "inspect";
const expected = {
  DATABASE_URL: "app_runtime",
  MIGRATION_DATABASE_URL: "app_migrator",
};

function readLocalEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values.set(match[1], match[2].replace(/^["']|["']$/g, ""));
  }
  return { raw, values };
}

function safeUrlMetadata(value) {
  const url = new URL(value);
  return {
    protocol: url.protocol.replace(":", ""),
    host: url.hostname,
    port: url.port,
    username: decodeURIComponent(url.username),
    database: url.pathname.replace(/^\//, ""),
    password: "REDACTED",
  };
}

function directUrl(value) {
  const url = new URL(value);
  const [role, projectRef] = decodeURIComponent(url.username).split(".", 2);
  if (!role || !projectRef) throw new Error("Pooler username does not include a project reference.");
  url.hostname = `db.${projectRef}.supabase.co`;
  url.port = "5432";
  url.username = role;
  return url.toString();
}

function connection(value, searchPath = "app") {
  return postgres(value, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 20,
    connection: { search_path: searchPath },
    onnotice: () => {},
  });
}

async function roleFacts(url, expectedRole) {
  const sql = connection(url);
  try {
    const [facts] = await sql`
      select
        current_user as current_user,
        session_user as session_user,
        r.rolsuper,
        r.rolinherit,
        r.rolcreaterole,
        r.rolcreatedb,
        r.rolcanlogin,
        r.rolreplication,
        r.rolbypassrls,
        has_schema_privilege(current_user, 'app', 'usage') as app_usage,
        has_schema_privilege(current_user, 'app', 'create') as app_create,
        pg_has_role(current_user, 'app_runtime', 'member') as runtime_member,
        pg_has_role(current_user, 'app_migrator', 'member') as migrator_member,
        (select nspowner = (select oid from pg_roles where rolname = current_user)
           from pg_namespace where nspname = 'app') as owns_app
      from pg_roles r
      where r.rolname = current_user`;
    if (!facts || facts.current_user !== expectedRole || facts.session_user !== expectedRole) {
      throw new Error(`Credential did not resolve to expected role ${expectedRole}.`);
    }
    return facts;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function assertArchitecture(runtime, migrator) {
  const runtimeSafe =
    runtime.current_user === "app_runtime" &&
    runtime.rolcanlogin &&
    !runtime.rolsuper &&
    !runtime.rolcreaterole &&
    !runtime.rolcreatedb &&
    !runtime.rolreplication &&
    !runtime.rolbypassrls &&
    runtime.app_usage &&
    !runtime.app_create &&
    !runtime.migrator_member &&
    !runtime.owns_app;
  const migratorSafe =
    migrator.current_user === "app_migrator" &&
    migrator.rolcanlogin &&
    !migrator.rolsuper &&
    !migrator.rolcreaterole &&
    !migrator.rolcreatedb &&
    !migrator.rolreplication &&
    !migrator.rolbypassrls &&
    migrator.app_usage &&
    migrator.app_create &&
    !migrator.runtime_member &&
    migrator.owns_app;
  if (!runtimeSafe || !migratorSafe) {
    throw new Error("Live role attributes do not match the required least-privilege architecture.");
  }
  return { runtime: runtimeSafe, migrator: migratorSafe };
}

function replaceEnvValue(raw, key, value) {
  const expression = new RegExp(`^(\\s*${key}\\s*=\\s*).*$`, "m");
  if (!expression.test(raw)) throw new Error(`${key} is missing from .env.local.`);
  return raw.replace(expression, (_line, prefix) => `${prefix}${value}`);
}

function newPassword() {
  // base64url is URL-safe, shell-safe, non-dictionary, and still 384 bits.
  return randomBytes(48).toString("base64url");
}

function withPassword(value, password) {
  const url = new URL(value);
  url.password = password;
  return url.toString();
}

async function alterOwnPassword(url, role, password) {
  const sql = connection(url);
  try {
    const [{ current_user: currentUser }] = await sql`select current_user`;
    if (currentUser !== role) throw new Error(`Expected ${role} before rotation.`);
    // The generated password is base64url and therefore cannot contain a quote.
    await sql.unsafe(`alter role ${role} with password '${password}'`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function authenticationWorks(url, expectedRole) {
  const sql = connection(url);
  try {
    const [{ current_user: currentUser }] = await sql`select current_user`;
    return currentUser === expectedRole;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

async function oldCredentialRejected(url) {
  const sql = connection(url);
  try {
    await sql`select current_user`;
    return false;
  } catch (error) {
    // A pooler circuit breaker or network failure is not proof that Postgres
    // rejected this password. Count only an explicit authentication rejection.
    return error?.code === "28P01" || /password authentication failed|authentication failed/i.test(error?.message ?? "");
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

async function verifyRuntimePrivileges(url) {
  const sql = connection(url);
  let createDenied = false;
  let auditUpdateDenied = false;
  let auditDeleteDenied = false;
  try {
    await sql`select id from app.workspaces limit 1`;
    await sql`update app.integration_records set updated_at = updated_at where false`;
    try {
      await sql.unsafe("create table app.__credential_rotation_probe (id integer)");
      await sql.unsafe("drop table if exists app.__credential_rotation_probe");
    } catch (error) {
      createDenied = error?.code === "42501";
    }
    try {
      await sql`update app.audit_events set action = action where false`;
    } catch (error) {
      auditUpdateDenied = error?.code === "42501";
    }
    try {
      await sql`delete from app.audit_events where false`;
    } catch (error) {
      auditDeleteDenied = error?.code === "42501";
    }
    return {
      connect: true,
      read: true,
      writeStatement: true,
      createDenied,
      auditUpdateDenied,
      auditDeleteDenied,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function verifyMigratorPrivileges(url) {
  const sql = connection(url);
  const rollback = new Error("ROLLBACK_PROBE");
  let ddl = false;
  try {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe("create table app.__credential_rotation_probe (id integer)");
        ddl = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    const [{ owns_app: ownsApp }] = await sql`
      select n.nspowner = (select oid from pg_roles where rolname = current_user) as owns_app
      from pg_namespace n where n.nspname = 'app'`;
    return { connect: true, ownsApp, transactionalDdl: ddl };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function filesUnder(root) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

function exposedCopies(secrets) {
  const matches = [];
  const needles = secrets.filter(Boolean).map((value) => Buffer.from(value));
  for (const path of filesUnder(ROOT)) {
    if (statSync(path).size > 50 * 1024 * 1024) continue;
    const body = readFileSync(path);
    if (needles.some((needle) => body.indexOf(needle) !== -1)) {
      matches.push(relative(ROOT, path));
    }
  }
  return [...new Set(matches)].sort();
}

function publicFacts(facts) {
  return {
    role: facts.current_user,
    login: facts.rolcanlogin,
    superuser: facts.rolsuper,
    createRole: facts.rolcreaterole,
    createDatabase: facts.rolcreatedb,
    replication: facts.rolreplication,
    bypassRls: facts.rolbypassrls,
    appUsage: facts.app_usage,
    appCreate: facts.app_create,
    ownsApp: facts.owns_app,
  };
}

async function inspect(useDirect = false) {
  const { values } = readLocalEnv();
  const runtimeUrl = values.get("DATABASE_URL");
  const migratorUrl = values.get("MIGRATION_DATABASE_URL");
  if (!runtimeUrl || !migratorUrl) throw new Error("Both database URLs are required.");
  const checkedRuntimeUrl = useDirect ? directUrl(runtimeUrl) : runtimeUrl;
  const checkedMigratorUrl = useDirect ? directUrl(migratorUrl) : migratorUrl;
  const [runtime, migrator] = await Promise.all([
    roleFacts(checkedRuntimeUrl, expected.DATABASE_URL),
    roleFacts(checkedMigratorUrl, expected.MIGRATION_DATABASE_URL),
  ]);
  const architecture = assertArchitecture(runtime, migrator);
  console.log(JSON.stringify({
    stores: [".env.local"],
    connectionPath: useDirect ? "direct" : "pooler",
    urls: {
      DATABASE_URL: safeUrlMetadata(runtimeUrl),
      MIGRATION_DATABASE_URL: safeUrlMetadata(migratorUrl),
    },
    roles: { runtime: publicFacts(runtime), migrator: publicFacts(migrator) },
    architecture,
  }, null, 2));
}

async function rotate() {
  let { raw, values } = readLocalEnv();
  const oldRuntimeUrl = values.get("DATABASE_URL");
  const oldMigratorUrl = values.get("MIGRATION_DATABASE_URL");
  if (!oldRuntimeUrl || !oldMigratorUrl) throw new Error("Both database URLs are required.");
  const oldRuntimePassword = decodeURIComponent(new URL(oldRuntimeUrl).password);
  const oldMigratorPassword = decodeURIComponent(new URL(oldMigratorUrl).password);
  if (!oldRuntimePassword || !oldMigratorPassword) throw new Error("Both database URLs must contain a password.");

  const oldRuntimeDirectUrl = directUrl(oldRuntimeUrl);
  const oldMigratorDirectUrl = directUrl(oldMigratorUrl);
  const [beforeRuntime, beforeMigrator] = await Promise.all([
    roleFacts(oldRuntimeDirectUrl, "app_runtime"),
    roleFacts(oldMigratorDirectUrl, "app_migrator"),
  ]);
  assertArchitecture(beforeRuntime, beforeMigrator);

  const runtimePassword = newPassword();
  const runtimeUrl = withPassword(oldRuntimeUrl, runtimePassword);
  const runtimeDirectUrl = directUrl(runtimeUrl);
  await alterOwnPassword(oldRuntimeDirectUrl, "app_runtime", runtimePassword);
  raw = replaceEnvValue(raw, "DATABASE_URL", runtimeUrl);
  writeFileSync(ENV_PATH, raw, { encoding: "utf8", mode: 0o600 });

  const migratorPassword = newPassword();
  const migratorUrl = withPassword(oldMigratorUrl, migratorPassword);
  const migratorDirectUrl = directUrl(migratorUrl);
  await alterOwnPassword(oldMigratorDirectUrl, "app_migrator", migratorPassword);
  raw = replaceEnvValue(raw, "MIGRATION_DATABASE_URL", migratorUrl);
  writeFileSync(ENV_PATH, raw, { encoding: "utf8", mode: 0o600 });

  const [runtimeWorks, migratorWorks] = await Promise.all([
    authenticationWorks(runtimeDirectUrl, "app_runtime"),
    authenticationWorks(migratorDirectUrl, "app_migrator"),
  ]);
  if (!runtimeWorks || !migratorWorks) throw new Error("A newly rotated credential could not authenticate.");

  const [runtimePrivileges, migratorPrivileges, afterRuntime, afterMigrator] = await Promise.all([
    verifyRuntimePrivileges(runtimeDirectUrl),
    verifyMigratorPrivileges(migratorDirectUrl),
    roleFacts(runtimeDirectUrl, "app_runtime"),
    roleFacts(migratorDirectUrl, "app_migrator"),
  ]);
  const architecture = assertArchitecture(afterRuntime, afterMigrator);
  // These are deliberately last. Failed-password probes can trigger
  // Supavisor's temporary per-IP circuit breaker, so no valid connection is
  // attempted after them and each retired credential is tried exactly once.
  const oldRuntimeRejected = await oldCredentialRejected(oldRuntimeDirectUrl);
  const oldMigratorRejected = await oldCredentialRejected(oldMigratorDirectUrl);
  const unsafeCopies = exposedCopies([
    oldRuntimeUrl,
    oldMigratorUrl,
    oldRuntimePassword,
    oldMigratorPassword,
  ]);

  const report = {
    runtime: { role: "app_runtime", rotated: true, newCredentialWorks: runtimeWorks, oldCredentialRejected: oldRuntimeRejected },
    migrator: { role: "app_migrator", rotated: true, newCredentialWorks: migratorWorks, oldCredentialRejected: oldMigratorRejected },
    privileges: { runtime: runtimePrivileges, migrator: migratorPrivileges, architecture },
    secretStoresUpdated: [".env.local"],
    unsafeRepositoryCopies: unsafeCopies,
    encryptionMasterKeyChanged: false,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!oldRuntimeRejected || !oldMigratorRejected) {
    throw new Error("A retired credential was not explicitly rejected by Postgres.");
  }
}

try {
  if (command === "inspect") await inspect(false);
  else if (command === "inspect-direct") await inspect(true);
  else if (command === "rotate") await rotate();
  else throw new Error("Expected inspect, inspect-direct, or rotate.");
} catch (error) {
  console.error(`Database credential ${command} failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
