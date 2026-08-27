import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic route protection in front of the application.
 *
 * Proxy checks only whether an Auth.js session cookie is present. It never
 * treats that as authorization: every read and write still verifies the JWT,
 * reloads the user, resolves membership, and checks permission in server code.
 */

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const PUBLIC_PATHS = ["/sign-in", "/api/auth", "/api/health", "/api/internal"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function hasSessionCookie(request: NextRequest): boolean {
  // Auth.js chunks a large JWT into `.0`, `.1`, ... cookies. Presence of any
  // chunk is enough for this optimistic redirect check; guards verify the
  // reconstructed token before granting access.
  return request.cookies.getAll().some(({ name }) =>
    SESSION_COOKIES.some((base) => name === base || name.startsWith(`${base}.`))
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || hasSessionCookie(request)) return NextResponse.next();

  // AUTH_URL is mandatory in production. Using it here prevents an incoming
  // Host header from selecting the origin of a redirect. Development falls
  // back to the local request so `next dev` needs no canonical URL.
  const signIn = new URL("/sign-in", process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? request.url);
  if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${search}`);
  signIn.searchParams.set("reason", "expired");
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
