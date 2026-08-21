import { handlers } from "@/server/auth";

/**
 * Auth.js route handlers: sign-in, callback, sign-out, session and CSRF.
 *
 * These endpoints carry Auth.js's own CSRF protection, which is why sign-in and
 * sign-out go through them rather than through bespoke actions.
 */
export const { GET, POST } = handlers;
