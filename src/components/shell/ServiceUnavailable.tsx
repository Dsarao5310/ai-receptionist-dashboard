import { DatabaseZap } from "lucide-react";

/**
 * Shown when the dashboard cannot reach its own storage.
 *
 * Deliberately not the sign-in page. Sending someone to sign in during an
 * outage tells them their session expired — which is untrue, and offers an
 * action that cannot possibly work. And deliberately not a fallback to
 * generated data: a dashboard that quietly invents a business's numbers when
 * its database is unreachable is worse than one that admits it is broken,
 * because the numbers look real.
 */
export function ServiceUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-danger-bg text-danger">
          <DatabaseZap className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-text-primary">We can&apos;t load your dashboard</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your data is temporarily unreachable. Nothing has been lost — your appointments, customers and
          settings are all still there. Please try again in a moment.
        </p>
        <p className="mt-4 text-xs text-text-muted">
          You are still signed in. This is a problem on our side, not with your account.
        </p>
      </div>
    </main>
  );
}
