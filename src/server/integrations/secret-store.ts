import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ProviderId } from "@/types";
import { serverEnv } from "@/server/env";
import { getDb, type Sql } from "@/server/db/client";
import { Secret } from "./credential-store";

/**
 * Where a workspace's provider secrets actually live.
 *
 * ── Why this is not `provider_credentials` ──────────────────────────────────
 * That table was built with no value column on purpose: it records that a
 * credential exists, who configured it and when it rotated, and it is joined
 * against by ordinary admin queries. A refresh token in it would be one careless
 * `select *` away from an API response.
 *
 * OAuth tokens have to be stored somewhere, so they get a table nothing joins
 * against, holding ciphertext and nothing else. Reaching a token requires naming
 * `provider_secrets` explicitly and holding the encryption key — and no
 * repository in the codebase names it. `workspaceScope` does not expose it,
 * which means the usual route to tenant data cannot reach a secret at all.
 *
 * ── Encryption ──────────────────────────────────────────────────────────────
 * AES-256-GCM with a random 96-bit IV per write. GCM rather than CBC because it
 * authenticates: a tampered ciphertext fails to decrypt rather than yielding
 * plausible garbage that gets sent to Google as a token.
 *
 * The key comes from server configuration and is never written to the database.
 * A stolen dump is inert without it. `key_version` is stored beside each row so
 * a key rotation can re-encrypt progressively — the alternative, invalidating
 * every token at once, means asking every business to reconnect.
 *
 * ── What comes back ─────────────────────────────────────────────────────────
 * A `Secret`, never a string. Its `toString`, `toJSON` and Node inspection all
 * render `[redacted]`, so the value cannot reach a log line or a response
 * without someone writing `.expose()`.
 */

const ALGORITHM = "aes-256-gcm";
const CURRENT_KEY_VERSION = 1;

/**
 * The encryption key, validated on first use.
 *
 * Checked for length rather than merely for presence: a 6-character value in
 * this variable would otherwise produce a working AES key by padding and give
 * every token a fraction of the protection it appears to have.
 */
function encryptionKey(): Buffer {
  const configured = serverEnv.credentialEncryptionKey;
  if (!configured) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Provider secrets cannot be stored or read without it."
    );
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes for AES-256; got ${key.length}. ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

/** `iv.tag.ciphertext`, each base64. Self-describing, so decryption needs no side table. */
function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

function decrypt(stored: string): string {
  const [iv, tag, ciphertext] = stored.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored secret is malformed.");

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  // Throws if the ciphertext or the key is wrong — which is the point of GCM.
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export interface StoredSecret {
  value: Secret;
  expiresAt: Date | null;
}

/**
 * Per-workspace secret storage.
 *
 * Every method takes an explicit workspace id, and every caller obtains one from
 * an `AuthContext` — the same rule the repositories follow. There is no
 * "current workspace" here to get wrong.
 */
export class SecretStore {
  /**
   * The connection is resolved per query, not in the constructor.
   *
   * A default argument of `getDb()` would run at construction — and the module
   * exports a singleton, so it would run at *import* time and demand a
   * DATABASE_URL from anything that merely mentions this file, including unit
   * tests that never touch a secret. The same lazy pattern the repositories use.
   */
  constructor(private readonly sqlOverride?: Sql) {}

  private get sql(): Sql {
    return this.sqlOverride ?? getDb();
  }

  async put(input: {
    workspaceId: string;
    provider: ProviderId;
    key: string;
    value: string;
    expiresAt?: Date | null;
  }): Promise<void> {
    await this.sql`
      insert into provider_secrets
        (workspace_id, provider, credential_key, ciphertext, key_version, expires_at)
      values
        (${input.workspaceId}, ${input.provider}, ${input.key}, ${encrypt(input.value)},
         ${CURRENT_KEY_VERSION}, ${input.expiresAt ?? null})
      on conflict (workspace_id, provider, credential_key) do update set
        ciphertext  = excluded.ciphertext,
        key_version = excluded.key_version,
        expires_at  = excluded.expires_at`;
  }

  async get(workspaceId: string, provider: ProviderId, key: string): Promise<StoredSecret | null> {
    const [row] = await this.sql`
      select ciphertext, expires_at from provider_secrets
      where workspace_id = ${workspaceId} and provider = ${provider} and credential_key = ${key}`;
    if (!row) return null;

    return {
      value: new Secret(decrypt(String(row.ciphertext))),
      expiresAt: row.expires_at instanceof Date ? row.expires_at : null,
    };
  }

  /** Which keys exist, for the admin view. Never touches a ciphertext. */
  async describe(workspaceId: string, provider: ProviderId): Promise<{ key: string; expiresAt: Date | null }[]> {
    const rows = await this.sql`
      select credential_key, expires_at from provider_secrets
      where workspace_id = ${workspaceId} and provider = ${provider}
      order by credential_key`;
    return rows.map((row) => ({
      key: String(row.credential_key),
      expiresAt: row.expires_at instanceof Date ? row.expires_at : null,
    }));
  }

  /**
   * Forget a provider's secrets for one workspace.
   *
   * Used by disconnect and by revocation. It removes the *credentials* and
   * nothing else: appointments, their external event mappings and the audit
   * trail all survive, because disconnecting a calendar is not a reason to lose
   * a business's history.
   */
  async forget(workspaceId: string, provider: ProviderId): Promise<void> {
    await this.sql`
      delete from provider_secrets where workspace_id = ${workspaceId} and provider = ${provider}`;
  }
}

export const secretStore = new SecretStore();
