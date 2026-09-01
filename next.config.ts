import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local dashboard is opened through 127.0.0.1 because another process on
  // this machine owns localhost. Allow that explicit development origin so
  // Next.js can serve client chunks and HMR without weakening production.
  allowedDevOrigins: ["127.0.0.1"],

  // Baseline security headers on every response. This deliberately excludes
  // Content-Security-Policy: a correct CSP needs a careful audit of every
  // legitimate script/style/font/connect source this app uses, and getting
  // it wrong breaks the app rather than hardening it. X-Frame-Options is the
  // narrower, unambiguous substitute for the one thing CSP would otherwise
  // cover here (clickjacking) — this dashboard has no legitimate reason to be
  // framed, same-origin or not.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Empty allowlists, not "off": the browser feature itself is still
          // permitted for the top-level document, just never delegated to
          // anything else. This app never calls any of these three APIs.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Vercel already forces HTTPS at the edge; this header additionally
          // tells the browser to never even attempt HTTP on this origin again,
          // closing the one-time downgrade window HTTPS redirection alone
          // leaves open. Two years, matching Next's own documented default.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
