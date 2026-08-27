import nextEnv from "@next/env";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

nextEnv.loadEnvConfig(process.cwd());

const SECRET_NAMES = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_SECRET",
  "EMAIL_SERVER",
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "RECOVERY_REHEARSAL_DATABASE_URL",
  "N8N_REQUEST_SIGNING_SECRET",
  "N8N_WEBHOOK_SIGNING_SECRET",
  "CREDENTIAL_ENCRYPTION_KEY",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SECRET",
];

const roots = [
  { path: path.join(".next", "static"), include: /\.(?:css|html|js|json|map|txt)$/i },
  // Server bundles may legitimately read secrets at runtime. Only rendered
  // page/payload artifacts under this tree are browser-readable.
  { path: path.join(".next", "server", "app"), include: /\.(?:html|rsc|txt)$/i },
  { path: "public", include: /./ },
];

async function filesUnder(root, include) {
  try {
    const info = await stat(root);
    if (info.isFile()) return [root];
  } catch {
    return [];
  }

  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(target, include)));
    else if (entry.isFile() && include.test(entry.name)) found.push(target);
  }
  return found;
}

const configured = SECRET_NAMES
  .map((name) => [name, process.env[name]?.trim()])
  .filter(([, value]) => value && value.length >= 8);

if (configured.length === 0) {
  console.log("Client secret audit skipped: no auditable secret values are present in this environment.");
  process.exit(0);
}

const files = (await Promise.all(roots.map((root) => filesUnder(root.path, root.include)))).flat();
const leaks = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const [name, value] of configured) {
    if (content.includes(value)) leaks.push({ name, file });
  }
}

if (leaks.length > 0) {
  console.error("Secret values were found in client-readable build artifacts:");
  for (const leak of leaks) console.error(`- ${leak.name}: ${leak.file}`);
  process.exitCode = 1;
} else {
  console.log(`Client secret audit passed across ${files.length} artifacts (values were not printed).`);
}
