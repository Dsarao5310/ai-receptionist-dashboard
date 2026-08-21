import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/server/env";
import { getDb, type Sql } from "@/server/db/client";
import { Secret } from "@/server/integrations/credential-store";
import { secretStore } from "@/server/integrations/secret-store";
import { newId } from "@/server/db/ids";

/**
 * Authorising a *workspace's calendar*, which is not the same thing as signing
 * a person in.
 *
 * ── Two different questions, deliberately kept apart ────────────────────────
 *   Auth.js answers: who is using this dashboard?
 *   This file answers: which Google Calendar account has this workspace
 *   authorised us to write to?
 *
 * They are not interchangeable. A platform operator signs in through Auth.js
 * and *then* connects a calendar on a business's behalf; the Google account
 * involved may belong to someone who never logs into this product at all.
 * Merging them — "sign in with Google and we'll use that calendar" — would tie
 * a business's bookings to whichever staff member happened to authenticate, and
 * break the moment they left.
 *
 * ── What protects the handshake ─────────────────────────────────────────────
 * The `state` parameter does three jobs, and needs all three:
 *
 *   • **Signed** (HMAC over the row id) so it cannot be forged. Without this,
 *     anyone could send a victim a callback URL naming *their* workspace and
 *     have the victim's consent attach a calendar to it.
 *   • **Backed by a row** that is consumed on first use, so a captured callback
 *     cannot be replayed.
 *   • **Carrying the workspace only by reference.** The workspace id lives in
 *     the database row, never in the URL. There is no field in the callback a
 *     browser could edit to point the connection at a different tenant — which
 *     is the same rule the inbound webhook boundary follows.
 *
 * The callback additionally re-checks that the returning session still holds
 * `integrations.manage` for that workspace. Consent proves someone owns a
 * Google account; it proves nothing about their authority here.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/**
 * The narrowest scopes that do the job.
 *
 * `calendar.events` allows reading and writing events on calendars the user
 * grants; `calendar.readonly` is what lets an admin *choose* a calendar and
 * read its timezone. Neither allows deleting a calendar or touching a user's
 * contacts, and we ask for nothing broader "in case we need it later" — an
 * unused scope is a permission a business has granted for no reason.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Only to label the connection in the admin UI ("connected as a@b.com").
  "https://www.googleapis.com/auth/userinfo.email",
];

/** How long a consent handshake may stay open. Long enough to read the screen. */
const STATE_TTL_MS = 10 * 60_000;

export const CREDENTIAL_KEYS = {
  refreshToken: "google_refresh_token",
  accessToken: "google_access_token",
} as const;

function stateSecret(): Buffer {
  // Bound to the session secret: an attacker who could forge this could already
  // forge a session, so a separate variable would add a rotation burden without
  // adding protection.
  return Buffer.from(serverEnv.authSecret, "utf8");
}

function signState(id: string): string {
  const mac = createHmac("sha256", stateSecret()).update(id).digest("base64url");
  return `${id}.${mac}`;
}

/** Constant-time, and length-guarded because the caller controls the length. */
function verifyState(state: string): string | null {
  const separator = state.lastIndexOf(".");
  if (separator <= 0) return null;

  const id = state.slice(0, separator);
  const provided = Buffer.from(state.slice(separator + 1), "utf8");
  const expected = Buffer.from(createHmac("sha256", stateSecret()).update(id).digest("base64url"), "utf8");

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

export interface OAuthStartResult {
  authorizationUrl: string;
}

/**
 * Begin a connection. Returns where to send the browser.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google issue a
 * refresh token. Google only sends one on the *first* consent for a given
 * client and account, so a reconnection without `prompt=consent` returns an
 * access token that expires in an hour and no way to renew it — which surfaces
 * days later as a calendar that mysteriously stopped working.
 */
export async function beginOAuth(
  input: { workspaceId: string; userId: string },
  sql: Sql = getDb()
): Promise<OAuthStartResult> {
  const clientId = serverEnv.googleClientId;
  const redirectUri = serverEnv.googleRedirectUri;
  if (!clientId || !redirectUri) {
    throw new Error("Google Calendar OAuth is not configured on this deployment.");
  }

  const id = newId("oas");
  await sql`
    insert into oauth_states (id, workspace_id, provider, created_by, expires_at)
    values (${id}, ${input.workspaceId}, 'google_calendar', ${input.userId},
            ${new Date(Date.now() + STATE_TTL_MS)})`;

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", signState(id));

  return { authorizationUrl: url.toString() };
}

export type StateFailure = "malformed" | "unknown" | "expired" | "already_used";

export type StateResult =
  | { ok: true; workspaceId: string; stateId: string }
  | { ok: false; reason: StateFailure };

/**
 * Verify and consume a callback's state.
 *
 * The update is the consumption: `where consumed_at is null` means two
 * simultaneous submissions of the same callback cannot both succeed, decided by
 * the database rather than by a check the second request could slip past.
 */
export async function consumeState(state: string, now: Date, sql: Sql = getDb()): Promise<StateResult> {
  const id = verifyState(state);
  if (!id) return { ok: false, reason: "malformed" };

  const [row] = await sql`
    update oauth_states set consumed_at = ${now}
    where id = ${id} and consumed_at is null and expires_at > ${now}
    returning workspace_id`;

  if (row) return { ok: true, workspaceId: String(row.workspace_id), stateId: id };

  // Distinguish only for the server's own logs; the route reports one failure.
  const [existing] = await sql`select consumed_at, expires_at from oauth_states where id = ${id}`;
  if (!existing) return { ok: false, reason: "unknown" };
  if (existing.consumed_at) return { ok: false, reason: "already_used" };
  return { ok: false, reason: "expired" };
}

// ── Token exchange ──────────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

/**
 * Exchange or refresh, in one place.
 *
 * Both Google grant types post to the same endpoint with the same client
 * credentials and differ only in two fields, so they share a function — and
 * therefore share one place where a token could be mishandled, rather than two.
 */
async function requestToken(body: Record<string, string>, now: Date): Promise<TokenSet> {
  const clientId = serverEnv.googleClientId;
  const clientSecret = serverEnv.googleClientSecret;
  if (!clientId || !clientSecret) throw new Error("Google Calendar OAuth is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), serverEnv.googleTimeoutMs);

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Google's error body can echo request parameters. Only the status is
      // kept — enough to distinguish "bad grant" from "Google is down", and
      // nothing that could carry a credential into a log.
      throw new OAuthError(response.status === 400 || response.status === 401 ? "invalid_grant" : "provider_error");
    }

    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!payload.access_token) throw new OAuthError("provider_error");

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      // 60 seconds of margin, so a token is never used in the instant it dies.
      expiresAt: new Date(now.getTime() + ((payload.expires_in ?? 3600) - 60) * 1000),
      scope: payload.scope ?? "",
    };
  } catch (error) {
    if (error instanceof OAuthError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new OAuthError("timeout");
    throw new OAuthError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

export class OAuthError extends Error {
  constructor(readonly code: "invalid_grant" | "provider_error" | "timeout" | "unreachable") {
    super(`Google OAuth failed: ${code}`);
    this.name = "OAuthError";
  }
}

export async function exchangeCode(code: string, now: Date): Promise<TokenSet> {
  const redirectUri = serverEnv.googleRedirectUri;
  if (!redirectUri) throw new Error("Google Calendar OAuth is not configured.");

  return requestToken({ code, grant_type: "authorization_code", redirect_uri: redirectUri }, now);
}

export async function refreshAccessToken(refreshToken: Secret, now: Date): Promise<TokenSet> {
  return requestToken({ refresh_token: refreshToken.expose(), grant_type: "refresh_token" }, now);
}

/**
 * Persist a token set for a workspace.
 *
 * A refresh token is only overwritten when Google actually sent one. Refresh
 * responses routinely omit it, and writing `null` over a working refresh token
 * would silently convert a durable connection into one that dies in an hour.
 */
export async function storeTokens(workspaceId: string, tokens: TokenSet): Promise<void> {
  await secretStore.put({
    workspaceId,
    provider: "google_calendar",
    key: CREDENTIAL_KEYS.accessToken,
    value: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  });

  if (tokens.refreshToken) {
    await secretStore.put({
      workspaceId,
      provider: "google_calendar",
      key: CREDENTIAL_KEYS.refreshToken,
      value: tokens.refreshToken,
      expiresAt: null,
    });
  }
}

/**
 * A usable access token, refreshed if needed.
 *
 * The only way calendar code obtains credentials. It never sees the refresh
 * token, and the value it does receive is a `Secret`.
 */
export async function currentAccessToken(workspaceId: string, now: Date): Promise<Secret> {
  const stored = await secretStore.get(workspaceId, "google_calendar", CREDENTIAL_KEYS.accessToken);
  if (stored && stored.expiresAt && stored.expiresAt.getTime() > now.getTime()) return stored.value;

  const refresh = await secretStore.get(workspaceId, "google_calendar", CREDENTIAL_KEYS.refreshToken);
  if (!refresh) throw new OAuthError("invalid_grant");

  const refreshed = await refreshAccessToken(refresh.value, now);
  await storeTokens(workspaceId, refreshed);
  return new Secret(refreshed.accessToken);
}

/**
 * Tell Google to forget us, then forget Google.
 *
 * Revocation is attempted first but its failure does not block the local
 * removal: a business that clicked "disconnect" must end up disconnected even
 * if Google is unreachable, and a token we can no longer use is not one we
 * should keep.
 */
export async function revokeAndForget(workspaceId: string): Promise<{ revokedRemotely: boolean }> {
  const refresh = await secretStore.get(workspaceId, "google_calendar", CREDENTIAL_KEYS.refreshToken);
  let revokedRemotely = false;

  if (refresh && serverEnv.googleCalendarMode === "live") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), serverEnv.googleTimeoutMs);
    try {
      const response = await fetch(GOOGLE_REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refresh.value.expose() }),
        signal: controller.signal,
        cache: "no-store",
      });
      revokedRemotely = response.ok;
    } catch {
      revokedRemotely = false;
    } finally {
      clearTimeout(timer);
    }
  }

  await secretStore.forget(workspaceId, "google_calendar");
  return { revokedRemotely };
}
