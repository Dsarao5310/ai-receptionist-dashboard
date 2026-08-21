import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { availableSignInMethods } from "@/server/auth/config";
import { getAuthenticatedSession } from "@/server/auth/guards";
import { DEV_SIGN_IN_ACCOUNTS } from "@/server/db/fixtures";
import { signInWithGoogle, signInWithDevelopmentAccount } from "@/server/actions/auth";
import { Button } from "@/components/ui/Button";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Sign in.
 *
 * Written for a salon owner, not a developer: no jargon, no provider logos for
 * services they have never heard of, and no GitHub. Google is the production
 * method; email links remain hidden until durable verification tokens exist.
 *
 * The development account list is rendered only when the development provider
 * is registered — which never happens in production, so this block cannot
 * appear in a deployment even if someone reaches the route.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAuthenticatedSession();
  const params = await searchParams;

  // Already signed in: nothing to do here.
  if (session) redirect(safeRedirectPath(params.next));

  const expired = params.reason === "expired";
  const denied = params.reason === "denied";
  const continuation = safeRedirectPath(params.next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-text-on-accent">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">Receptionist AI</h1>
          <p className="mt-1 text-sm text-text-secondary">Sign in to manage your receptionist.</p>
        </div>

        {expired && (
          <p role="status" className="mb-4 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-sm text-text-secondary">
            Your session has ended. Sign in again to pick up where you left off.
          </p>
        )}
        {denied && (
          <p role="status" className="mb-4 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-sm text-text-secondary">
            You do not have access to that page. Sign in with an account that does.
          </p>
        )}

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          {availableSignInMethods.google && (
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={continuation} />
              <Button type="submit" className="w-full">
                Continue with Google
              </Button>
            </form>
          )}

          {!availableSignInMethods.google && !availableSignInMethods.email && (
            <p className="text-sm text-text-secondary">
              Google sign-in is not configured on this deployment yet. Set{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">AUTH_GOOGLE_ID</code> and{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">AUTH_GOOGLE_SECRET</code> to enable it.
            </p>
          )}

          {availableSignInMethods.development && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Development accounts</p>
              <p className="mt-1 text-xs text-text-secondary">
                Local only. This sign-in method is not registered in production builds.
              </p>
              <ul className="mt-3 space-y-1.5">
                {DEV_SIGN_IN_ACCOUNTS.map((account) => (
                  <li key={account.email}>
                    <form action={signInWithDevelopmentAccount}>
                      <input type="hidden" name="email" value={account.email} />
                      <input type="hidden" name="next" value={continuation} />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                      >
                        <span className="block text-sm text-text-primary">{account.label}</span>
                        <span className="block text-xs text-text-muted">{account.hint}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-text-muted">
          Your provider credentials are never stored in this dashboard.
        </p>
      </div>
    </main>
  );
}
