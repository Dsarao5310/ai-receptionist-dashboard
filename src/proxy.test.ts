import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

const originalAuthUrl = process.env.AUTH_URL;

afterEach(() => {
  if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = originalAuthUrl;
});

describe("Next.js Proxy", () => {
  it("does not run for static assets", () => {
    // Next 16 renamed the convention to Proxy; the experimental test helper's
    // exported compatibility name still says Middleware in 16.3.1.
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/_next/static/app.js" })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/appointments" })).toBe(true);
  });

  it("leaves Auth.js and machine-authenticated callbacks reachable", () => {
    for (const path of ["/sign-in", "/api/auth/session", "/api/internal/n8n/events", "/api/internal/twilio/sms"]) {
      expect(proxy(new NextRequest(`https://app.example.com${path}`)).headers.get("location"), path).toBeNull();
    }
  });

  it("redirects a signed-out request to the canonical origin and preserves a safe continuation", () => {
    process.env.AUTH_URL = "https://canonical.example.com";
    const response = proxy(new NextRequest("https://attacker.invalid/customers?status=active"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://canonical.example.com");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/customers?status=active");
  });

  it("recognizes both secure and chunked Auth.js session cookies", () => {
    for (const cookie of ["authjs.session-token=value", "__Secure-authjs.session-token.0=chunk"]) {
      const response = proxy(
        new NextRequest("https://app.example.com/customers", { headers: { cookie } })
      );
      expect(response.headers.get("location"), cookie).toBeNull();
    }
  });
});
