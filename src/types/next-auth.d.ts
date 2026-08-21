import type { PlatformRole } from "./identity";

/**
 * Auth.js type augmentation.
 *
 * The session token carries identity only — who this is, and whether they
 * operate the platform. Workspace roles are deliberately absent: they belong to
 * a membership, are looked up per request in `server/auth/guards.ts`, and would
 * go stale on a token that outlives a permission change.
 */
declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    platformRole?: PlatformRole;
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export {};
