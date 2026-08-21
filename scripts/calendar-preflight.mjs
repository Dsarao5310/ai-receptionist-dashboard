#!/usr/bin/env node
/**
 * Is this deployment ready to talk to the real Google Calendar?
 *
 * ── Why a preflight rather than "just try it" ───────────────────────────────
 * The live OAuth handshake fails in ways that are genuinely hard to read from
 * the outside: a redirect URI that differs by a trailing slash, an encryption
 * key of the wrong length, a client id pasted with whitespace. Each produces an
 * error on Google's screen, or worse a token that stores and then fails to
 * decrypt hours later. Checking the local half first turns those into one clear
 * message before anyone clicks anything.
 *
 * It reads configuration and reports on it. It contacts nothing, and it prints
 * no secret — only whether each is present and structurally sane.
 */

import { readFileSync } from "node:fs";

function loadEnvFile() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .env.local is a legitimate state; the checks below will say so.
  }
}

loadEnvFile();

const checks = [];
const read = (name) => {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

function check(label, ok, detail) {
  checks.push({ label, ok, detail });
}

const mode = read("GOOGLE_CALENDAR_MODE") ?? "(unset — defaults to simulated in development)";
check("GOOGLE_CALENDAR_MODE", mode === "live", `currently: ${mode}`);

const clientId = read("GOOGLE_CALENDAR_CLIENT_ID");
check(
  "GOOGLE_CALENDAR_CLIENT_ID",
  Boolean(clientId),
  clientId
    ? // A shape check, not a value. Google's ids end in this suffix, and a
      // paste that lost characters is a common and confusing failure.
      clientId.endsWith(".apps.googleusercontent.com")
      ? "present, expected shape"
      : "present, but does not end in .apps.googleusercontent.com — check the paste"
    : "missing"
);

const clientSecret = read("GOOGLE_CALENDAR_CLIENT_SECRET");
check("GOOGLE_CALENDAR_CLIENT_SECRET", Boolean(clientSecret), clientSecret ? "present" : "missing");

const redirect = read("GOOGLE_CALENDAR_REDIRECT_URI");
let redirectDetail = "missing";
let redirectOk = false;
if (redirect) {
  try {
    const url = new URL(redirect);
    const rightPath = url.pathname === "/api/admin/calendar/callback";
    // Google refuses http redirect URIs except on localhost.
    const schemeOk = url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    redirectOk = rightPath && schemeOk;
    redirectDetail = rightPath
      ? schemeOk
        ? `${url.origin}${url.pathname} — register this exact string in the Google OAuth client`
        : "must be https, or localhost for a development client"
      : `path must be /api/admin/calendar/callback (found ${url.pathname})`;
  } catch {
    redirectDetail = "not a valid URL";
  }
}
check("GOOGLE_CALENDAR_REDIRECT_URI", redirectOk, redirectDetail);

const key = read("CREDENTIAL_ENCRYPTION_KEY");
let keyOk = false;
let keyDetail = "missing — tokens cannot be stored without it";
if (key) {
  const bytes = Buffer.from(key, "base64");
  keyOk = bytes.length === 32;
  keyDetail = keyOk
    ? "present, decodes to 32 bytes"
    : `decodes to ${bytes.length} bytes; AES-256 needs 32. Generate with: openssl rand -base64 32`;
}
check("CREDENTIAL_ENCRYPTION_KEY", keyOk, keyDetail);

check("AUTH_SECRET", Boolean(read("AUTH_SECRET")), read("AUTH_SECRET") ? "present (also signs OAuth state)" : "missing");
check("DATABASE_URL", Boolean(read("DATABASE_URL")), read("DATABASE_URL") ? "present" : "missing");

const width = Math.max(...checks.map((c) => c.label.length));
console.log("\nGoogle Calendar live-mode preflight\n");
for (const { label, ok, detail } of checks) {
  console.log(`  ${ok ? "ok  " : "MISS"}  ${label.padEnd(width)}  ${detail}`);
}

const failed = checks.filter((c) => !c.ok);
if (failed.length === 0) {
  console.log("\nReady. Sign in as a platform operator and use Connect calendar on /admin/calendar.\n");
  console.log("Scopes requested: calendar.events, calendar.readonly, userinfo.email\n");
  process.exit(0);
}

console.log(`\n${failed.length} item(s) to resolve before a live connection can be attempted.`);
console.log("Automated tests are unaffected: they run against GOOGLE_CALENDAR_MODE=simulated.\n");
process.exit(1);
