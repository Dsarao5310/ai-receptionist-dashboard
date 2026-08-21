const CANONICAL_ORIGIN = "https://app.invalid";
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

/**
 * Accept a post-authentication continuation only when it is an application
 * path. `redirect()` accepts absolute URLs, so passing a query parameter to it
 * directly turns the sign-in page into an open redirect.
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (CONTROL_OR_BACKSLASH.test(value)) return fallback;

  try {
    const resolved = new URL(value, CANONICAL_ORIGIN);
    if (resolved.origin !== CANONICAL_ORIGIN) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
