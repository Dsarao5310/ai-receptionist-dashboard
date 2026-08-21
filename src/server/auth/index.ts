import NextAuth from "next-auth";
import { authConfig } from "./config";

/**
 * The Auth.js entry points.
 *
 * `auth()` is the only way the rest of the server learns who is making a
 * request. It verifies the signed session cookie; nothing about the caller's
 * identity is ever taken from a header, body or query string.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
