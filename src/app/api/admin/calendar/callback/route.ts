import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";
import { serverNow } from "@/server/clock";
import { workspaceScope } from "@/server/db/workspace-scope";
import { consumeState, exchangeCode, storeTokens } from "@/server/integrations/google-calendar/oauth";
import { listCalendars } from "@/server/integrations/google-calendar/client";
import { buildCalendarConfig } from "@/server/integrations/google-calendar/connection";
import { Secret } from "@/server/integrations/credential-store";
import { serverEnv } from "@/server/env";

/**
 * Where Google sends the browser back after consent.
 *
 * ── Three independent checks, none sufficient alone ─────────────────────────
 *   1. **The state is signed and single-use.** A forged state fails the HMAC; a
 *      replayed one finds its row already consumed. Both are refused before any
 *      token is requested.
 *   2. **The workspace comes from the state row.** Not from a query parameter,
 *      not from a cookie the browser could have been made to send. There is no
 *      value in this request a victim's browser could carry that would attach a
 *      calendar to the wrong tenant.
 *   3. **The session is re-authorized for that workspace.** Consent proves
 *      someone controls a Google account. It proves nothing about their
 *      authority here, so `integrations.manage` is checked again — against the
 *      workspace the state names, not against whichever one the session happens
 *      to have selected.
 *
 * Check 3 is what makes the flow safe if a state somehow leaked: an attacker
 * completing it would still need a platform-operator session for that tenant.
 *
 * ── Nothing sensitive is rendered ───────────────────────────────────────────
 * The authorization code is exchanged server-side and never echoed. Tokens go
 * straight into the encrypted secret store. This route returns a redirect, so
 * no token can end up in a page, a URL or a browser history entry.
 */
export const dynamic = "force-dynamic";

/** One destination for every outcome, with a code the admin page can explain. */
function back(request: Request, status: string): NextResponse {
  // In production the canonical origin is validated before the database opens.
  // Never let an incoming Host header choose an OAuth flow's final redirect.
  const url = new URL("/admin/integrations", serverEnv.authUrl ?? request.url);
  url.searchParams.set("calendar", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const now = serverNow();

  // The user pressed "cancel" on Google's screen. Not an error.
  if (params.get("error")) return back(request, "cancelled");

  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) return back(request, "invalid");

  const consumed = await consumeState(state, now);
  if (!consumed.ok) return back(request, "invalid");

  try {
    // Against the workspace the *state* names — the authorized context, not the
    // session's currently-selected workspace.
    const context = await requirePermission("integrations.manage", consumed.workspaceId);

    const tokens = await exchangeCode(code, now);
    await storeTokens(context.workspaceId, tokens);

    // Choose a sensible default so the connection is immediately usable; an
    // administrator can change it afterwards. Primary is the account's own
    // calendar, which is what a small business almost always means.
    const calendars = await listCalendars(new Secret(tokens.accessToken), now);
    const chosen = calendars.ok ? (calendars.value.find((c) => c.primary) ?? calendars.value[0]) : null;

    const scope = workspaceScope(context);
    const record = (await scope.integrations.list()).find((r) => r.provider === "google_calendar");
    if (!record) return back(request, "no_record");

    await scope.integrations.applyPatch(record.id, {
      connection: "connected",
      health: chosen ? "healthy" : "degraded",
      lastCheckedAt: now.toISOString(),
      lastSuccessfulSyncAt: chosen ? now.toISOString() : record.lastSuccessfulSyncAt,
      lastError: null,
      config: buildCalendarConfig({
        // The account label is not read from the token; a later fetch of the
        // userinfo endpoint fills it in. Left null rather than guessed.
        account: null,
        calendarId: chosen?.id ?? null,
        calendarLabel: chosen?.summary ?? null,
        calendarTimeZone: chosen?.timeZone ?? null,
        authorized: true,
      }),
      capabilities: record.capabilities.map((c) => ({ ...c, enabled: true })),
    });

    await scope.integrations.recordEvent({
      provider: "google_calendar",
      type: "connected",
      message: chosen
        ? `Calendar connected and set to ${chosen.summary}.`
        : "Calendar authorised, but no calendar could be listed.",
      severity: chosen ? "info" : "warning",
      occurredAt: now,
    });

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "calendar.connected",
      targetType: "integration",
      targetId: "google_calendar",
      // Identifiers and labels only. `sanitizeMetadata` would drop a
      // credential-shaped key; the real defence is not putting one here.
      metadata: { calendar: chosen?.summary ?? null, timezone: chosen?.timeZone ?? null },
    });

    return back(request, "connected");
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
      return back(request, "forbidden");
    }
    // Token exchange failures land here. The reason is deliberately not put in
    // the URL: it would be readable in the browser history and says more about
    // our configuration than the person needs.
    return back(request, "failed");
  }
}
