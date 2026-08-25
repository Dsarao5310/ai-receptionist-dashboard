import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time bearer comparison. Missing or weak configuration fails closed. */
export function verifyCronAuthorization(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length);
  if (provided.length !== secret.length) return false;
  const expectedHash = createHash("sha256").update(secret).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}
