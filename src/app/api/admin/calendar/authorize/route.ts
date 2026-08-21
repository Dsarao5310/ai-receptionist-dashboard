import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { beginOAuth } from "@/server/integrations/google-calendar/oauth";
import { serverEnv } from "@/server/env";

/**
 * Start connecting a workspace's calendar.
 *
 * ── Authorization happens here, not at the callback alone ───────────────────
 * `integrations.manage` is platform-only. A business owner, however complete
 * their authority over their own business, cannot begin this flow — provider
 * infrastructure is not theirs to configure. Checking it at the start means an
 * unauthorised user never even reaches Google's consent screen, which is both
 * clearer and avoids them granting access that would then be refused.
 *
 * ── The workspace is taken from the session, never from the URL ─────────────
 * `requirePermission` resolves the *authorized* workspace from the session and
 * a membership lookup. There is no `?workspaceId=` parameter here, and the
 * callback reads its workspace from the state row rather than from anything the
 * browser carries back.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const context = await requirePermission("integrations.manage");

    if (serverEnv.googleCalendarMode !== "live") {
      // Honest refusal rather than a redirect to a Google screen that would
      // fail: without an OAuth client there is nothing to consent to.
      return NextResponse.json(
        { error: "calendar_oauth_unavailable", detail: "This deployment has no Google OAuth client configured." },
        { status: 503 }
      );
    }

    const { authorizationUrl } = await beginOAuth({
      workspaceId: context.workspaceId,
      userId: context.user.id,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}
