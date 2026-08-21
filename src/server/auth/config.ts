import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { identityRepository } from "@/server/db/identity";
import { DEV_SIGN_IN_ACCOUNTS } from "@/server/db/fixtures";
import { resolveSignInUser } from "./identity-flow";

/**
 * Authentication, via Auth.js (NextAuth v5).
 *
 * ── Why this and not something hand-rolled ──────────────────────────────────
 * Session cryptography is the wrong thing to invent. Auth.js is the
 * best-supported option for this stack, it is built for the App Router this app
 * already uses, and it handles the parts that are easy to get subtly wrong:
 * signing and verifying the session, rotating it, expiring it, and defending
 * its own endpoints against CSRF. One auth library, no competing second one.
 *
 * ── Session strategy: JWT in an httpOnly cookie ─────────────────────────────
 * The application database exists, but Auth.js adapter/session tables do not.
 * A signed JWT in a cookie gives a server-verifiable session without coupling
 * identity to tenant storage: the cookie is `httpOnly` (JavaScript cannot read it),
 * `sameSite: lax`, and `secure` in production. Nothing about the session is
 * readable or writable from the browser — the client receives only the narrow
 * `AuthenticatedSession` a server component chooses to pass it.
 *
 * ── What the token carries, and what it deliberately does not ───────────────
 * The token carries `userId` and `platformRole`. It does **not** carry a
 * workspace role, because a role is per-workspace and would go stale the moment
 * someone's membership changed. Workspace roles are looked up from membership
 * on every request, in `guards.ts`. The token is the answer to "who is this",
 * never to "what may they do here".
 *
 * ── Providers ───────────────────────────────────────────────────────────────
 * Google is the production sign-in method. Email magic links are deliberately
 * not registered yet: Auth.js requires an adapter to persist single-use
 * verification tokens, and SMTP variables alone cannot provide that guarantee.
 * A development-only credentials provider stands in meanwhile; see below.
 */

/** True only in a real deployment. Gates the development sign-in path. */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * Development sign-in.
 *
 * This is not a password check — there is no password. It accepts one of the
 * fixture emails and nothing else, and it is **not registered at all in
 * production**, so it cannot be reached by a deployed client even if someone
 * posts to the endpoint. It exists so the role and tenancy behaviour can be
 * exercised before Google or email delivery are configured.
 */
const developmentProvider = Credentials({
  id: "development",
  name: "Development account",
  credentials: { email: { label: "Email", type: "email" } },
  async authorize(credentials) {
    if (IS_PRODUCTION) return null;

    const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
    if (!DEV_SIGN_IN_ACCOUNTS.some((a) => a.email === email)) return null;

    const user = await identityRepository.findUserByEmail(email);
    if (!user || user.status !== "active") return null;

    return { id: user.id, name: user.name, email: user.email, image: user.avatarUrl };
  },
});

export const authConfig: NextAuthConfig = {
  // Auth.js requires a secret to sign the session. A deployment must supply
  // AUTH_SECRET; the fallback exists only so a local dev server starts, and is
  // deliberately not a value anyone could mistake for production-safe.
  secret: process.env.AUTH_SECRET ?? "development-only-insecure-secret-do-not-deploy",

  session: {
    strategy: "jwt",
    // Eight hours: long enough for a working day, short enough that a stolen
    // cookie is not indefinitely useful.
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },

  // Make the cookie contract explicit rather than relying only on URL
  // inference. Local development remains usable over HTTP; every production
  // session cookie is Secure and receives Auth.js's __Secure- prefix.
  useSecureCookies: IS_PRODUCTION,

  // Auth.js requires a trusted host. In production AUTH_URL is mandatory and
  // NextAuth rewrites request origins to that canonical value before Auth.js
  // constructs callbacks, so an incoming Host header cannot choose them.
  trustHost: !IS_PRODUCTION || Boolean(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL),

  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },

  providers: [
    ...(googleConfigured
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID!, clientSecret: process.env.AUTH_GOOGLE_SECRET! })]
      : []),
    ...(IS_PRODUCTION ? [] : [developmentProvider]),
  ],

  callbacks: {
    /**
     * Every successful sign-in resolves to a row in our own user table, whoever
     * the identity provider was. A suspended account is refused here, so the
     * decision is made once rather than in each guard.
     */
    async signIn({ user }) {
      if (!user.email) return false;
      const record = await resolveSignInUser({
        email: user.email,
        name: user.name ?? "",
        avatarUrl: user.image ?? null,
      });
      return record !== null;
    },

    /**
     * Stamp our user id and platform role onto the token.
     *
     * Re-read from the repository rather than trusting whatever was on the
     * previous token: platform privilege can be revoked, and a session should
     * not keep it until expiry.
     */
    async jwt({ token }) {
      const email = typeof token.email === "string" ? token.email : null;
      if (!email) return token;
      const user = await identityRepository.findUserByEmail(email);
      if (!user) {
        // The account no longer exists — strip identity so guards reject it.
        delete token.userId;
        delete token.platformRole;
        return token;
      }
      token.userId = user.id;
      token.platformRole = user.platformRole;
      return token;
    },

    async session({ session, token }) {
      const userId = typeof token.userId === "string" ? token.userId : undefined;
      if (userId) session.user.id = userId;
      return session;
    },
  },
};

/** Which sign-in methods a deployment actually offers, for the sign-in page. */
export const availableSignInMethods = {
  google: googleConfigured,
  email: false,
  development: !IS_PRODUCTION,
};
