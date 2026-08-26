import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { availableSignInMethods } from "@/server/auth/config";
import { getAuthenticatedSession } from "@/server/auth/guards";
import { DEV_SIGN_IN_ACCOUNTS } from "@/server/db/fixtures";
import { signInWithGoogle, signInWithDevelopmentAccount } from "@/server/actions/auth";
import { Button } from "@/components/ui/Button";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { EmailSignInForm } from "@/features/auth/EmailSignInForm";
import { AppleIcon, GitHubIcon, GoogleIcon } from "@/features/auth/ProviderIcons";

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
  // "reason=denied" comes from this app's own guards (PermissionBoundary);
  // "error=AccessDenied" is Auth.js's own param, set via `pages.error` in
  // server/auth/config.ts whenever the `signIn` callback returns false — an
  // account with no active status or no authorized workspace. Both land here
  // with the same opaque meaning, so both get the same honest, non-specific copy.
  const denied = params.reason === "denied" || params.error === "AccessDenied";
  const continuation = safeRedirectPath(params.next);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-4 py-10">
      {/* A quiet backdrop, not a distraction: two soft accent blooms anchored to
          opposite corners, plus a faint grid — the same restrained, low-chrome
          system the rest of the app uses, just given room to breathe on a page
          with nothing else competing for attention. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-40 -left-32 h-96 w-96 rounded-full opacity-[0.15] blur-3xl"
          style={{ background: "var(--color-accent)" }}
        />
        <div
          className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full opacity-[0.1] blur-3xl"
          style={{ background: "var(--color-accent)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 40%, transparent 90%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-text-on-accent shadow-sm">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-text-primary">Welcome back</h1>
          <p className="mt-1.5 text-sm text-text-secondary">Sign in to manage your AI receptionist.</p>
        </div>

        {expired && (
          <p role="status" className="mb-5 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-sm text-text-secondary">
            Your session has ended. Sign in again to pick up where you left off.
          </p>
        )}
        {denied && (
          <p role="status" className="mb-5 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-sm text-text-secondary">
            That account does not have access. Sign in with one that does, or ask an administrator to add you.
          </p>
        )}

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.12)]">
          <div className="space-y-2.5">
            {availableSignInMethods.google ? (
              <form action={signInWithGoogle}>
                <input type="hidden" name="next" value={continuation} />
                <Button type="submit" variant="secondary" size="lg" className="w-full justify-center gap-2.5 font-medium">
                  <GoogleIcon />
                  Continue with Google
                </Button>
              </form>
            ) : (
              <Button variant="secondary" size="lg" className="w-full justify-center gap-2.5 font-medium" disabled>
                <GoogleIcon />
                Continue with Google
              </Button>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="secondary" size="lg" className="justify-center gap-2" disabled title="Not connected on this deployment yet">
                <GitHubIcon />
                GitHub
              </Button>
              <Button variant="secondary" size="lg" className="justify-center gap-2" disabled title="Not connected on this deployment yet">
                <AppleIcon />
                Apple
              </Button>
            </div>
          </div>

          {!availableSignInMethods.google && (
            <p className="mt-3 text-xs text-text-muted">
              Google sign-in needs{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono">AUTH_GOOGLE_ID</code> and{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono">AUTH_GOOGLE_SECRET</code> configured
              on this deployment.
            </p>
          )}

          <div className="my-5 flex items-center gap-3" role="separator">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-muted">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <EmailSignInForm />

          {availableSignInMethods.development && (
            <div className="mt-6 border-t border-border pt-5">
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

        <p className="mt-6 text-center text-xs text-text-muted">
          Your provider credentials are never stored in this dashboard.
        </p>
      </div>
    </main>
  );
}
